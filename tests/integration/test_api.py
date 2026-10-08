"""Integration tests — the full HTTP pipeline with zero external calls.

Runs hermetically: no network, no LLM key, no TTS key. The template
narrator is the guaranteed path, so CI never needs provider credentials.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from src.backend.api.routes import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


class TestHealth:
    def test_returns_ok_without_keys(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body["ephemeris"]
        assert body["model"] in ("template", "google", "ollama")
        assert body["tts"] in ("configured", "disabled")

    def test_bare_health_path(self, client):
        assert client.get("/health").status_code == 200


class TestSnapshotEndpoint:
    def test_valid_request(self, client):
        r = client.post("/api/sky/snapshot", json={
            "latitude": 22.5726,
            "longitude": 88.3639,
            "elevation_meters": 10,
            "timestamp": "2026-10-07T18:00:00Z",
            "timezone": "Asia/Kolkata",
            "duration_seconds": 90,
        })
        assert r.status_code == 200
        snap = r.json()
        assert snap["schema_version"] == "1.0"
        assert snap["location"]["latitude"] == 22.5726
        assert 0.0 <= snap["moon"]["illumination"] <= 1.0

    def test_invalid_latitude_rejected(self, client):
        r = client.post("/api/sky/snapshot", json={
            "latitude": 999, "longitude": 0, "timestamp": "2026-10-07T18:00:00Z",
        })
        assert r.status_code == 422

    def test_missing_timestamp_rejected(self, client):
        r = client.post("/api/sky/snapshot", json={"latitude": 0, "longitude": 0})
        assert r.status_code == 422

    def test_no_below_horizon_body_visible(self, client):
        r = client.post("/api/sky/snapshot", json={
            "latitude": 22.5726, "longitude": 88.3639,
            "timestamp": "2026-10-07T18:00:00Z",
        })
        snap = r.json()
        for b in snap["planets"] + snap["stars"]:
            if b["altitude_deg"] < 10:
                assert b["visible"] is False


class TestPackEndpoint:
    def test_pack_returns_transcript_without_keys(self, client):
        r = client.post("/api/packs", json={
            "latitude": 22.5726, "longitude": 88.3639,
            "timestamp": "2026-10-07T18:00:00Z",
            "duration_seconds": 90,
        })
        assert r.status_code == 200
        pack = r.json()
        assert pack["packId"]
        assert pack["narration"]["script"]
        assert pack["transcriptPath"].endswith(pack["packId"] + "/transcript")
        # No TTS key in CI — audio must be honestly unavailable, never faked.
        assert pack["audio"]["available"] is False
        assert pack["expiresAt"] is None

    def test_audio_endpoint_404s_after_restart(self, client):
        r = client.get("/api/packs/nonexistentpack/audio")
        assert r.status_code == 404

    def test_transcript_roundtrip(self, client):
        create = client.post("/api/packs", json={
            "latitude": 51.5074, "longitude": -0.1278,
            "timestamp": "2026-10-07T22:00:00Z",
            "duration_seconds": 90,
        })
        pack_id = create.json()["packId"]
        r = client.get(f"/api/packs/{pack_id}/transcript")
        assert r.status_code == 200
        assert len(r.json()["transcript"]) > 100

    def test_cache_hit_returns_same_pack(self, client):
        body = {
            "latitude": 40.7128, "longitude": -74.0060,
            "timestamp": "2026-10-08T02:00:00Z",
            "duration_seconds": 90,
        }
        first = client.post("/api/packs", json=body).json()
        second = client.post("/api/packs", json=body).json()
        assert first["packId"] == second["packId"]

    def test_pack_is_json_serializable(self, client):
        r = client.post("/api/packs", json={
            "latitude": 22.5726, "longitude": 88.3639,
            "timestamp": "2026-10-07T18:00:00Z",
        })
        json.dumps(r.json())
