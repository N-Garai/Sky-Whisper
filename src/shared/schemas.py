"""Shared Pydantic schemas — single source of truth for API + narration."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class PackRequest(BaseModel):
    """Request schema for snapshot + pack endpoints."""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    elevation_meters: float = 0.0
    timestamp: str = Field(..., description="ISO-8601 UTC instant, e.g. 2026-10-07T18:00:00Z")
    timezone: str = "UTC"
    duration_seconds: int = 90

    @field_validator("elevation_meters")
    @classmethod
    def clamp_elevation(cls, v: float) -> float:
        return max(-500.0, min(10000.0, v))

    @field_validator("duration_seconds")
    @classmethod
    def clamp_duration(cls, v: int) -> int:
        return max(30, min(300, v))
