# Deployment

## Render (free tier)

`render.yaml` is committed. Render reads it on sync.

**One free web service** serves both the API and the built PWA:

| Item | Value |
|---|---|
| Runtime | Python 3.11 (native — keeps cold starts minimal) |
| Plan | free |
| RAM | 512 MB |
| CPU | 0.1 vCPU |
| Instance hours | 750/month (a month has ≤ 744) |
| Spin-down | after ~15 min of HTTP inactivity |
| Cold start | ~30–60 s |
| Disk | ephemeral |

Build: `pip install -r requirements.txt`, then `cd src/frontend && npm ci && npm run build`, then `cd ../backend/mastra && npm ci && npm run build`.
Start: `uvicorn src.backend.api.routes:app --host 0.0.0.0 --port $PORT`.
Health check: `GET /api/health`.

### Secrets

Set in the Render dashboard, never in git:

- `ELEVENLABS_API_KEY` — optional; without it audio is honestly unavailable
  and the transcript is the deliverable
- `ELEVEN_VOICE_ID` — optional
- `LLM_PROVIDER` — `template` by default

### Cold starts are a product feature

When the instance is asleep, the first request takes up to a minute. The
frontend shows a themed waiting state rather than hiding this, because the
free tier napping is honest. `GET /api/health` is cheap and is pinged on
app load, which warms the instance for someone who is about to prepare.

### Ephemeral storage

`tmp/packs/` does not survive restart, redeploy, or spin-down. This is
deliberate: the product is that you download the pack at home. Pack routes
return `404` after a restart rather than silently regenerating or serving
something stale.

## Docker

A `Dockerfile` and `docker-compose.yml` are included for parity and
self-hosting on any container host. Build with:

```bash
docker build -t skywhisper .
```

Multi-stage: the frontend is compiled in a Node stage and copied into the
Python image.

## Local

```bash
pip install -r requirements.txt
uvicorn src.backend.api.routes:app --host 0.0.0.0 --port 8080
```

```bash
cd src/frontend
npm install
npm run dev      # http://localhost:3000, proxies /api to :8080
```

With no environment variables set, the server runs the deterministic
template narrator with no TTS. Zero external calls.

## Narration providers

The narration layer has two paths, chosen by environment:

| `LLM_PROVIDER` | Behaviour |
|---|---|
| `template` (default) | Deterministic narrator. Zero external calls, zero cost, always available. |
| `openai` | Gemma (or any open-weight model) via an OpenAI-compatible endpoint, orchestrated by the Mastra workflow when Node is present, direct HTTPS otherwise. |
| `ollama` | Local Ollama daemon — fully offline inference. `LOCAL_INFERENCE=true` is equivalent. |

The model never computes a coordinate. It receives the finished snapshot as a
closed set of numbered facts and narrates it. Every number the model utters is
checked against that set; on failure the output is regenerated once and then
discarded in favour of the deterministic narrator. Unvalidated model text is
never served.

## Offline / PWA

The frontend is an installable PWA:

- `public/manifest.webmanifest` — install metadata
- `public/sw.js` — service worker. Precaches the app shell; serves pack audio
  and transcripts stale-while-revalidate, so a pack fetched once at home plays
  in the field with no signal
- Media Session API — lock-screen metadata and hardware playback controls, so
  the screen stays off while listening

To verify offline behaviour: run the server, open it, prepare a pack, then use
DevTools → Application → Service Workers to confirm registration. Throttle the
network to offline and reload — the shell and any fetched pack still load.

## Manual end-to-end check

```bash
# health
curl -s http://127.0.0.1:8080/api/health

# snapshot
curl -s -X POST http://127.0.0.1:8080/api/sky/snapshot \
  -H "Content-Type: application/json" \
  -d '{"latitude":22.5726,"longitude":88.3639,"timestamp":"<ISO-8601 UTC instant>"}'

# full pack (transcript always; audio only with a TTS key)
curl -s -X POST http://127.0.0.1:8080/api/packs \
  -H "Content-Type: application/json" \
  -d '{"latitude":22.5726,"longitude":88.3639,"timestamp":"<ISO-8601 UTC instant>"}'
```

## CI

`.github/workflows/ci.yml` runs on push and pull request: backend tests,
frontend typecheck, frontend build. Tests are hermetic — no network, no
provider keys. The template narrator is the guaranteed path, so CI never
needs credentials.
