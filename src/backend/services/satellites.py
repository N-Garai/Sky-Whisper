"""CelesTrak TLE fetch + SGP4 propagation for visible satellite passes.

Data is cached to data/tle/ and refreshed at most once per 24 hours —
CelesTrak is a free community resource, so we are polite by design.
"""
from __future__ import annotations

import asyncio
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aiohttp
from sgp4.api import Satrec, jday

from src.core import az_to_compass

CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle"
TLE_MAX_AGE_SECONDS = 86400  # 24 hours

_APP_ROOT = Path(__file__).resolve().parents[3]
TLE_CACHE_DIR = _APP_ROOT / "data" / "tle"


def _cache_file() -> Path:
    TLE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return TLE_CACHE_DIR / "visual.tle"


def parse_tle(tle_text: str) -> list[dict]:
    """Parse a TLE file into {name, satrec} dicts."""
    if not tle_text:
        return []
    lines = [ln.strip() for ln in tle_text.strip().splitlines() if ln.strip()]
    sats: list[dict] = []
    i = 0
    while i + 2 < len(lines) + 1:
        if i + 2 >= len(lines):
            break
        name, l1, l2 = lines[i], lines[i + 1], lines[i + 2]
        if not (l1.startswith("1 ") and l2.startswith("2 ")):
            i += 1
            continue
        if len(l1) != 69 or len(l2) != 69:
            # Fixed-width TLE format — anything else is a header or corruption.
            i += 1
            continue
        try:
            sat = Satrec.twoline2rv(l1, l2)
            sats.append({"name": name, "satrec": sat})
        except Exception:
            pass
        i += 3
    return sats


def _geodetic_to_eci(lat_deg: float, lon_deg: float, alt_km: float, gmst_rad: float):
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg) + gmst_rad
    r = 6378.137 + alt_km
    x = r * math.cos(lat) * math.cos(lon)
    y = r * math.cos(lat) * math.sin(lon)
    z = r * math.sin(lat)
    return x, y, z


def _eci_to_topocentric(sat_x, sat_y, sat_z, obs_x, obs_y, obs_z, lat_deg: float, lon_deg: float):
    """ECI -> topocentric alt/az. Returns (alt_deg, az_deg)."""
    rx, ry, rz = sat_x - obs_x, sat_y - obs_y, sat_z - obs_z
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    # ENU frame
    e = -math.sin(lon) * rx + math.cos(lon) * ry
    n = -math.sin(lat) * math.cos(lon) * rx - math.sin(lat) * math.sin(lon) * ry + math.cos(lat) * rz
    u = math.cos(lat) * math.cos(lon) * rx + math.cos(lat) * math.sin(lon) * ry + math.sin(lat) * rz
    az = math.degrees(math.atan2(e, n)) % 360.0
    alt = math.degrees(math.atan2(u, math.hypot(e, n)))
    return alt, az


def _in_shadow(sat_x, sat_y, sat_z, sun_x, sun_y, sun_z) -> bool:
    """Cylindrical Earth-shadow test (Vallado)."""
    # Sun unit vector
    s = math.sqrt(sun_x ** 2 + sun_y ** 2 + sun_z ** 2)
    if s == 0:
        return False
    ux, uy, uz = sun_x / s, sun_y / s, sun_z / s
    # Projection of satellite onto the Earth-Sun axis.
    proj = sat_x * ux + sat_y * uy + sat_z * uz
    perp2 = (sat_x - proj * ux) ** 2 + (sat_y - proj * uy) ** 2 + (sat_z - proj * uz) ** 2
    R_EARTH = 6378.137
    return proj < 0 and perp2 < R_EARTH ** 2


def find_passes(
    sats: list[dict],
    lat: float,
    lon: float,
    start: datetime,
    hours: float = 8.0,
    min_peak_alt: float = 10.0,
    max_passes: int = 3,
) -> list[dict]:
    """Scan for visible satellite passes over an observing window."""
    if not sats:
        return []

    results: list[dict] = []
    step = 30  # seconds
    n_steps = int(hours * 3600 / step)

    # Observer in ECI at the window midpoint for a first-order GMST.
    ts = start.timestamp()
    jd, frac = jday(start.year, start.month, start.day,
                    start.hour, start.minute, start.second + start.microsecond / 1e6)

    for sat in sats[:12]:  # cap the work — free tier CPU is 0.1 vCPU
        satrec = sat["satrec"]
        best: Optional[dict] = None
        for k in range(n_steps):
            t = ts + k * step
            err, r, v = satrec.sgp4(jd + (t - ts) / 86400.0, 0.0)
            if err != 0:
                continue
            # Rough GMST for the ECI->ECEF rotation.
            gmst = (280.46061837 + 360.98564736629 * ((jd + (t - ts) / 86400.0) - 2451545.0)) % 360.0
            gmst_rad = math.radians(gmst)
            obs_x, obs_y, obs_z = _geodetic_to_eci(lat, lon, 0.0, gmst_rad)
            alt, az = _eci_to_topocentric(r[0], r[1], r[2], obs_x, obs_y, obs_z, lat, lon)
            if alt > min_peak_alt:
                if best is None or alt > best["peak_alt"]:
                    best = {
                        "name": sat["name"],
                        "peak_alt": alt,
                        "az": az,
                        "t": t,
                    }
        if best:
            results.append(best)

    results.sort(key=lambda r: -r["peak_alt"])
    return results[:max_passes]


async def fetch_tle() -> Optional[str]:
    """Fetch + cache TLE data. Serves stale cache if the source is down."""
    cache = _cache_file()

    if cache.exists():
        age = time.time() - cache.stat().st_mtime
        if age < TLE_MAX_AGE_SECONDS:
            return cache.read_text(encoding="utf-8", errors="ignore")

    headers = {"User-Agent": "SkyWhisper/0.1 (screenless-astronomy)"}
    timeout = aiohttp.ClientTimeout(total=15)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(CELESTRAK_URL, headers=headers) as resp:
                if resp.status == 200:
                    text = await resp.text()
                    cache.write_text(text, encoding="utf-8")
                    return text
    except Exception:
        pass

    if cache.exists():
        return cache.read_text(encoding="utf-8", errors="ignore")
    return None


def to_snapshot_passes(found: list[dict]) -> list:
    """Map raw pass dicts onto the snapshot schema.

    Passes are geometric (altitude above the horizon during the window).
    Sunlight illumination is not modelled, so narration must keep the
    honest "possible pass" language — a pass is never promised visible.
    """
    from src.shared.sky_snapshot import SatellitePass

    out = []
    for f in found:
        rise = datetime.fromtimestamp(f["t"], tz=timezone.utc).isoformat()
        out.append(SatellitePass(
            satellite=str(f["name"]).strip(),
            rise_time=rise,
            peak_altitude_deg=round(float(f["peak_alt"]), 1),
            peak_direction=az_to_compass(float(f["az"])),
            duration_seconds=None,  # unknown without a full rise/set solve
        ))
    return out


async def compute_passes(
    latitude: float,
    longitude: float,
    start: datetime,
    hours: float = 8.0,
) -> list:
    """Best-effort satellite passes: cached TLE, else live fetch, else [].

    Never raises — a failure anywhere degrades to an empty list so pack
    generation is never blocked by CelesTrak availability.
    """
    try:
        tle_text = await fetch_tle()
    except Exception:
        return []
    if not tle_text:
        return []
    sats = parse_tle(tle_text)
    if not sats:
        return []
    try:
        found = await asyncio.to_thread(find_passes, sats, latitude, longitude, start, hours)
    except Exception:
        return []
    return to_snapshot_passes(found)
