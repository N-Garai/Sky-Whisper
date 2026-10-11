# Privacy

SkyWhisper is designed so that location data stays as close to you as possible.

## What leaves your device

| Data | Where it goes | Stored? |
|---|---|---|
| Latitude, longitude | The server, to compute the sky | In-memory only, for the pack |
| Request timestamp | The server | Same |
| Computed sky facts (positions, phases, no raw location beyond the above) | A configured model provider (Gemini, Groq, NVIDIA, or local Ollama), only when model narration is enabled | Subject to that provider's terms; SkyWhisper stores nothing |
| Narration text | ElevenLabs, only when TTS is configured | See their terms |
| Voice question + recent exchange | The model chain, only when a voice question is asked | Same as narration text |
| Spoken audio (mic) | The browser's speech recognition engine, only while listening | Browser/vendor behaviour; see below |
| Rounded coordinates | Open-Meteo, fetched server-side for cloud cover (CelesTrak satellite data is a static file fetch carrying no location) | Not stored; subject to Open-Meteo's terms |

The server computes the snapshot, builds the pack, and holds it in ephemeral
storage (`tmp/packs/`, gitignored). That directory is not a database — it does not
survive a restart, a redeploy, or a spin-down.

## What is never stored

- No location history. No user accounts. No identifiers.
- No analytics, no fingerprinting, no tracking pixels.
- No logs of coordinates, prompts, or audio content. The server logs
  request timings and errors, not payloads.

## Self-hosting

Because the whole thing is one Python process, you can run it on your own
machine and keep your location entirely off third-party infrastructure:

```bash
pip install -r requirements.txt
uvicorn src.backend.api.routes:app --host 127.0.0.1 --port 8080
```

With neither a model key nor `ELEVENLABS_API_KEY` set, nothing leaves your
network at all — the narration is generated locally by the deterministic
template narrator, and the transcript is the deliverable. Setting any
provider key opts that leg of the pipeline into that provider's terms;
the defaults are all empty. See [.env.example](../.env.example) for the
full list.

## Voice input

Tapping the microphone uses the browser's built-in Web Speech API, which
in Chrome and Edge sends audio to vendor servers for transcription. There
is no SkyWhisper speech server in the middle: audio goes browser →
vendor, transcript goes browser → SkyWhisper backend. Listening requires
an explicit tap and works only with the screen on; nothing records in
the background, and the transcript box shows everything that was heard.

## Geolocation

## Geolocation

The browser Geolocation API is used only after you grant permission, one
shot, with manual coordinate entry as the fallback. Coordinates are rounded
to a 0.5° grid for the request. The app never tracks movement or background
location.

## Children and safety

Nothing here is directed at children. More importantly: this is an outdoor
audio companion, not a navigation aid. Do not walk while listening. Stay
away from roads, water, cliffs, and traffic. Use local astronomical society
guidance for observing conditions, and never rely on this for safety.
