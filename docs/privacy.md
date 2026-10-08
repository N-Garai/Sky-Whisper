# Privacy

SkyWhisper is designed so that location data stays as close to you as possible.

## What leaves your device

| Data | Where it goes | Stored? |
|---|---|---|
| Latitude, longitude | The server, to compute the sky | In-memory only, for the pack |
| Request timestamp | The server | Same |
| Narration text | ElevenLabs, only when TTS is configured | See their terms |

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

With no `ELEVENLABS_API_KEY` set, nothing leaves your network at all — the
narration is generated locally by the deterministic template narrator, and
the transcript is the deliverable.

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
