"""Open-Meteo weather — free, no API key. Gracefully degrades to 'unknown'."""
from __future__ import annotations

import math
from typing import Optional

import aiohttp

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def _cloud_label(pct: float) -> str:
    if pct < 25:
        return "clear"
    if pct < 60:
        return "partly cloudy"
    return "cloudy"


async def get_cloud_cover(lat: float, lon: float, date_str: str) -> dict:
    """Evening cloud cover percentage for a location and date."""
    params = {
        "latitude": round(lat, 2),
        "longitude": round(lon, 2),
        "hourly": "cloudcover",
        "start_date": date_str,
        "end_date": date_str,
        "timezone": "auto",
    }
    try:
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(OPEN_METEO_URL, params=params) as resp:
                if resp.status != 200:
                    return {"cloud_pct": None, "label": "unknown"}
                data = await resp.json()
    except Exception:
        return {"cloud_pct": None, "label": "unknown"}

    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    clouds = hourly.get("cloudcover", [])
    if not times or not clouds or len(times) != len(clouds):
        return {"cloud_pct": None, "label": "unknown"}

    # Evening observing window: 20:00-23:00 local.
    evening = [c for tt, c in zip(times, clouds) if tt.endswith(("20", "21", "22", "23"))]
    if not evening:
        evening = clouds[-4:]
    if not evening:
        return {"cloud_pct": None, "label": "unknown"}

    avg = sum(evening) / len(evening)
    if math.isnan(avg) or math.isinf(avg):
        return {"cloud_pct": None, "label": "unknown"}

    return {"cloud_pct": round(avg, 1), "label": _cloud_label(avg)}
