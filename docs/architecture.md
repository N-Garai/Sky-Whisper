# Architecture

SkyWhisper turns astronomy into a listening activity. All computation happens
before you go outside; the field artifact is an audio pack, not an app screen.

## Layout

```
src/
├── core/              # Pure astronomy math (no I/O, unit-testable in isolation)
├── backend/           # FastAPI server
│   ├── api/           # Routes: /api/health, /api/sky/snapshot, /api/packs
│   ├── core/          # Skyfield ephemeris → SkySnapshot (+ satellite passes)
│   ├── narration/     # Template narrator, Mastra bridge, anti-hallucination validator
│   ├── mastra/        # Mastra agent harness (facts → docent agent → validate workflow)
│   ├── audio/         # ElevenLabs TTS (honest null when unconfigured)
│   └── services/      # Open-Meteo weather, CelesTrak TLE + SGP4
├── frontend/          # React 19 + Vite + Tailwind v4 + Framer Motion PWA
└── shared/            # Pydantic schemas — request + SkySnapshot contract
```

Application code lives under `src/`. Docs, tests, deployment files, and data
live outside it.

## Request flow

```
client ──POST /api/packs──▶ routes.py
                              │
                              ▼
                    core/astronomy.py      Skyfield ephemeris
                              │            (deterministic, no LLM)
                              ▼
                       SkySnapshot          the single source of truth
                              │
               ┌───────────────┴───────────────┐
               ▼                               ▼
    services/weather.py              narration (orchestrated)
    (best-effort)                    template narrator, always available
    services/satellites.py           Mastra workflow when a model is
    (TLE+SGP4, best-effort)          configured, else direct provider HTTP —
                                     both gated by validate_narration()
              │                               │
              └───────────────┬───────────────┘
                              ▼
                     audio/tts.py            ElevenLabs, or honest null
                              ▼
                        pack JSON + MP3
                              │
                              ▼
                    client Cache Storage / download
```

## Separation of coordinates from narration

The language model never computes a position. `SkySnapshot` is built entirely
by `core/astronomy.py` from Skyfield. Only the finished snapshot reaches the
narrator, and every number the narrator utters is checked against
`snapshot_facts()` by `validate_narration()` before audio is rendered. An
unapproved number or a raw coordinate phrase blocks the script.

## Provider abstraction

`audio/tts.py` returns a `TTSResult` that is honestly unavailable when no key
is set — it never returns fake bytes. Narration has a deterministic template
path that needs zero external services, so the pack always ships.

## Single service

Render's free tier provides one web service. The FastAPI process serves both
`/api/*` and the built PWA from `src/frontend/dist`, so there is exactly one
instance to run and one cold start to absorb.

## Verification

Positions were cross-checked against astropy `get_body()` during development:

| Quantity | SkyWhisper | astropy | Delta |
|---|---|---|---|
| Sun altitude (verification epoch, 22.5726 N) | -73.08° | -73.08° | 0.00° |
| Moon altitude | -45.16° | -45.16° | 0.00° |
| Moon elongation | 35.25° | 35.89° | 0.64° |
| Jupiter altitude | -27.11° | -27.11° | 0.00° |
| Saturn altitude | 69.02° | 69.02° | 0.00° |

The elongation residual comes from the Moon's ~5° ecliptic latitude, which
the 2D ecliptic projection used for phase bucketing ignores. It is far
inside the tolerance for naming a lunar phase, and the illumination fraction
it produces (0.092 vs 0.095) rounds to the same bucket.
