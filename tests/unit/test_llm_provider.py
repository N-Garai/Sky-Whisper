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


CHAIN_ENV = ["LLM_PROVIDER", "LOCAL_INFERENCE", "GEMMA_API_KEY", "GEMMA3_MODEL",
             "GEMMA4_MODEL", "GROQ_API_KEY", "GROQ_MODEL", "NVIDIA_API_KEY", "NVIDIA_MODEL",
             "OLLAMA_MODEL", "OLLAMA_BASE_URL"]


@pytest.fixture
def clean_env(monkeypatch):
    for k in CHAIN_ENV:
        monkeypatch.delenv(k, raising=False)
    return monkeypatch


def test_no_keys_means_template_only(clean_env):
    assert llm_provider._chain() == []
    assert llm_provider.is_configured() is False
    assert _provider_config()["name"] == "template"


def test_chain_order_gemini_gemma3_then_gemma4(clean_env):
    clean_env.setenv("GEMMA_API_KEY", "k")
    names = [c["name"] for c in llm_provider._chain()]
    assert names == ["gemini-gemma3", "gemini-gemma4"]
    models = [c["model"] for c in llm_provider._chain()]
    assert models == ["gemma-3-27b-it", "gemma-4-26b-a4b-it"]


def test_groq_and_nvidia_join_only_when_keyed(clean_env):
    clean_env.setenv("GEMMA_API_KEY", "k")
    clean_env.setenv("GROQ_API_KEY", "g")
    clean_env.setenv("NVIDIA_API_KEY", "n")
    names = [c["name"] for c in llm_provider._chain()]
    assert names == ["gemini-gemma3", "gemini-gemma4", "groq", "nvidia-nim"]


def test_only_groq_keyed_skips_gemini(clean_env):
    clean_env.setenv("GROQ_API_KEY", "g")
    assert [c["name"] for c in llm_provider._chain()] == ["groq"]


def test_local_inference_replaces_hosted_chain(clean_env):
    clean_env.setenv("LOCAL_INFERENCE", "true")
    clean_env.setenv("GEMMA_API_KEY", "k")
    chain = llm_provider._chain()
    assert [c["name"] for c in chain] == ["ollama"]
    assert chain[0]["base_url"].startswith("http://127.0.0.1:11434")


def test_first_passing_stage_wins(snapshot, clean_env):
    """Gemini Gemma 3 produces a valid transcript, so later stages are never called."""
    clean_env.setenv("GEMMA_API_KEY", "k")
    clean_env.setenv("GROQ_API_KEY", "g")
    good = grounded_for(snapshot)
    with patch.object(llm_provider, "_chat", return_value=good) as chat:
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is not None
    assert result["provider"] == "gemini-gemma3"
    assert chat.call_count == 1


def test_failed_stage_moves_to_next(snapshot, clean_env):
    """Gemma 3 errors, Gemma 4 produces a valid transcript."""
    clean_env.setenv("GEMMA_API_KEY", "k")
    good = grounded_for(snapshot)
    responses = iter([None, good])
    with patch.object(llm_provider, "_chat", side_effect=lambda *a, **k: next(responses)):
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is not None
    assert result["provider"] == "gemini-gemma4"


def test_all_stages_failing_falls_back_to_template(snapshot, clean_env):
    clean_env.setenv("GEMMA_API_KEY", "k")
    clean_env.setenv("GROQ_API_KEY", "g")
    with patch.object(llm_provider, "_chat", return_value=None):
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is None
    assert any("model chain fell back to template" in w for w in snapshot.warnings)


def grounded_for(snapshot) -> str:
    """Budget-sized grounded text for the default 90 s duration."""
    facts = snapshot_facts(snapshot)
    illum = int(round(facts["moon.illumination_pct"]))
    fists = int(facts["moon.fists"])
    filler = " ".join(["the sky is patient and the night is calm"] * 22)
    return f" Tonight the moon is {illum} percent lit. Find it {fists} fists above the horizon. "            "Take a slow breath, and let your eyes relax. " + filler + "."


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
    with patch.object(llm_provider, "_chain", return_value=[{"name": "gemini-gemma4", "base_url": "https://example.test", "model": "gemma-4-26b-a4b-it", "api_key": "k"}]), patch.object(llm_provider, "_chat", return_value=bad):
        result = asyncio.run(narrate_with_model(snapshot))
    assert result is None, "unvalidated model output must not be shipped"


def test_model_output_passing_validation_is_used(snapshot):
    """A model response that stays inside the fact whitelist is accepted."""
    facts = snapshot_facts(snapshot)
    illum = int(round(facts["moon.illumination_pct"]))
    fists = int(facts["moon.fists"])
    filler = " ".join(["the sky is patient and the night is calm"] * 22)
    good = (
        f" Tonight the moon is {illum} percent lit. "
        f"Find it {fists} fists above the horizon. "
        "Take a slow breath, and let your eyes relax. "
        + filler + "."
    )
    with patch.object(llm_provider, "_chain", return_value=[{"name": "gemini-gemma4", "base_url": "https://example.test", "model": "gemma-4-26b-a4b-it", "api_key": "k"}]), patch.object(llm_provider, "_chat", return_value=good):
        result = asyncio.run(narrate_with_model(snapshot))
    assert result is not None
    assert result["fallback_used"] is False
    assert result["model"] == "gemma-4-26b-a4b-it"
    assert result["provider"] == "gemini-gemma4"


def test_unavailable_provider_degrades_to_template(snapshot):
    """A provider that errors returns None; the caller falls back."""
    with patch.object(llm_provider, "_chain", return_value=[{"name": "ollama", "base_url": "http://127.0.0.1:11434", "model": "gemma3:1b", "api_key": ""}]), patch.object(llm_provider, "_chat", return_value=None):
        result = asyncio.run(narrate_with_model(snapshot))
    assert result is None
    # And the deterministic narrator still produces a valid script.
    fallback = build_script(snapshot)
    assert fallback["fallback_used"] is True
    assert len(fallback["script"]) > 200



def test_transcript_outside_time_budget_is_rejected(snapshot):
    """A reply far longer than the chosen duration is never shipped."""
    facts = snapshot_facts(snapshot)
    illum = int(round(facts["moon.illumination_pct"]))
    long_text = f"The moon is {illum} percent lit. " + " ".join(["the stars wait"] * 400)
    cfg = [{"name": "gemini-gemma4", "base_url": "https://example.test",
            "model": "gemma-4-26b-a4b-it", "api_key": "k"}]
    with patch.object(llm_provider, "_chain", return_value=cfg), patch.object(llm_provider, "_chat", return_value=long_text):
        result = asyncio.run(narrate_with_model(snapshot, duration_seconds=60))
    assert result is None
