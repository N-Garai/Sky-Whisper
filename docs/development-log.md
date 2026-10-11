# Development Log

Honest record of what was built, what broke, and what was verified.

## Initial build

### What works

- Ephemeris core: Sun, Moon, five planets, 18 named stars, 12 constellation
  anchors. Computed by Skyfield from JPL DE421 (fallback) or DE440s (when
  downloadable), cached on disk.
- Snapshot endpoint returns a versioned `SkySnapshot` with USNO twilight
  bands, illumination fraction, and honest `visible` gating at 10° altitude.
- Narration: deterministic template narrator producing spoken prose in
  fist-widths and compass directions, never coordinates.
- Anti-hallucination validator: extracts every numeral and spelled-out
  number, rejects any value absent from the snapshot fact whitelist, and
  rejects raw coordinate phrasing.
- Pack endpoint with a 0.5°-grid cache key so nearby observers share a pack.
- TTS adapter that returns an honest unavailable result with a reason when
  no key is set, never fake bytes.
- Weather (Open-Meteo) and satellite (CelesTrak + SGP4) services with
  graceful degradation — a fetch failure never blocks a pack.
- Frontend: React 19 + Vite + Tailwind v4 + Framer Motion PWA with an
  animated starfield, sky preview, prepare flow, player, red-shift mode,
  and a Media Session-ready listen page. Builds clean, typechecks clean.
- 78 tests passing: pure math, snapshot + narration validation, and HTTP
  integration with zero external calls.


### Verification

Cross-checked Skyfield output against astropy `get_body()` for the same
instant and observer — independent implementations of the same algorithms.
All positions agreed to 0.00° except elongation (0.64°, explained above).
Numbers are in [accuracy.md](accuracy.md).

### Known limits

- Satellite passes are wired but the narration calls them *possible* passes
  only. Predicting a pass is not the same as it being visible; cloud,
  horizon, illumination, and magnitude are not all modeled.
- Audio requires an ElevenLabs key. Without it the transcript is the
  deliverable, and the API says so plainly.
- Storage is ephemeral by design. Packs do not survive a restart.
