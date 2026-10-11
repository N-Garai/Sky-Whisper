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

    def test_mastra_receives_rung_overrides(self, snapshot, monkeypatch):
        """Each chain rung pins the harness to its own endpoint via env."""
        from unittest.mock import patch

        seen: dict = {}
        monkeypatch.setattr(mastra_client, "is_available", lambda: True)

        async def fake_mastra(*args, **kwargs):
            seen.update(kwargs.get("env_overrides") or {})
            return grounded_text(snapshot)

        with patch.object(llm_provider, "_chain", return_value=[{"name": "groq", "base_url": "https://api.groq.com/openai/v1", "model": "openai/gpt-oss-120b", "api_key": "g"}]), patch.object(
            mastra_client, "narrate_via_mastra", side_effect=fake_mastra
        ), patch.object(llm_provider, "_chat") as chat:
            result = asyncio.run(llm_provider.narrate_with_model(snapshot))
        assert result is not None
        assert result["orchestrator"] == "mastra"
        assert seen["MASTRA_MODEL_ID"] == "openai/gpt-oss-120b"
        assert seen["MASTRA_BASE_URL"] == "https://api.groq.com/openai/v1"
        assert seen["MASTRA_API_KEY"] == "g"
        chat.assert_not_called()

    def test_hanging_subprocess_is_killed(self, monkeypatch):
        """A stuck harness can never become an orphan: timeout kills it."""
        import asyncio as aio
        import time as time_mod

        killed = {"n": 0}

        class HangingProc:
            returncode = None

            async def communicate(self, *a):
                await aio.sleep(30)
                return (b"", b"")

            def kill(self):
                killed["n"] += 1
                self.returncode = -9

            async def wait(self):
                return self.returncode

        async def fake_exec(*a, **k):
            return HangingProc()

        monkeypatch.setattr(mastra_client, "is_available", lambda: True)
        # Patch at the asyncio module (reverted after the test): the point is
        # that OUR code kills whatever handle the spawn returns.
        monkeypatch.setattr(aio, "create_subprocess_exec", fake_exec)
        t0 = time_mod.monotonic()
        result = asyncio.run(narrate_via_mastra({}, 90, 218, timeout=0.5))
        dt = time_mod.monotonic() - t0
        assert result is None
        assert killed["n"] == 1
        assert dt < 15

    def test_mastra_tried_once_per_pack(self, snapshot, monkeypatch):
        """One harness spawn per pack: later rungs go direct, never respawn."""
        from unittest.mock import patch

        calls: list = []
        monkeypatch.setattr(mastra_client, "is_available", lambda: True)

        async def fake_mastra(*args, **kwargs):
            calls.append((kwargs.get("env_overrides") or {}).get("MASTRA_MODEL_ID"))
            return None

        chain = [
            {"name": "gemini-gemma3", "base_url": "https://example.test",
             "model": "gemma-3-27b-it", "api_key": "k"},
            {"name": "gemini-gemma4", "base_url": "https://example.test",
             "model": "gemma-4-26b-a4b-it", "api_key": "k"},
        ]
        with patch.object(llm_provider, "_chain", return_value=chain), patch.object(
            mastra_client, "narrate_via_mastra", side_effect=fake_mastra
        ), patch.object(llm_provider, "_chat", return_value=grounded_text(snapshot)):
            result = asyncio.run(llm_provider.narrate_with_model(snapshot))
        assert result is not None
        assert result["orchestrator"] == "direct"
        assert calls == ["gemma-3-27b-it"]

    def test_narration_budget_skips_remaining_rungs(self, snapshot, monkeypatch):
        """Past the global budget the template answers instead of hanging."""
        from unittest.mock import patch

        monkeypatch.setattr(llm_provider, "NARRATION_BUDGET_S", -1)
        chain = [
            {"name": "gemini-gemma3", "base_url": "https://example.test",
             "model": "gemma-3-27b-it", "api_key": "k"},
            {"name": "groq", "base_url": "https://example.test",
             "model": "openai/gpt-oss-120b", "api_key": "g"},
        ]
        with patch.object(llm_provider, "_chain", return_value=chain), patch.object(
            llm_provider, "_chat") as chat:
            result = asyncio.run(llm_provider.narrate_with_model(snapshot))
        assert result is None
        chat.assert_not_called()
        attempts = llm_provider.last_attempts()
        assert len(attempts) == 2
        assert all("budget" in a["reason"] for a in attempts)
