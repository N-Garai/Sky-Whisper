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


class TestVoiceEndpoint:
    def test_rejects_missing_fields(self, client):
        assert client.post("/api/voice/answer", json={}).status_code == 422
        assert client.post("/api/voice/answer", json={
            "latitude": 22.5726, "longitude": 88.3639,
            "timestamp": "2026-10-07T18:00:00Z",
        }).status_code == 422
        assert client.post("/api/voice/answer", json={
            "latitude": 999, "longitude": 0,
            "timestamp": "2026-10-07T18:00:00Z",
            "transcript": "describe the sky",
        }).status_code == 422

    def test_answers_without_keys_via_template(self, client):
        """No provider keys in CI: the template still answers, honestly audio-less."""
        r = client.post("/api/voice/answer", json={
            "latitude": 22.5726, "longitude": 88.3639,
            "timestamp": "2026-10-07T18:00:00Z",
            "transcript": "describe the sky",
        })
        assert r.status_code == 200
        body = r.json()
        assert len(body["reply"]) > 100
        assert body["provider"] == "template"
        assert body["audio"]["available"] is False
        assert body["audioPath"] is None

    def test_model_answer_uses_chain(self, client):
        from unittest.mock import patch

        from src.backend.narration import llm_provider

        async def fake_narrate(snap, duration_seconds=90, extra_context=None):
            assert extra_context and "bright" in extra_context
            assert duration_seconds == 30
            return {"script": "The moon is high and the night is clear for listening.",
                    "word_count": 12, "word_budget": 72, "claims": [], "warnings": [],
                    "fallback_used": False, "model": "m", "provider": "test",
                    "orchestrator": "direct", "facts": {}}

        with patch.object(llm_provider, "narrate_with_model", side_effect=fake_narrate):
            r = client.post("/api/voice/answer", json={
                "latitude": 22.5726, "longitude": 88.3639,
                "timestamp": "2026-10-07T18:00:00Z",
                "transcript": "what is that bright one",
            })
        assert r.status_code == 200
        assert r.json()["provider"] == "test"

    def test_voice_audio_404s_unknown(self, client):
        assert client.get("/api/voice/audio/nope123").status_code == 404
        assert client.get("/api/voice/audio/../../x").status_code == 404

    def test_voice_history_reaches_model(self, client):
        from unittest.mock import patch

        from src.backend.narration import llm_provider

        seen: dict = {}

        async def fake_narrate(snap, duration_seconds=90, extra_context=None):
            seen["context"] = extra_context or ""
            return {"script": "Jupiter is the bright one you asked about, high in the south.",
                    "word_count": 12, "word_budget": 72, "claims": [], "warnings": [],
                    "fallback_used": False, "model": "m", "provider": "test",
                    "orchestrator": "direct", "facts": {}}

        with patch.object(llm_provider, "narrate_with_model", side_effect=fake_narrate):
            r = client.post("/api/voice/answer", json={
                "latitude": 22.5726, "longitude": 88.3639,
                "timestamp": "2026-10-07T18:00:00Z",
                "transcript": "tell me more about Jupiter",
                "history": [{"q": "what is that bright one",
                             "a": "That is Jupiter, high in the south."}],
            })
        assert r.status_code == 200
        assert "Jupiter, high in the south" in seen["context"]
        assert "tell me more about Jupiter" in seen["context"]
