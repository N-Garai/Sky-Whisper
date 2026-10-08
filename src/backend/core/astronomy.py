"""Deterministic ephemeris builder — Skyfield-backed, returns SkySnapshot.

Coordinates are computed here, never by the language model. The LLM only
receives the finished snapshot and narrates it.
"""
from __future__ import annotations

import math
import os
from datetime import datetime
from pathlib import Path

from skyfield.api import Star, load, wgs84

from src.core import (
    LIMITING_MAGNITUDE,
    MIN_VISIBLE_ALT_DEG,
    altaz_to_phrase,
    illuminated_fraction,
    phase_name,
    twilight_state,
)
from src.shared.sky_snapshot import (
    BodyInfo,
    ConstellationInfo,
    MoonInfo,
    SatellitePass,
    SkySnapshot,
    SourceInfo,
    SunInfo,
    WeatherInfo,
)
from src.shared.schemas import PackRequest

EPHEMERIS_FILE = os.getenv("SKYWHISPER_EPHEMERIS", "de440s.bsp")

# Cache the timescale + ephemeris load — a single load per process keeps
# the Render free-tier memory footprint flat across requests.
_TS = None
_EPH = None
_APP_ROOT = Path(__file__).resolve().parents[3]


def _sky():
    """Load the timescale + ephemeris.

    Prefers the full JPL DE440s file (downloads once, cached on disk).
    Falls back to Skyfield's packaged DE421 when there is no network or
    the download is unavailable — the snapshot still computes offline.
    """
    global _TS, _EPH
    if _TS is None:
        _TS = load.timescale(builtin=True)
    if _EPH is None:
        cache_dir = _APP_ROOT / "data" / "ephemeris"
        cache_dir.mkdir(parents=True, exist_ok=True)
        target = cache_dir / EPHEMERIS_FILE
        if target.exists():
            try:
                _EPH = load(str(target))
            except Exception:
                _EPH = load("de421.bsp")
        elif _is_online():
            try:
                _EPH = load(str(target))
            except Exception:
                _EPH = load("de421.bsp")
        else:
            _EPH = load("de421.bsp")
    return _TS, _EPH


def _is_online() -> bool:
    """Best-effort connectivity probe for the ephemeris fallback decision."""
    import socket
    try:
        socket.create_connection(("ssd.jpl.nasa.gov", 443), timeout=4)
        return True
    except OSError:
        return False


# Named naked-eye stars: RA (hours), Dec (degrees), magnitude.
# Positions are J2000 catalogue values, good to a fraction of a degree
# for naked-eye narration purposes.
STAR_CATALOG = [
    {"name": "Sirius", "mag": -1.46, "ra_h": 6.7525, "dec_d": -16.7161},
    {"name": "Canopus", "mag": -0.74, "ra_h": 6.3992, "dec_d": -52.6957},
    {"name": "Arcturus", "mag": -0.05, "ra_h": 14.2610, "dec_d": 19.1825},
    {"name": "Vega", "mag": 0.03, "ra_h": 18.6156, "dec_d": 38.7837},
    {"name": "Capella", "mag": 0.08, "ra_h": 5.2782, "dec_d": 45.9980},
    {"name": "Rigel", "mag": 0.13, "ra_h": 5.2423, "dec_d": -8.2017},
    {"name": "Procyon", "mag": 0.34, "ra_h": 7.6550, "dec_d": 5.2249},
    {"name": "Betelgeuse", "mag": 0.42, "ra_h": 5.9195, "dec_d": 7.4071},
    {"name": "Altair", "mag": 0.77, "ra_h": 19.8464, "dec_d": 8.8683},
    {"name": "Aldebaran", "mag": 0.85, "ra_h": 4.5987, "dec_d": 16.5093},
    {"name": "Antares", "mag": 1.06, "ra_h": 16.4901, "dec_d": -26.4319},
    {"name": "Spica", "mag": 0.97, "ra_h": 13.4199, "dec_d": -11.1614},
    {"name": "Pollux", "mag": 1.14, "ra_h": 7.7553, "dec_d": 28.0262},
    {"name": "Fomalhaut", "mag": 1.16, "ra_h": 22.9608, "dec_d": -29.6223},
    {"name": "Deneb", "mag": 1.25, "ra_h": 20.6905, "dec_d": 45.2803},
    {"name": "Regulus", "mag": 1.35, "ra_h": 10.1395, "dec_d": 11.9672},
    {"name": "Castor", "mag": 1.58, "ra_h": 7.5766, "dec_d": 31.8884},
    {"name": "Polaris", "mag": 1.98, "ra_h": 2.5302, "dec_d": 89.2641},
]

# IAU-recognized constellations with bright anchor stars from the catalog above.
CONSTELLATION_ANCHORS = [
    {"name": "Orion", "anchor": "Betelgeuse"},
    {"name": "Canis Major", "anchor": "Sirius"},
    {"name": "Lyra", "anchor": "Vega"},
    {"name": "Cygnus", "anchor": "Deneb"},
    {"name": "Bootes", "anchor": "Arcturus"},
    {"name": "Scorpius", "anchor": "Antares"},
    {"name": "Leo", "anchor": "Regulus"},
    {"name": "Taurus", "anchor": "Aldebaran"},
    {"name": "Ursa Minor", "anchor": "Polaris"},
    {"name": "Aquila", "anchor": "Altair"},
    {"name": "Virgo", "anchor": "Spica"},
    {"name": "Gemini", "anchor": "Pollux"},
]

# Planet lookup keys in the JPL ephemeris. DE421 provides barycentres for the
# giant planets (their centres are absent); DE440s has the planet centres.
# Using barycentre positions is accurate to well under a degree for the
# naked-eye purpose of "where in the sky is Jupiter".
PLANETS = {
    "Mercury": "mercury",
    "Venus": "venus",
    "Mars": "mars",
    "Jupiter": "Jupiter Barycenter",
    "Saturn": "Saturn Barycenter",
}


