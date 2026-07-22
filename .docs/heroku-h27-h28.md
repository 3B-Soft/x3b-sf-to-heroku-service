# H27 / H28 mitigations

Heroku router errors on this service traced to three things:

| Cause | Fix |
|---|---|
| Node's 5s `keepAliveTimeout` closes a socket the Heroku router is about to reuse → **H27** | `index.js`: `server.keepAliveTimeout = 120000`, `headersTimeout = 125000` (must exceed the router's 90s idle window) |
| `/v1/getFile` used bare `.pipe()` and awaited only `'end'` — a client that hangs up mid-download left the Salesforce stream pumping into a dead socket and the handler never settled → **H27 / H28** | `index.js`: `await pipeline(fileStream, res)`; `ERR_STREAM_PREMATURE_CLOSE` is treated as a normal client disconnect |
| `/v1/fileUpload` — an aborted upload means busboy never emits `finish`, so `next()` never runs and the request hangs until the router kills it → **H28** | `services/streaming.js`: `res.on('close')` unpipes and destroys busboy when the response never finished |

No behaviour change for well-behaved clients. Client disconnects are now silent (they are not server errors) rather than logged as 500s.
