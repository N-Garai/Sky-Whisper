# Open Source Stack

Every load-bearing piece is open source or open weight. This is the audit.

| Layer | Component | License | Role |
|---|---|---|---|
| Ephemeris | [Skyfield](https://rhodesmill.org/skyfield/) | MIT | Sun, Moon, planet positions — the coordinates, computed not guessed |
| Ephemeris data | [JPL SP-Kernel](https://ssd.jpl.nasa.gov/planets/ephemerides.html) DE421/DE440s | Public domain (NASA) | The underlying planetary positions |
| Satellite propagation | [sgp4](https://github.com/skyfielders/python-sgp4) | MIT | TLE → state vector propagation |
| Server | [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) | MIT | HTTP API |
| Schemas | [Pydantic](https://docs.pydantic.dev/) | MIT | Request + snapshot validation |
| Agent harness | [Mastra](https://github.com/mastra-ai/mastra) (`@mastra/core`) | Apache-2.0 | Narration workflow: facts → docent agent → validator |
| Agent schemas | [Zod](https://zod.dev/) | MIT | Mastra tool + workflow contracts |
| HTTP client | [aiohttp](https://docs.aiohttp.org/) | Apache-2.0 | Weather + TLE + TTS calls |
| Frontend | [React](https://react.dev/) 19 | MIT | UI |
| Build | [Vite](https://vite.dev/) + [esbuild](https://esbuild.github.io/) | MIT | Frontend bundle |
| Styling | [Tailwind CSS](https://tailwindcss.com/) v4 | MIT | Design system |
| Animation | [Framer Motion](https://motion.dev/) | MIT | Transitions, ritual progress, scroll reveals |
| 3D background | [Three.js](https://threejs.org/) | MIT | Living deep-space backdrop canvas |
| Testing | [pytest](https://docs.pytest.org/), [astropy](https://www.astropy.org/) | MIT, BSD-3-Clause | Golden-value tests + independent cross-check |

## Data sources

| Source | License | Use |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Free, no API key, non-commercial | Evening cloud cover |
| [CelesTrak](https://celestrak.org/) GP data | Free public data (Dr. T.S. Kelso) | Satellite elements, cached ≤ 24 h |

## Narration model

The default narration mode is a deterministic template — zero external
calls, zero dependencies, and it passes the same anti-hallucination
validator any model output must pass.

The template is the guaranteed path because it needs nothing. When a
Gemma-class open-weight model is configured through a provider, narration
is orchestrated by a Mastra workflow (`src/backend/mastra`: agent +
facts/validator tools, model routed to the hosted endpoint or local
Ollama), and the result passes the same Python validator before audio.
The model never computes coordinates; it receives the finished snapshot.

Model currency: the chain defaults to served, verified IDs — currently
Gemma 4 on the first two rungs (`gemma-4-26b-a4b-it`, then `gemma-4-31b-it`),
`openai/gpt-oss-120b` on Groq, `meta/llama-3.1-8b-instruct` on NVIDIA NIM —
each overridable by environment, each rung carrying a fallback ID for when
providers retire names (which they do, without warning). `OLLAMA_MODEL`
defaults to `gemma4:e2b` for small machines. Verify any new ID with your own
key first: Google documents newer IDs primarily against the native
`:generateContent` API, and OpenAI-compat coverage is not guaranteed.

## Voice

[ElevenLabs](https://elevenlabs.io/) is optional partner technology. When
no key is configured the API returns an honest `audio.available: false`
with the reason, never fabricated audio bytes. No in-product attribution
is currently displayed; verify current terms before shipping a credit line.

## Verification

The open stack is what makes the coordinates checkable. Skyfield's output
was diffed against astropy's independent implementation — see
[accuracy.md](accuracy.md) for the numbers. A closed model guessing at the
sky could not be falsified; this can be, and was.
