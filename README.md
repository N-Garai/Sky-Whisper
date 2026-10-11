# SkyWhisper

Screenless astronomy. Prepare a narration of tonight's sky at home, download it, then go outside with your phone face-down and listen.

## What it does

You pick a location and time. The server computes exactly what is overhead — Sun, Moon, planets, named stars — using a deterministic ephemeris engine. A narration script is generated from those computed facts and spoken aloud as an audio pack. Outside, you play it with the screen off.

Coordinates are never guessed, and no language model is allowed to compute a position. The model only narrates facts the ephemeris already produced, and every number it utters is checked against that computed set before audio is rendered.

## Architecture

```
src/
├── core/              # Pure astronomy math (no I/O, unit-testable)
├── backend/           # FastAPI server
│   ├── api/           # /api/health, /api/sky/snapshot, /api/packs
│   ├── core/          # Skyfield ephemeris → SkySnapshot (+ satellite passes)
│   ├── narration/     # Template narrator, Mastra bridge + anti-hallucination validator
│   ├── mastra/        # Mastra agent harness (facts → docent agent → validate)
│   ├── audio/         # ElevenLabs TTS, or an honest null
│   └── services/      # Open-Meteo weather, CelesTrak TLE + SGP4
├── frontend/          # React 19 + Vite + Tailwind v4 + Framer Motion PWA
└── shared/            # Pydantic schemas
```

Application code lives in `src/`. Docs, tests, and deployment files live outside it. See [docs/architecture.md](docs/architecture.md).

## Run locally

Backend — one process, serves API and the built frontend:

```bash
pip install -r requirements.txt
uvicorn src.backend.api.routes:app --host 0.0.0.0 --port 8080
```

Frontend dev server:

```bash
cd src/frontend
npm install
npm run dev
```

With no environment variables set, the server uses the deterministic template narrator and no TTS. Zero external calls — it works on a laptop with no internet.

Environment variables are optional. See [.env.example](.env.example):

| Variable | Purpose |
|---|---|
| `ELEVENLABS_API_KEY` | TTS audio. Without it, the transcript is the deliverable |
| `ELEVEN_VOICE_ID` | Voice selection |
| `LLM_PROVIDER` | `template` (default, $0) · `openai`/`gemma` (hosted chain) · `ollama` (local, or `LOCAL_INFERENCE=true`) |
| `GEMMA_API_KEY` / `GEMMA_BASE_URL` | Google AI Studio key + OpenAI-compatible endpoint |
| `GEMMA3_MODEL` / `GEMMA4_MODEL` | Chain rungs 1–2 (defaults: `gemma-3-27b-it`, `gemma-4-26b-a4b-it`; `GEMMA_MODEL` still works as the rung-1 fallback) |
| `GROQ_API_KEY` / `GROQ_MODEL` | Chain rung 3 (default: `openai/gpt-oss-120b`) |
| `NVIDIA_API_KEY` / `NVIDIA_MODEL` | Chain rung 4 (default: `google/gemma-7b`) |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | Local daemon for `LLM_PROVIDER=ollama` |
| `SKYWHISPER_EPHEMERIS` | JPL kernel name (tries the full kernel first, falls back to the packaged kernel when offline) |

## Model chain

Narration runs an ordered fallback chain — first validated transcript wins, template narrator is the unbreakable last rung:

1. Gemini API · Gemma 3 → 2. Gemini API · Gemma 4 → 3. Groq open-weight → 4. NVIDIA NIM → 5. template

Each rung is tried through the Mastra workflow first, then direct HTTPS. Every number is validated against the computed snapshot; length is retried once, then accepted within a wide sanity band. Each pack records which rung answered (`narration.provider`, `orchestrator`, `generation`) so the UI can say exactly what narrated it — or why the template did.

## Voice control

A floating mic button enables hands-free control (Web Speech API — free, no key; screen-on listening, screen-off playback):

- **Wake:** "hey whisper" opens a command window
- **Describe:** "describe the sky", "how is it looking outside", "what's above me", "tell me about tonight" — generates (or replays) the pack and plays it
- **Replay / pause / play / louder / quieter** work by voice; anything else substantial goes to the agent as a spoken answer with conversation memory
- **Typed follow-ups** work in the same panel on browsers without mic support

**Dark compass:** from any pack, "Point at the Sky" opens a pure-black overlay (OLED-dark) where the compass, vibration, and rising pitch guide your aim onto any visible body, with a spoken confirmation on lock. Screen-on is required — mobile browsers suspend sensors and audio capture on lock, so this is output-only by platform design.

## Mastra harness

`src/backend/mastra` (Apache-2.0) orchestrates model narration: a docent agent with real tools (`get-sky-snapshot` over localhost, `get-body-direction` for any named body, plus format/validate), a facts → narrate → validate workflow, per-rung endpoint pinning, and a zod narration envelope. The agent receives coordinates only and must call tools for positions — the trace shows genuine tool use. Build and self-test:

```bash
cd src/backend/mastra
npm ci && npm run build && npm run selftest
```

## Deploy

Render reads [render.yaml](render.yaml) — one free web service, 512 MB / 0.1 CPU / 750 instance-hours per month, serving the API and the built PWA from the same process. Set secrets in the dashboard, never in git. See [docs/deployment.md](docs/deployment.md).

A `Dockerfile` and `docker-compose.yml` are included for parity and self-hosting.

## Accuracy

Positions were cross-checked against astropy's independent implementation. All agreed to 0.00° except the Moon's elongation (0.64°, from its ecliptic latitude). Full table and method in [docs/accuracy.md](docs/accuracy.md).

Twilight bands follow USNO conventions. Moon illumination is `(1 − cos E) / 2` from the Sun–Moon elongation. Directions are spoken as fist-widths (1 fist ≈ 10°) and compass names — never raw coordinates.

## Tests

```bash
python -m pytest tests/ -q
```

121 tests: pure astronomy math, snapshot and narration validation (including anti-hallucination rejection), chain fallthrough and stage degradation, satellite propagation, Mastra bridge contract and orchestration order, voice endpoint behavior, and HTTP integration (including the SSE pack stream). The suite is hermetic — no network, no provider keys.

## Docs

- [architecture.md](docs/architecture.md) — layout and request flow
- [api.md](docs/api.md) — endpoint reference
- [accuracy.md](docs/accuracy.md) — verification method and cross-check table
- [deployment.md](docs/deployment.md) — Render, Docker, local
- [submission.md](docs/submission.md) — publishing checklist and verified partner links
- [stack.md](docs/stack.md) — every dependency and its license
- [privacy.md](docs/privacy.md) — what leaves your device
- [development-log.md](docs/development-log.md) — bugs found and fixed

## Safety

Do not walk while listening. Stay away from roads, water, cliffs, and traffic. This is an astronomy companion, not a navigation tool.

## License

MIT. See [LICENSE](LICENSE).
