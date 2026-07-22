# Observability client (spoke)

Ships this service's request/job/heartbeat events to the central 3B log service
(hosted in **x3b-authorization-server** at `/logs`). The support team + AI worker
query everything there — dashboard at `<auth-server>/logs/admin`.

`client.js` is a drop-in, memory-safe logger. It is intentionally identical
across all 3B repos — update it in one place, copy to the others.

## Wiring (already done in this repo)

- **web** (`index.js`): `app.use(logger.middleware)` right after `cors()`.
  Heartbeats (incl. RSS memory) fire automatically on a timer.
- For any background/worker code, call
  `logger.logJob({ jobId, step, status, durationMs, recordId, error })`.

## Config vars

| Var | Default | Purpose |
|---|---|---|
| `LOG_SERVICE_URL` | — | base URL of the log service, e.g. `https://<auth-server>/logs`. **Unset → logs to console only** (no-op). |
| `LOG_INGEST_KEY` | — | shared write secret (must match the hub) |
| `SERVICE_NAME` | code default | overrides the reported service name |
| `LOG_SAMPLE_RATE` | `1` | fraction of non-error requests to keep (errors always kept) |
| `DYNO_MEMORY_QUOTA_MB` | `512` | dyno RAM quota, for the memory-% calc (set `1024` on a 1GB dyno) |
| `LOG_ENABLED` | `true` | set `false` to disable entirely |

## Safety

The client never blocks a request or job, never throws into the host app, and
never grows memory: the buffer is bounded and drops oldest under pressure (it
records how many it dropped). Safe to run inside an OOMing worker — which is the
whole point.
