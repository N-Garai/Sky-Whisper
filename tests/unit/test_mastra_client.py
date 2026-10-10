"""Tests for the Mastra orchestration bridge (Perplexity-M5 / GLM-M4).

Hermetic: no model, no network. The live-harness test runs only the
compiled CLI selftest (tools + workflow shape, no provider call), and
skips cleanly when the harness was not built.
"""
from __future__ import annotations

import asyncio
import json
import subprocess

import pytest

from src.backend.narration import llm_provider, mastra_client
from src.backend.narration.mastra_client import (
    harness_dir,
    is_available,
    narrate_via_mastra,
)
from src.backend.narration.template_narrator import snapshot_facts
from src.shared.schemas import PackRequest
from src.backend.core.astronomy import build_snapshot


@pytest.fixture
def snapshot():
    req = PackRequest(latitude=22.5726, longitude=88.3639, timestamp="2026-10-07T18:00:00Z")
    return build_snapshot(req)


def grounded_text(snapshot) -> str:
    """Grounded text sized to the default 90 s budget (~217 words)."""
    facts = snapshot_facts(snapshot)
    illum = int(round(facts["moon.illumination_pct"]))
    fists = int(facts["moon.fists"])
    filler = " ".join(["the sky is patient and the night is calm"] * 22)
    return (
        f" Tonight the moon is {illum} percent lit. "
        f"Find it {fists} fists above the horizon. "
        "Take a slow breath, and let your eyes relax. "
        + filler + "."
    )


class TestHarnessPresence:
    def test_harness_dir_layout(self):
        assert (harness_dir() / "package.json").is_file()
        assert (harness_dir() / "src" / "agent.ts").is_file()
        assert (harness_dir() / "src" / "workflow.ts").is_file()
        assert (harness_dir() / "src" / "tools.ts").is_file()

    def test_missing_cli_is_unavailable(self, monkeypatch):
        monkeypatch.setattr(mastra_client, "_CLI", harness_dir() / "dist" / "nope.js")
        assert is_available() is False

    def test_missing_node_is_unavailable(self, monkeypatch):
        import shutil

        monkeypatch.setattr(shutil, "which", lambda *_a, **_k: None)
        assert is_available() is False

    def test_narrate_returns_none_when_unavailable(self, monkeypatch):
        monkeypatch.setattr(mastra_client, "_CLI", harness_dir() / "dist" / "nope.js")
        assert asyncio.run(narrate_via_mastra({}, 90, 218)) is None


class TestLiveHarness:
    def test_cli_selftest(self):
        """Compiled CLI exercises tools + workflow shape with no model."""
        if not is_available():
            pytest.skip("mastra harness not built")
        proc = subprocess.run(
            ["node", str(harness_dir() / "dist" / "cli.js"), "selftest"],
            capture_output=True, text=True, timeout=120,
        )
        assert proc.returncode == 0, proc.stdout + proc.stderr
        assert json.loads(proc.stdout.strip())["ok"] is True


class TestOrchestrationOrder:
    def test_mastra_text_preferred_when_valid(self, snapshot, monkeypatch):
        from unittest.mock import patch

        monkeypatch.setattr(mastra_client, "is_available", lambda: True)
        with patch.object(llm_provider, "_chain", return_value=[{"name": "gemini-gemma4", "base_url": "https://example.test", "model": "gemma-4-26b-a4b-it", "api_key": "k"}]), patch.object(
            mastra_client, "narrate_via_mastra", return_value=grounded_text(snapshot)
        ), patch.object(llm_provider, "_chat") as chat:
            result = asyncio.run(llm_provider.narrate_with_model(snapshot))
        assert result is not None
        assert result["orchestrator"] == "mastra"
        assert result["fallback_used"] is False
        chat.assert_not_called()

    def test_mastra_text_still_validated(self, snapshot, monkeypatch):
        from unittest.mock import patch

        bad = "The moon is 47 percent lit and sits 92 fists above the horizon."
        monkeypatch.setattr(mastra_client, "is_available", lambda: True)
        with patch.object(llm_provider, "_chain", return_value=[{"name": "gemini-gemma4", "base_url": "https://example.test", "model": "gemma-4-26b-a4b-it", "api_key": "k"}]), patch.object(
            mastra_client, "narrate_via_mastra", return_value=bad
        ), patch.object(llm_provider, "_chat", return_value=None):
            result = asyncio.run(llm_provider.narrate_with_model(snapshot))
        assert result is None, "mastra output must pass the same gate"

    def test_mastra_failure_falls_to_direct(self, snapshot, monkeypatch):
        from unittest.mock import patch

        monkeypatch.setattr(mastra_client, "is_available", lambda: True)
        with patch.object(llm_provider, "_chain", return_value=[{"name": "gemini-gemma4", "base_url": "https://example.test", "model": "gemma-4-26b-a4b-it", "api_key": "k"}]), patch.object(
            mastra_client, "narrate_via_mastra", return_value=None
        ), patch.object(llm_provider, "_chat", return_value=grounded_text(snapshot)):
            result = asyncio.run(llm_provider.narrate_with_model(snapshot))
        assert result is not None
        assert result["orchestrator"] == "direct"
