# x3b-sf-to-heroku-service

Heroku proxy for **large Salesforce files** (ContentVersion). Client apps (Experience Cloud guest users, LWC/ajax) can't move files >~3 MB through Salesforce's front door, so they go through this service, which talks to the Salesforce REST API with a real session.

## Architecture

```
Client (LWC / guest user)
   │  x-session-key header / sessionKey query param
   ▼
This service (Express, 1 web dyno, Node 20)
   │ 1. GET https://auth.3b4sf.com/getToken?sessionKey=…  → { sessionId, instanceUrl }
   │ 2. Salesforce REST /services/data/v62.0/sobjects/ContentVersion/…
   ▼
Salesforce org
```

- **Auth**: requests exchange an opaque `sessionKey` for a Salesforce session via the external auth server (`services/authorize.js`). Tokens are cached in-memory per sessionKey (TTL ≤ 5 min); on upload the auth call runs in parallel with body parsing.
- **Legacy auth**: old endpoints accept an AES-128-CBC encrypted session id (`sid`) decrypted with `SECRET_KEY`/`IV` env vars (`utils/decryption.js`).
- **Observability**: `observability/client.js` ships sampled request logs + heartbeats to the central log service (`LOG_SERVICE_URL`). Fire-and-forget, bounded buffer.

## Endpoints

| Route | Status | Behavior |
|---|---|---|
| `GET /health` | live | liveness |
| `GET /v1/getFile?contentVersionId&sessionKey` | **current** | streams SF VersionData → client via `pipeline()` |
| `POST /v1/fileUpload` (multipart, headers `x-namespace`, `x-session-key`, `x-title`, `x-first-publish-location-id` \| `x-content-document-id`) | **current** | busboy buffers whole file in memory → multipart POST to SF ContentVersion → optional `shareFile` Apex call (`/apexrest/{ns}/GlobalRemotingRouter`, endp `shareFile`) |
| `GET /v1/file` | legacy | whole file → base64 in JSON |
| `POST /v1/file` (JSON, 50 mb limit) | deprecated | base64 body → SF |

## Files

- `index.js` — app, routes, server timeouts (`keepAliveTimeout=120s` — must exceed Heroku router's 90s; see `.docs/heroku-h27-h28.md`)
- `services/streaming.js` — busboy multipart middleware (buffers file into `req.files[field].fileBuffer`)
- `services/getFile.js` / `services/saveFile.js` — SF REST calls (axios), API v62.0
- `services/authorize.js` — sessionKey → SF session via auth.3b4sf.com
- `.docs/heroku-h27-h28.md` — shipped H27/H28 mitigations and reasoning

## Deploy / config

- Heroku, `Procfile: web: node index.js`, apps `x3b-sf-to-heroku` (+ `-uat`), Node `20.18.x`.
- Env: `PORT`, `SECRET_KEY`, `IV` (legacy sid decryption), `LOG_SERVICE_URL`, `LOG_INGEST_KEY`, `LOG_SAMPLE_RATE`.

## Known constraints & gotchas

- Whole files are held in memory on upload (one copy, capped by `MAX_FILE_SIZE_MB`, default 100). True stream-through to SF needs a known length — see `.docs/2026-07-perf-fixes.md`.
- H27/H28 router warnings are largely client disconnect/idle behavior on large transfers — see `.docs/heroku-h27-h28.md` before "fixing" them again.
- Salesforce multipart ContentVersion POST requires parts named exactly `json` and `VersionData`.
- `.env` was committed in the first commit — treat `SECRET_KEY`/`IV` as needing rotation; never commit it again.
