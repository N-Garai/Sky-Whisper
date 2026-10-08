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
| `LLM_PROVIDER` | Narration mode: `template` (default, $0), `openai` (Gemma via any OpenAI-compatible endpoint), or `ollama` (local) |
| `GEMMA_BASE_URL` / `GEMMA_API_KEY` / `GEMMA_MODEL` | Endpoint, key, and open-weight model for `LLM_PROVIDER=openai` |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | Local daemon for `LLM_PROVIDER=ollama` (or `LOCAL_INFERENCE=true`) |
| `SKYWHISPER_EPHEMERIS` | JPL kernel name (tries the full kernel first, falls back to the packaged kernel when offline) |

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

87 tests: pure astronomy math, snapshot and narration validation (including anti-hallucination rejection), satellite propagation and degradation, Mastra bridge contract and orchestration order, and HTTP integration. The suite is hermetic — no network, no provider keys.

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
