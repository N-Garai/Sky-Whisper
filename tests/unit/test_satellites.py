"""Tests for satellite pass prediction (GLM-M3).

Hermetic by design: propagation is tested against a static TLE fixture,
and the network path is tested only for graceful degradation (fetch
failure must yield [], never an exception).
"""
from __future__ import annotations

from datetime import datetime, timezone

from src.backend.core.astronomy import build_snapshot, parse_timestamp
from src.backend.services.satellites import (
    compute_passes,
    find_passes,
    parse_tle,
    to_snapshot_passes,
)
from src.shared.schemas import PackRequest

# Static ISS fixture — propagation target only, never fetched from CelesTrak.
ISS_TLE = """ISS (ZARYA)
1 25544U 98067A   08264.51782528 -.00002174  00000-0 -11606-4 0  2927
2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537
"""

START = datetime(2026, 10, 7, 18, 0, 0, tzinfo=timezone.utc)


class TestParseTle:
    def test_finds_iss(self):
        sats = parse_tle(ISS_TLE)
        assert len(sats) == 1
        assert "ISS" in sats[0]["name"]
        assert sats[0]["satrec"] is not None

    def test_empty_text_yields_no_sats(self):
        assert parse_tle("") == []

    def test_malformed_lines_skipped(self):
        assert parse_tle("not a tle\n1 broken\n2 broken\n") == []


class TestFindPasses:
    def test_returns_structured_passes(self):
        sats = parse_tle(ISS_TLE)
        found = find_passes(sats, 22.5726, 88.3639, START, hours=8.0)
        assert isinstance(found, list)
        for p in found:
            assert {"name", "peak_alt", "az", "t"} <= set(p)
            assert p["peak_alt"] > 10.0

    def test_sorted_and_capped(self):
        sats = parse_tle(ISS_TLE)
        found = find_passes(sats, 22.5726, 88.3639, START, hours=8.0, max_passes=3)
        assert len(found) <= 3
        peaks = [p["peak_alt"] for p in found]
        assert peaks == sorted(peaks, reverse=True)

    def test_no_sats_no_passes(self):
        assert find_passes([], 0.0, 0.0, START) == []


class TestSnapshotMapping:
    def test_maps_to_schema(self):
        sats = parse_tle(ISS_TLE)
        found = find_passes(sats, 22.5726, 88.3639, START, hours=8.0)
        passes = to_snapshot_passes(found)
        assert len(passes) == len(found)
        for sp in passes:
            assert sp.satellite
            assert sp.rise_time is not None
            assert sp.peak_altitude_deg is not None
            assert sp.peak_direction

    def test_snapshot_defaults_to_empty(self):
        req = PackRequest(latitude=22.5726, longitude=88.3639,
                          timestamp="2026-10-07T18:00:00Z")
        snap = build_snapshot(req)
        assert snap.satellite_passes == []

    def test_snapshot_accepts_passes(self):
        req = PackRequest(latitude=22.5726, longitude=88.3639,
                          timestamp="2026-10-07T18:00:00Z")
        sats = parse_tle(ISS_TLE)
        found = find_passes(sats, 22.5726, 88.3639, parse_timestamp(req.timestamp))
        snap = build_snapshot(req, satellite_passes=to_snapshot_passes(found))
        assert len(snap.satellite_passes) == len(found)


class TestComputePassesDegradation:
    def test_fetch_failure_yields_empty(self, monkeypatch):
        import asyncio

        async def boom():
            raise ConnectionError("no network")

        import src.backend.services.satellites as sats_mod

        monkeypatch.setattr(sats_mod, "fetch_tle", boom)
        assert asyncio.run(compute_passes(22.5726, 88.3639, START)) == []

    def test_none_tle_yields_empty(self, monkeypatch):
        import asyncio

        async def none():
            return None

        import src.backend.services.satellites as sats_mod

        monkeypatch.setattr(sats_mod, "fetch_tle", none)
        assert asyncio.run(compute_passes(22.5726, 88.3639, START)) == []
