# API Reference

Base URL: the single deployed service. All routes are JSON.

## `GET /api/health`

Liveness probe. Cheap by design — the PWA pings it on load, which also warms
a cold free-tier instance.

**Response**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "ephemeris": "skyfield",
  "model": "template",
  "tts": "disabled",
  "packs_cached": 3,
  "tle_age": null
}
```

| Field | Meaning |
|---|---|
| `model` | Narration mode: `template` (default, zero external calls), or a configured provider |
| `tts` | `configured` when `ELEVENLABS_API_KEY` is set, else `disabled` |
| `packs_cached` | Packs currently held in ephemeral storage |
| `tle_age` | Age of the cached satellite elements, or `null` when never fetched |

## `POST /api/sky/snapshot`

Computes the sky deterministically. No language model is involved.

**Request**

```json
{
  "latitude": 22.5726,
  "longitude": 88.3639,
  "elevation_meters": 10,
  "timestamp": "<ISO-8601 UTC instant, e.g. 2026-10-07T18:00:00Z>",
  "timezone": "Asia/Kolkata",
  "duration_seconds": 90
}
```

| Field | Constraints |
|---|---|
| `latitude` | -90..90 |
| `longitude` | -180..180 |
| `elevation_meters` | clamped to -500..10000 |
| `timestamp` | ISO-8601 UTC instant with explicit offset or `Z` |
| `duration_seconds` | clamped to 30..300 |

Out-of-range or missing fields return `422` with the offending field paths.

**Response** — `SkySnapshot`, the source of truth passed to the narrator:

```json
{
  "schema_version": "1.0",
  "location": {"latitude": 22.5726, "longitude": 88.3639, "elevation_meters": 10},
  "timestamp": "<the instant you requested>",
  "sun": {"altitude_deg": -73.08, "azimuth_deg": 4.88, "state": "night"},
  "moon": {
    "phase_name": "waning_crescent",
    "illumination": 0.092,
    "altitude_deg": -45.16,
    "azimuth_deg": 52.57
  },
  "planets": [
    {"name": "Saturn", "altitude_deg": 69.02, "azimuth_deg": 189.92, "visible": true}
  ],
  "stars": [
    {"name": "Vega", "altitude_deg": 12.34, "azimuth_deg": 301.5, "visible": true, "magnitude": 0.03}
  ],
  "constellations": [
    {"name": "Orion", "anchor_star": "Betelgeuse", "altitude_deg": 41.2, "azimuth_deg": 88.4}
  ],
  "satellite_passes": [],
  "weather": {"cloud_pct": 12.5, "label": "clear"},
  "sources": [{"name": "Skyfield", "version": "<JPL kernel name>"}],
  "warnings": []
}
```

Azimuth is `[0, 360)` clockwise from true north. Altitude is degrees above
the geometric horizon. `visible` requires altitude ≥ 10°, so an object
merely above the ideal horizon is not called visible.

Twilight bands follow USNO conventions:

| Sun altitude | State |
|---|---|
| < -18° | `night` |
| [-18°, -12°) | `astronomical_twilight` |
| [-12°, -6°) | `nautical_twilight` |
| [-6°, 0°) | `civil_twilight` |
| ≥ 0° | `day` |

These are conventional thresholds, not a promise of observing conditions.

## `POST /api/packs`

Full pipeline: snapshot → narration → audio.

Same request body as the snapshot endpoint. Response:

```json
{
  "packId": "0e10da750c115be1",
  "snapshot": { "...": "full SkySnapshot" },
  "narration": {
    "title": "tonight above 22.6, 88.4",
    "script": "tonight, above 22.6 degrees north...",
    "word_count": 127,
    "word_budget": 218,
    "warnings": [],
    "fallback_used": true
  },
  "audio": {
    "available": false,
    "format": null,
    "bytes": 0,
    "voice": null,
    "reason": "tts not configured — set ELEVENLABS_API_KEY"
  },
  "audioPath": null,
  "transcriptPath": "/api/packs/0e10da750c115be1/transcript",
  "expiresAt": null,
  "generatedAt": "<ISO-8601 UTC instant at generation time>"
}
```

When `audio.available` is `false`, `audio.reason` states why. The transcript
is always present. `expiresAt` is `null` deliberately — storage is ephemeral
and this makes no false promise of persistence.

Packs are cached by a key derived from the request. Location snaps to a
0.5° grid so nearby observers share a pack, which is what keeps the
free-tier budget viable. A cache hit returns without regenerating.

## `GET /api/packs/{pack_id}/audio`

Streams the pack MP3. Returns `404` if the pack is not in the current
process — ephemeral storage means a pack does not survive a restart. The
client is expected to download at prepare time, which is the product.

## `GET /api/packs/{pack_id}/transcript`

Returns the plain-text narration.

```json
{"transcript": "tonight, above 22.6 degrees north, 88.4 degrees east..."}
```

## `POST /api/voice/answer`

Spoken answer to a free-form voice question (hands-free loop). Builds a
fresh snapshot for the given instant, runs the model chain at a short
30-second budget with the question honored first, and renders TTS when
configured. Satellites and weather are skipped on purpose — voice answers
must stay fast.

**Request**

```json
{
  "latitude": 22.5726,
  "longitude": 88.3639,
  "timestamp": "<ISO-8601 UTC instant>",
  "transcript": "what is that bright one"
}
```

**Response**

```json
{
  "reply": "That bright one is...",
  "word_count": 68,
  "provider": "groq",
  "model": "openai/gpt-oss-120b",
  "audio": {"available": false, "reason": "tts not configured — set ELEVENLABS_API_KEY"},
  "audioPath": null
}
```

Missing/invalid fields return `422`. Without model keys the template
narrator still answers (flagged `"provider": "template"`), honestly
audio-less without a TTS key.

## `GET /api/voice/audio/{id}`

Streams a voice-reply MP3. `404` for unknown ids, malformed ids, or after
a restart — ephemeral storage, same as packs.

## Errors

Validation failures return `422` with field paths. Ephemeris failures return
`400` or `500` with a plain `detail` string. Missing packs return `404`.
Provider failures degrade rather than abort: a TTS outage yields
`audio.available: false` with the reason, and the transcript still ships.

## Rate limits

No server-side rate limiting is implemented. The pack cache is the
free-tier safety mechanism — repeated identical requests do not repeat work.
