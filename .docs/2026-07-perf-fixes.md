# July 2026 performance / correctness fixes

Follow-up to `.docs/heroku-h27-h28.md`. Goal: shrink transfer duration (the window in
which clients can abort → H27, or stall → H28) and restore error visibility.

| Change | File | Why |
|---|---|---|
| `catch (error)` referenced undefined `err` — every SF upload failure died as a `ReferenceError` and a generic 500 | `services/saveFile.js` | Restores real Salesforce error messages on the primary write path |
| Upload buffering was O(n²) (`Buffer.concat` per chunk) | `services/streaming.js` | Chunks now collected in an array, one concat at end — no event-loop stalls on large files |
| busboy 1.x signature fixed (`(name, stream, info)`); previously `mimetype`/`encoding` were `undefined`, so files landed in SF with no content type | `services/streaming.js` | Correct MIME type on uploaded ContentVersions |
| busboy `limits` added: 1 file, `MAX_FILE_SIZE_MB` (default 100) → 413 | `services/streaming.js` | CORS is `*` and the proxy is unauthenticated — unbounded bodies were an OOM vector |
| Auth roundtrip now starts while the upload body is still arriving; header validation moved before body parsing (400, not 500) | `index.js` | Removes a serial WAN hop from time-to-first-byte |
| Auth token cache (per sessionKey, TTL = min(expiresIn−60s, 5 min), 500 entries) | `services/authorize.js` | Downloads/uploads no longer pay an auth roundtrip per request |
| Explicit axios timeouts on every outbound call (auth 10s, download headers 30s, legacy download/save 120s, upload 600s, shareFile 30s) | all services | A stalled upstream previously hung forever until the client gave up — booked as H27 |
| Observability middleware now logs `close`-without-`finish` as `aborted: true`, never sampled out | `observability/client.js` | Aborted transfers ARE the H27/H28 population; they were invisible before |
| `.env` untracked; `.env.example` added; `.gitignore` now covers `.env` | repo root | `SECRET_KEY`/`IV` were committed since the first commit — **rotate them** |

Deliberately NOT done:
- **True stream-through upload** (client → SF without buffering): needs a known
  Content-Length for the SF multipart part (e.g. a client-sent `x-file-size` header) or a
  verified bet that SF accepts chunked encoding. Add when files outgrow dyno RAM.
- **Deleting legacy `/v1/file` GET/POST**: confirm zero traffic in router logs first
  (`path` field), then delete — they base64-inflate payloads 33% and block the event loop.
- **Bun/Fastify migration**: evaluated and rejected — H27/H28 are WAN-duration and
  client-behavior driven; framework dispatch time is noise.
