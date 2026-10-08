"""SkySnapshot — the deterministic source of truth passed to the narrator."""
from __future__ import annotations

from typing import Any
from pydantic import BaseModel


class SunInfo(BaseModel):
    altitude_deg: float
    azimuth_deg: float
    state: str  # night | astronomical_twilight | nautical_twilight | civil_twilight | day


class MoonInfo(BaseModel):
    phase_name: str
    illumination: float  # 0..1
    altitude_deg: float
    azimuth_deg: float


class BodyInfo(BaseModel):
    name: str
    altitude_deg: float
    azimuth_deg: float
    visible: bool = True
    magnitude: float | None = None


class ConstellationInfo(BaseModel):
    name: str
    anchor_star: str | None = None
    altitude_deg: float = 0
    azimuth_deg: float = 0


class SatellitePass(BaseModel):
    satellite: str
    rise_time: str | None = None
    peak_altitude_deg: float | None = None
    peak_direction: str | None = None
    duration_seconds: float | None = None


class WeatherInfo(BaseModel):
    cloud_pct: float | None = None
    label: str = "unknown"


class SourceInfo(BaseModel):
    name: str
    version: str


class SkySnapshot(BaseModel):
    schema_version: str = "1.0"
    location: dict[str, Any]
    timestamp: str
    sun: SunInfo
    moon: MoonInfo
    planets: list[BodyInfo]
    stars: list[BodyInfo]
    constellations: list[ConstellationInfo]
    satellite_passes: list[SatellitePass]
    weather: WeatherInfo
    sources: list[SourceInfo]
    warnings: list[str] = []
