/**
 * 3B Observability — drop-in log client.
 *
 * Portable ESM module. Runs unchanged on Bun (x3b-api) and Node 20
 * (auth-server, sf-to-heroku) — both provide global `fetch`, `AbortController`,
 * `setInterval`, and `process.memoryUsage()`.
 *
 * Ships request/job/heartbeat events to the central log service
 * (x3b-authorization-server `/logs`). Design goals, in priority order:
 *   1. NEVER block a request or worker job.
 *   2. NEVER grow memory — the whole point is diagnosing an OOMing worker, so
 *      the logger itself must be strictly bounded. Buffer is capped and drops
 *      oldest under pressure; failed flushes are discarded, not retained.
 *   3. NEVER throw into the host app — every network path is try/caught.
 *
 * Usage:
 *   import { createLogger } from './observability/client.js';
 *   const logger = createLogger({ service: 'x3b-api', kind: 'web' });
 *   app.use(logger.middleware);          // web
 *   logger.logJob({ ... });              // worker
 */

const num = (v, d) => (v == null || Number.isNaN(Number(v)) ? d : Number(v));

export function createLogger(opts = {}) {
    const enabled = opts.enabled ?? (process.env.LOG_ENABLED !== 'false');
    const service = opts.service || process.env.SERVICE_NAME || 'unknown';
    const serviceUrl = (opts.serviceUrl || process.env.LOG_SERVICE_URL || '').replace(/\/+$/, '');
    const ingestKey = opts.ingestKey || process.env.LOG_INGEST_KEY || '';
    const dyno = opts.dyno || process.env.DYNO || 'web.1';
    const kind = opts.kind || (dyno.startsWith('worker') ? 'worker' : 'web');
    const sampleRate = num(opts.sampleRate ?? process.env.LOG_SAMPLE_RATE, 1);
    const flushIntervalMs = num(opts.flushIntervalMs, 5000);
    const heartbeatIntervalMs = num(opts.heartbeatIntervalMs, 30000);
    const maxBuffer = num(opts.maxBuffer, 500);
    const batchSize = num(opts.batchSize, 200);
    const fetchTimeoutMs = num(opts.fetchTimeoutMs, 4000);
    const memoryQuotaMb = num(opts.memoryQuotaMb ?? process.env.DYNO_MEMORY_QUOTA_MB, 512);

    /** @type {object[]} bounded buffer — drop-oldest when full. */
    let buffer = [];
    let dropped = 0;
    let flushing = false;

    const active = enabled && !!serviceUrl;
    if (enabled && !serviceUrl) {
        console.warn('ℹ️  observability: LOG_SERVICE_URL unset — logging to console only.');
    }

    function memSnapshot() {
        let rssMb = null;
        try { rssMb = Math.round((process.memoryUsage().rss / 1048576) * 10) / 10; } catch { /* noop */ }
        const memoryPct = rssMb == null ? null : Math.round((rssMb / memoryQuotaMb) * 1000) / 10;
        return { rssMb, memoryPct };
    }

    function push(entry) {
        if (!active) return;
        if (buffer.length >= maxBuffer) { buffer.shift(); dropped++; }
        buffer.push(entry);
    }

    async function post(path, body, asText = false) {
        if (!serviceUrl) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), fetchTimeoutMs);
        try {
            await fetch(serviceUrl + path, {
                method: 'POST',
                headers: { 'content-type': asText ? 'text/plain' : 'application/json', 'x-log-key': ingestKey, 'x-service': service },
                body: asText ? body : JSON.stringify(body),
                signal: ctrl.signal,
            });
        } catch { /* fire-and-forget: never surface logging failures */ } finally {
            clearTimeout(t);
        }
    }

    async function flush() {
        if (!active || flushing || buffer.length === 0) return;
        flushing = true;
        const batch = buffer.slice(0, batchSize);
        buffer = buffer.slice(batch.length);
        const droppedNow = dropped; dropped = 0;
        if (droppedNow) batch.push({ service, dyno, source: kind, level: 'warn', type: 'log', message: `observability buffer overflow — dropped ${droppedNow} events` });
        try {
            await post('/ingest', { service, entries: batch });
        } finally {
            flushing = false;
        }
    }

    async function heartbeat(extra = {}) {
        const { rssMb, memoryPct } = memSnapshot();
        const uptimeSec = Math.round(process.uptime?.() || 0);
        if (!active) return;
        await post('/heartbeat', { service, dyno, kind, state: 'up', memoryRssMb: rssMb, memoryPct, uptimeSec, ...extra });
    }

    /** Express middleware: one sampled request event per response. Errors always kept. */
    function middleware(req, res, next) {
        const start = Date.now();
        res.on('finish', () => {
            try {
                const isErr = res.statusCode >= 500;
                const isWarn = res.statusCode >= 400 && res.statusCode < 500;
                if (!isErr && Math.random() > sampleRate) return;
                const { rssMb, memoryPct } = memSnapshot();
                push({
                    service, dyno, source: kind,
                    level: isErr ? 'error' : isWarn ? 'warn' : 'info',
                    type: 'request',
                    method: req.method,
                    path: (req.originalUrl || req.url || '').split('?')[0],
                    statusCode: res.statusCode,
                    durationMs: Date.now() - start,
                    requestId: req.id || req.headers?.['x-request-id'] || undefined,
                    recordId: req.body?.recordId || req.headers?.['x-content-document-id'] || undefined,
                    memoryRssMb: rssMb, memoryPct,
                    meta: requestSample(req),
                });
            } catch { /* never break the response */ }
        });
        next();
    }

    /** Record a worker job outcome. */
    function logJob({ jobId, step, status = 'completed', durationMs, recordId, error, level } = {}) {
        const { rssMb, memoryPct } = memSnapshot();
        const isErr = status === 'failed' || !!error;
        push({
            service, dyno, source: 'worker',
            level: level || (isErr ? 'error' : 'info'),
            type: 'job',
            message: `job ${jobId ?? ''} ${step ? '· ' + step : ''} ${status}`.trim(),
            statusCode: isErr ? 1 : 0,
            durationMs,
            recordId,
            errorText: error ? String(error?.stack || error?.message || error).slice(0, 2000) : undefined,
            memoryRssMb: rssMb, memoryPct,
            meta: { jobId, step },
        });
    }

    /** Free-form structured event. */
    function logEvent({ level = 'info', type = 'log', message, ...rest } = {}) {
        const { rssMb, memoryPct } = memSnapshot();
        push({ service, dyno, source: kind, level, type, message, memoryRssMb: rssMb, memoryPct, ...rest });
    }

    let flushTimer = null;
    let beatTimer = null;
    if (active) {
        flushTimer = setInterval(() => { flush(); }, flushIntervalMs);
        beatTimer = setInterval(() => { heartbeat(); }, heartbeatIntervalMs);
        if (flushTimer.unref) flushTimer.unref();
        if (beatTimer.unref) beatTimer.unref();
        heartbeat(); // immediate presence
    }

    async function shutdown() {
        if (flushTimer) clearInterval(flushTimer);
        if (beatTimer) clearInterval(beatTimer);
        await flush();
    }

    return { middleware, logJob, logEvent, heartbeat, flush, shutdown, memSnapshot };
}

/** Small, secret-scrubbed sample of the request for triage — never full bodies. */
function requestSample(req) {
    const out = {};
    const q = req.query || {};
    const keys = Object.keys(q).slice(0, 15);
    if (keys.length) {
        out.query = {};
        for (const k of keys) out.query[k] = /key|secret|token|password|auth|sid|session/i.test(k) ? '[redacted]' : String(q[k]).slice(0, 120);
    }
    if (req.body && typeof req.body === 'object') {
        out.hasSessionKey = !!req.body.sessionKey;
        if (req.body.recordId) out.recordId = String(req.body.recordId).slice(0, 60);
        if (req.body.fileName) out.fileName = String(req.body.fileName).slice(0, 120);
        if (req.body.file?.url) out.fileUrl = String(req.body.file.url).slice(0, 200);
    }
    return Object.keys(out).length ? out : undefined;
}

export default createLogger;
