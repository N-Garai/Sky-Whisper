"""Tests for the open-weight model narration path (M4).

The model path is tested hermetically: no live provider is ever called.
What we verify is the contract that makes it safe to ship:
  - the prompt contract forbids computing coordinates
  - validation is what gates model output
  - a failing/unavailable provider degrades to the deterministic narrator
"""
from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from src.backend.narration import llm_provider
from src.backend.narration.llm_provider import (
    SYSTEM_PROMPT,
    _provider_config,
    narrate_with_model,
)
from src.backend.narration.template_narrator import build_script, snapshot_facts
from src.shared.schemas import PackRequest
from src.backend.core.astronomy import build_snapshot


@pytest.fixture
def snapshot():
    req = PackRequest(latitude=22.5726, longitude=88.3639, timestamp="2026-10-07T18:00:00Z")
    return build_snapshot(req)


def test_system_prompt_forbids_computing_coordinates():
    """The model must narrate facts, never derive them."""
    lowered = SYSTEM_PROMPT.lower()
    assert "only to narrate" in lowered
    assert "never invent" in lowered or "never estimate" in lowered
    assert "fist" in lowered  # body-relative language is mandated
    assert "no markdown" in lowered


def test_provider_defaults_to_template(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LOCAL_INFERENCE", raising=False)
    cfg = _provider_config()
    assert cfg["provider"] == "template"
    assert llm_provider.is_configured() is False


def test_ollama_routing_uses_loopback(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    cfg = _provider_config()
    assert cfg["provider"] == "ollama"
    assert cfg["base_url"].startswith("http://127.0.0.1:11434")
    assert cfg["model"] == "gemma3:1b"


def test_local_inference_flag_routes_to_ollama(monkeypatch):
    """LOCAL_INFERENCE=true is the documented offline swap."""
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.setenv("LOCAL_INFERENCE", "true")
    cfg = _provider_config()
    assert cfg["provider"] == "ollama"


def test_openai_routing_reads_gemma_env(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("GEMMA_MODEL", "gemma-3-27b-it")
    cfg = _provider_config()
    assert cfg["provider"] == "openai"
    assert cfg["model"] == "gemma-3-27b-it"


def test_template_provider_never_calls_network(snapshot):
    """With no provider configured, the model path returns None — the
    deterministic narrator is used, and no API call is attempted."""
    with patch.object(llm_provider, "_chat") as chat:
        result = asyncio.run(narrate_with_model(snapshot))
    assert result is None
    chat.assert_not_called()


def test_model_output_is_validated_before_use(snapshot):
    """A model that invents a number is rejected and we fall back."""
    bad = "The moon is 47 percent lit and sits 92 fists above the horizon."
    with patch.object(llm_provider, "_provider_config", return_value={
        "provider": "openai", "base_url": "https://example.test",
        "model": "gemma-3-4b-it", "api_key": "k",
    }), patch.object(llm_provider, "_chat", return_value=bad):
        result = asyncio.run(narrate_with_model(snapshot))
    assert result is None, "unvalidated model output must not be shipped"


def test_model_output_passing_validation_is_used(snapshot):
    """A model response that stays inside the fact whitelist is accepted."""
    facts = snapshot_facts(snapshot)
    illum = int(round(facts["moon.illumination_pct"]))
    fists = int(facts["moon.fists"])
    good = (
        f" Tonight the moon is {illum} percent lit. "
        f"Find it {fists} fists above the horizon. "
        "Take a slow breath, and let your eyes relax. "
        "The stars are patient, and there is no hurry at all."
    )
    with patch.object(llm_provider, "_provider_config", return_value={
        "provider": "openai", "base_url": "https://example.test",
        "model": "gemma-3-4b-it", "api_key": "k",
    }), patch.object(llm_provider, "_chat", return_value=good):
        result = asyncio.run(narrate_with_model(snapshot))
    assert result is not None
    assert result["fallback_used"] is False
    assert result["model"] == "gemma-3-4b-it"
    assert result["provider"] == "openai"


def test_unavailable_provider_degrades_to_template(snapshot):
    """A provider that errors returns None; the caller falls back."""
    with patch.object(llm_provider, "_provider_config", return_value={
        "provider": "ollama", "base_url": "http://127.0.0.1:11434",
        "model": "gemma3:1b", "api_key": "",
    }), patch.object(llm_provider, "_chat", return_value=None):
        result = asyncio.run(narrate_with_model(snapshot))
    assert result is None
    # And the deterministic narrator still produces a valid script.
    fallback = build_script(snapshot)
    assert fallback["fallback_used"] is True
    assert len(fallback["script"]) > 200
