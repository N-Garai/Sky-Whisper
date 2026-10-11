# Deployment

## Render (free tier)

Deploy with either the `render.yaml` Blueprint or the `Dockerfile` (both
are committed and equivalent in topology: one web service).

**One free web service** serves both the API and the built PWA:

| Item | Value |
|---|---|
| Runtime | Container: Python 3.11-slim + Node 22 (Node runs the Mastra harness only) |
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

Measured steady-state serving footprint is roughly 80–120 MB with headroom
for one model narration at a time; see the memory notes in the architecture
doc. A single uvicorn worker is deliberate — no worker-count multiplier on
512 MB.

### Secrets

Set in the Render dashboard, never in git (all `sync: false` in `render.yaml`):

- `ELEVENLABS_API_KEY` — optional; without it audio is honestly unavailable
  and the transcript is the deliverable
- `ELEVEN_VOICE_ID` — optional
- `LLM_PROVIDER` — `template` (default, $0) · `openai`/`gemma` (hosted chain) · `ollama` (local)
- `GEMMA_API_KEY` — enables chain rungs 1–2
- `GEMMA3_MODEL` / `GEMMA4_MODEL` — rung model overrides
  (`GEMMA_MODEL` still works as the rung-1 fallback)
- `GROQ_API_KEY` / `GROQ_MODEL` — chain rung 3
- `NVIDIA_API_KEY` / `NVIDIA_MODEL` — chain rung 4

### Cold starts are a product feature

When the instance is asleep, the first request takes up to a minute. The
prepare flow shows staged progress rather than hiding this, because the
free tier napping is honest. `GET /api/health` is cheap — curl it once
after a deploy to warm the instance before the first real pack.

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

Multi-stage: the frontend is compiled in a Node 20 stage, the Mastra
harness in a Node 22 stage (its minimum), and both outputs are copied into
the Python image, which also installs a Node 22 runtime. The container
honours the host's `$PORT` (`${PORT:-8080}`), so it works unchanged on
Render, Fly, or plain `docker run -p`.

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

For the full stack locally (model chain + Mastra orchestration), Node 20+
must be on `PATH` with the harness built:

```bash
cd src/backend/mastra
npm ci && npm run build && npm run selftest
```

Without a built harness the backend degrades gracefully to direct HTTPS —
nothing fails, the orchestrator field simply reports `direct`.

## Narration providers

The narration layer runs an ordered fallback chain (first validated
transcript wins; the template narrator is the unbreakable last rung):

| Rung | Provider | Selects with |
|---|---|---|
| 1–2 | Gemini API (Gemma) | `GEMMA_API_KEY` + `GEMMA3_MODEL` / `GEMMA4_MODEL` |
| 3 | Groq (open-weight) | `GROQ_API_KEY` + `GROQ_MODEL` |
| 4 | NVIDIA NIM (open-weight) | `NVIDIA_API_KEY` + `NVIDIA_MODEL` |
| local | Ollama daemon | `LLM_PROVIDER=ollama` (or `LOCAL_INFERENCE=true`) |

Model IDs rot — providers retire them without warning. Each rung carries a
fallback ID tried on 404/410-class errors, per-rung time budgets keep one
slow provider from starving the rest, and every pack records which rung
answered (or why the template did). See [.env.example](../.env.example)
for defaults and the verification notes behind each one.

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
Mastra harness build + selftest, frontend typecheck, frontend build. Tests
are hermetic — no network, no provider keys. The template narrator is the
guaranteed path, so CI never needs credentials.
