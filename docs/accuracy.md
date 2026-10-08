# Verified Accuracy

Every number the product reports is either computed by an open ephemeris
library or explicitly labeled as an approximation. This page is the record.

## Method

Positions are computed by [Skyfield](https://rhodesmill.org/skyfield/)
using JPL SP-Kernel ephemerides. Skyfield implements the same published
IAU algorithms used by desktop planetaria; it is not a model guessing at
the sky.

During development, output was cross-checked against
[astropy](https://www.astropy.org/) `get_body()`, an independent
implementation of the same algorithms. Independent implementations agreeing
is the point of open coordinates: anyone can diff our sky against another
open library and confirm it.

## Cross-check epoch

The verification run used a fixed epoch and observer so the numbers are
reproducible by anyone: epoch `2026-10-07T18:00:00Z`, observer at
`22.5726 N, 88.3639 E`. Substitute any other epoch/location and the same
method applies.

| Quantity | SkyWhisper | astropy | Delta |
|---|---|---|---|
| Sun altitude | -73.08° | -73.08° | 0.00° |
| Sun azimuth | 4.88° | 4.88° | 0.00° |
| Moon altitude | -45.16° | -45.16° | 0.00° |
| Moon azimuth | 52.57° | 52.57° | 0.00° |
| Sun–Moon elongation | 35.25° | 35.89° | 0.64° |
| Moon illumination fraction | 0.092 | 0.095 | 0.003 |
| Jupiter altitude | -27.11° | -27.11° | 0.00° |
| Saturn altitude | 69.02° | 69.02° | 0.00° |
| Mercury altitude | -69.36° | -69.36° | 0.00° |
| Venus altitude | -72.92° | -72.92° | 0.00° |
| Mars altitude | -12.39° | -12.39° | 0.00° |

The elongation residual is the Moon's ~5° ecliptic latitude: phase
bucketing projects positions onto the ecliptic plane, so it ignores that
component. The resulting illumination fraction differs by 0.003, which
does not change the phase name or the percentage spoken to a listener.

Planet positions for the giant planets come from barycentre segments in
DE421, which is accurate to well under a degree for naked-eye pointing. It
is not a claim of arcsecond precision — nothing in this product needs it.

## What the numbers mean

- **Altitude**: degrees above the ideal geometric horizon.
- **Azimuth**: `[0, 360)` clockwise from true north.
- **`visible`**: altitude ≥ 10°. This is a UX heuristic to avoid telling
  you to look at something buried behind terrain or thick atmosphere. It is
  not an astronomical claim.
- **Twilight states**: USNO conventional Sun-altitude thresholds (-6°,
  -12°, -18°). These are definitions, not guarantees of what you will see.
- **Illumination fraction**: `(1 - cos E) / 2` where `E` is the Sun–Moon
  elongation. Exact for the phase geometry.
- **Fist-widths**: one held-out fist spans approximately 10° of sky. It is
  a standard naked-eye approximation from observing guides, and individual
  hands vary. Directions are body-relative on purpose.

## What this product does not claim

- Satellite visibility. Pass prediction requires current TLE data, and
  predicting a pass is not the same as the pass being visible — cloud
  cover, light pollution, local horizon, and the satellite's own illumination
  all matter. When satellite data is present it is labeled a possible pass.
- Weather accuracy beyond what Open-Meteo reports for the requested
  location and hour.
- Any guarantee of seeing conditions. Light pollution, terrain, and local
  horizon are not modeled.

## The language model does not compute coordinates

This is an architectural constraint, not a guideline. The narrator receives
only the finished `SkySnapshot` and may not introduce numbers. Before any
audio is rendered, `validate_narration()` extracts every numeral and
spelled-out number from the script and rejects any value not present in
`snapshot_facts()`. It also rejects raw coordinate phrasing, because the
narration speaks fist-widths and compass directions, not degrees.

The deterministic template narrator — the default, and the zero-dependency
path — is written so that its own output passes the validator. That is a
deliberate property: the fallback is held to the same standard as the
model.