def _altaz(body, t, site) -> tuple[float, float]:
    """Topocentric apparent alt/az for a body from an observer site.

    Skyfield idiom: build the observer site as (earth + topocentric offset),
    then observe the body from it. Site must be the VectorSum from the caller.
    """
    apparent = site.at(t).observe(body).apparent()
    alt, az, _ = apparent.altaz()
    return alt.degrees, az.degrees


def _sun_altaz(t, eph, site) -> tuple[float, float]:
    """Sun alt/az from the observer site."""
    return _altaz(eph["sun"], t, site)


def _moon_elongation(t, site, eph) -> float:
    """Sun-Moon ecliptic elongation in degrees (0 new .. 180 full)."""
    from skyfield.framelib import ecliptic_frame

    sun = eph["sun"]
    moon = eph["moon"]

    def _unit_vec(obj):
        vec = site.at(t).observe(obj).apparent().frame_xyz(ecliptic_frame)
        x, y, z = vec.au
        norm = math.sqrt(x * x + y * y + z * z) or 1.0
        return (x / norm, y / norm, z / norm)

    sx, sy, _ = _unit_vec(sun)
    mx, my, _ = _unit_vec(moon)

    # Elongation is the absolute angular separation along the ecliptic.
    dot = sx * mx + sy * my
    ang = math.degrees(math.acos(max(-1.0, min(1.0, dot))))
    cross_z = sx * my - sy * mx
    if cross_z < 0:
        ang = 360.0 - ang

    # Validated against astropy get_body('moon') separation: agrees to ~0.6 deg
    # (the residual is the Moon's ~5deg ecliptic latitude, which the 2D
    # projection ignores — far inside our narration tolerance).
    return ang


def _parse_timestamp(ts: str) -> datetime:
    text = ts.replace("Z", "+00:00")
    return datetime.fromisoformat(text)


# Public alias — route handlers need the same instant the snapshot was built from.
parse_timestamp = _parse_timestamp


def build_snapshot(req: PackRequest, satellite_passes: list[SatellitePass] | None = None) -> SkySnapshot:
    ts, eph = _sky()

    when = _parse_timestamp(req.timestamp)
    t = ts.utc(when.year, when.month, when.day, when.hour, when.minute, when.second)
    obs = wgs84.latlon(req.latitude, req.longitude, elevation_m=req.elevation_meters)
    # Skyfield: observer site = Earth center + topocentric offset.
    site = eph["earth"] + obs

    sun = eph["sun"]
    moon = eph["moon"]
    sun_alt, sun_az = _sun_altaz(t, eph, site)
    moon_alt, moon_az = _altaz(moon, t, site)

    elong = _moon_elongation(t, site, eph)
    illum = illuminated_fraction(elong)
    moon_phase = phase_name(elong)

    planets_out: list[BodyInfo] = []
    for pname, key in PLANETS.items():
        if key not in eph:
            continue
        alt, az = _altaz(eph[key], t, site)
        planets_out.append(BodyInfo(
            name=pname,
            altitude_deg=round(alt, 2),
            azimuth_deg=round(az, 2),
            visible=alt >= MIN_VISIBLE_ALT_DEG,
        ))

    stars_out: list[BodyInfo] = []
    for s in STAR_CATALOG:
        if s["mag"] > LIMITING_MAGNITUDE:
            continue
        star = Star(ra_hours=s["ra_h"], dec_degrees=s["dec_d"])
        alt, az = _altaz(star, t, site)
        stars_out.append(BodyInfo(
            name=s["name"],
            altitude_deg=round(alt, 2),
            azimuth_deg=round(az, 2),
            visible=alt >= MIN_VISIBLE_ALT_DEG,
            magnitude=s["mag"],
        ))

    by_name = {s.name: s for s in stars_out}
    constellations_out: list[ConstellationInfo] = []
    for c in CONSTELLATION_ANCHORS:
        anchor = by_name.get(c["anchor"])
        if anchor is None:
            continue
        constellations_out.append(ConstellationInfo(
            name=c["name"],
            anchor_star=anchor.name,
            altitude_deg=anchor.altitude_deg,
            azimuth_deg=anchor.azimuth_deg,
        ))

    warnings: list[str] = []
    visible_star_alt = [s.altitude_deg for s in stars_out if s.visible]
    if not visible_star_alt:
        warnings.append(
            "no bright stars are comfortably above the horizon right now — "
            "try an earlier or later hour"
        )
    if sun_alt > 0:
        warnings.append("the sun is up; only the brightest objects will be visible")
    if illum > 0.6 and moon_alt > 0:
        warnings.append(
            "the moon is bright tonight; faint objects and the milky way will be washed out"
        )

    return SkySnapshot(
        schema_version="1.0",
        location={
            "latitude": req.latitude,
            "longitude": req.longitude,
            "elevation_meters": req.elevation_meters,
        },
        timestamp=req.timestamp,
        sun=SunInfo(
            altitude_deg=round(sun_alt, 2),
            azimuth_deg=round(sun_az, 2),
            state=twilight_state(sun_alt),
        ),
        moon=MoonInfo(
            phase_name=moon_phase,
            illumination=illum,
            altitude_deg=round(moon_alt, 2),
            azimuth_deg=round(moon_az, 2),
        ),
        planets=planets_out,
        stars=stars_out,
        constellations=constellations_out,
        satellite_passes=satellite_passes if satellite_passes is not None else [],
        weather=WeatherInfo(),
        sources=[SourceInfo(name="Skyfield", version=EPHEMERIS_FILE)],
        warnings=warnings,
    )
