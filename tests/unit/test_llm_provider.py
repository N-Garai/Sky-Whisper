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


CHAIN_ENV = ["LLM_PROVIDER", "LOCAL_INFERENCE", "GEMMA_API_KEY", "GEMMA_MODEL", "GEMMA3_MODEL",
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
    assert names == ["gemini-fast", "gemini-large"]
    models = [c["model"] for c in llm_provider._chain()]
    assert models == ["gemma-4-26b-a4b-it", "gemma-4-31b-it"]


def test_groq_and_nvidia_join_only_when_keyed(clean_env):
    clean_env.setenv("GEMMA_API_KEY", "k")
    clean_env.setenv("GROQ_API_KEY", "g")
    clean_env.setenv("NVIDIA_API_KEY", "n")
    names = [c["name"] for c in llm_provider._chain()]
    assert names == ["gemini-fast", "gemini-large", "groq", "nvidia-nim"]


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
    assert result["provider"] == "gemini-fast"
    assert result["generation"]["label"] == "Gemini gemma-4-26b-a4b-it"
    assert chat.call_count == 1


def test_failed_stage_moves_to_next(snapshot, clean_env):
    """Gemini fast errors, Gemini large produces a valid transcript."""
    clean_env.setenv("GEMMA_API_KEY", "k")
    good = grounded_for(snapshot)
    responses = iter([None, None, good])
    with patch.object(llm_provider, "_chat", side_effect=lambda *a, **k: next(responses)):
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is not None
    assert result["provider"] == "gemini-large"


def test_all_stages_failing_falls_back_to_template(snapshot, clean_env):
    from src.backend.narration import mastra_client

    clean_env.setenv("GEMMA_API_KEY", "k")
    clean_env.setenv("GROQ_API_KEY", "g")
    with patch.object(mastra_client, "is_available", return_value=False), patch.object(
        llm_provider, "_chat", return_value=None):
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is None
    attempts = llm_provider.last_attempts()
    assert [a["stage"] for a in attempts] == ["gemini-fast", "gemini-large", "groq"]
    assert all(a["status"] == "failed" for a in attempts)
    assert llm_provider.template_generation()["status"] == "template"


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
    good = grounded_for(snapshot)
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


def test_plausible_length_outside_tight_band_ships(snapshot, clean_env):
    """A fact-clean narration near the budget is accepted even outside ±15 words."""
    from src.backend.narration import mastra_client

    facts = snapshot_facts(snapshot)
    illum = int(round(facts["moon.illumination_pct"]))
    # ~120 words for a 90 s / 218-word budget: outside tight, inside wide.
    text = f"The moon is {illum} percent lit tonight. " + " ".join(["the night sky is calm and clear"] * 17) + "."
    assert 60 <= len(text.split()) <= 654
    cfg = [{"name": "groq", "base_url": "https://example.test",
            "model": "openai/gpt-oss-120b", "api_key": "g"}]
    with patch.object(mastra_client, "is_available", return_value=False), patch.object(
        llm_provider, "_chain", return_value=cfg), patch.object(llm_provider, "_chat", return_value=text):
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is not None
    assert result["provider"] == "groq"


def test_duplicate_model_rung_is_skipped(snapshot, clean_env):
    """The same model twice in a chain is tried once, not billed twice."""
    from src.backend.narration import mastra_client

    cfg = [
        {"name": "gemini-fast", "base_url": "https://example.test",
         "model": "gemma-4-26b-a4b-it", "api_key": "k"},
        {"name": "gemini-large", "base_url": "https://example.test",
         "model": "gemma-4-26b-a4b-it", "api_key": "k"},
        {"name": "groq", "base_url": "https://example.test",
         "model": "openai/gpt-oss-120b", "api_key": "g"},
    ]
    responses = iter([None, None, grounded_for(snapshot)])
    with patch.object(mastra_client, "is_available", return_value=False), patch.object(
        llm_provider, "_chain", return_value=cfg), patch.object(
        llm_provider, "_chat", side_effect=lambda *a, **k: next(responses)) as chat:
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is not None
    assert result["provider"] == "groq"
    assert chat.call_count == 3
    skips = [a for a in result["generation"]["attempts"] if a["status"] == "skipped"]
    assert len(skips) == 1 and skips[0]["stage"] == "gemini-large"


def test_gemma_model_env_falls_back_to_gemma3(clean_env):
    """The legacy GEMMA_MODEL name still selects the Gemma 3 rung."""
    clean_env.setenv("GEMMA_API_KEY", "k")
    clean_env.setenv("GEMMA_MODEL", "gemma-3-4b-it")
    chain = llm_provider._chain()
    assert chain[0]["model"] == "gemma-3-4b-it"


def test_chain_defaults_are_live_ids(clean_env):
    """Defaults must be models the providers actually serve (see docs)."""
    clean_env.setenv("GEMMA_API_KEY", "k")
    clean_env.setenv("GROQ_API_KEY", "g")
    clean_env.setenv("NVIDIA_API_KEY", "n")
    models = {c["name"]: c["model"] for c in llm_provider._chain()}
    assert models["groq"] == "openai/gpt-oss-120b"
    assert models["nvidia-nim"] == "meta/llama-3.1-8b-instruct"


def test_budget_echo_is_allowed_not_hallucination(snapshot, clean_env):
    """A model quoting the prompt's own budget numbers must not be rejected."""
    base = grounded_for(snapshot)
    # grounded_for is ~221 words; appending the echo keeps it in-band.
    text = base + " This fits between 203 and 233 words."
    cfg = [{"name": "gemini-fast", "base_url": "https://example.test",
            "model": "gemma-4-26b-a4b-it", "api_key": "k"}]
    with patch.object(llm_provider, "_chain", return_value=cfg), patch.object(
        llm_provider, "_chat", return_value=text):
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is not None
    assert result["provider"] == "gemini-fast"


def test_raw_altitudes_rejected_then_next_text_wins(snapshot):
    """Production failure, pinned: a model emitting raw degree altitudes is
    rejected, and its clean retry ships."""
    from src.backend.narration import mastra_client

    base = grounded_for(snapshot)
    altitudes = base + " Saturn sits at 55 degrees altitude and 135 degrees azimuth tonight."
    cfg = [{"name": "gemini-fast", "base_url": "https://example.test",
            "model": "gemma-4-26b-a4b-it", "api_key": "k"}]
    responses = iter([altitudes, base])
    with patch.object(mastra_client, "is_available", return_value=False), patch.object(
        llm_provider, "_chain", return_value=cfg), patch.object(
        llm_provider, "_chat", side_effect=lambda *a, **k: next(responses)):
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is not None
    assert "55 degrees" not in result["script"]


def test_rung_deadline_skips_slow_rung(snapshot):
    """A rung past its time share is skipped instead of retried into oblivion."""
    from src.backend.narration import mastra_client

    monkeypatch_rung = llm_provider.RUNG_BUDGET_S
    llm_provider.RUNG_BUDGET_S = -1
    try:
        cfg = [{"name": "groq", "base_url": "https://example.test",
                "model": "openai/gpt-oss-120b", "api_key": "g"}]
        with patch.object(mastra_client, "is_available", return_value=False), patch.object(
            llm_provider, "_chain", return_value=cfg), patch.object(
            llm_provider, "_chat") as chat:
            result = asyncio.run(narrate_with_model(snapshot, 90))
        assert result is None
        chat.assert_not_called()
        skips = [a for a in llm_provider.last_attempts() if a["status"] == "skipped"]
        assert skips and "rung budget" in skips[0]["reason"]
    finally:
        llm_provider.RUNG_BUDGET_S = monkeypatch_rung


def test_prompt_never_asks_for_counting(snapshot):
    """'Count your words' made models enumerate numbers aloud; gone for good."""
    prompt = llm_provider._user_prompt(snapshot, 90)
    assert "Count your words" not in prompt
    assert "EXACTLY" not in prompt
    assert "enumerate" in prompt


def test_empty_reply_gets_one_retry_then_wins(snapshot):
    """A transient empty reply is retried once instead of killing the rung."""
    from src.backend.narration import mastra_client

    good = grounded_for(snapshot)
    responses = iter([None, good])
    cfg = [{"name": "groq", "base_url": "https://example.test",
            "model": "openai/gpt-oss-120b", "api_key": "g"}]
    with patch.object(mastra_client, "is_available", return_value=False), patch.object(
        llm_provider, "_chain", return_value=cfg), patch.object(
        llm_provider, "_chat", side_effect=lambda *a, **k: next(responses)) as chat:
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is not None
    assert result["provider"] == "groq"
    assert chat.call_count == 2


def test_retired_model_id_falls_back_within_rung(snapshot):
    """Production failure, pinned: a 404/Gone model ID switches to the
    rung's fallback instead of failing the rung (or the pack)."""
    from src.backend.narration import mastra_client

    async def gone_then_ok(url, headers, body):
        # First ID retired, fallback serves.
        if body["model"] == "meta/llama-3.1-8b-instruct":
            return None, ["HTTP 404: 404 page not found"]
        return grounded_for(snapshot), []

    calls: list[str] = []

    async def fake_chat(cfg, system, user, errors):
        text, errs = await gone_then_ok(None, None, {"model": cfg["model"]})
        errors.extend(errs)
        if text is None:
            errors.append("HTTP 404: 404 page not found")
        return text

    cfg = [{"name": "nvidia-nim", "base_url": "https://example.test",
            "model": "meta/llama-3.1-8b-instruct",
            "fallback_model": "google/gemma-2-9b-it", "api_key": "n"}]
    with patch.object(mastra_client, "is_available", return_value=False), patch.object(
        llm_provider, "_chain", return_value=cfg), patch.object(
        llm_provider, "_chat", side_effect=fake_chat):
        result = asyncio.run(narrate_with_model(snapshot, 90))
    # The fallback answers, and the win is recorded — not silent.
    assert result is not None
    assert result["model"] == "google/gemma-2-9b-it"
    rec = [a for a in result["generation"]["attempts"] if a["status"] == "recovered"]
    assert len(rec) == 1 and "meta/llama-3.1-8b-instruct" in rec[0]["reason"]


def test_fallback_win_reports_fallback_model(snapshot):
    """When the fallback answers, the result names it — never the dead ID."""
    from src.backend.narration import mastra_client

    good = grounded_for(snapshot)
    calls: list[str] = []

    async def fake_chat(cfg, system, user, errors):
        calls.append(cfg["model"])
        if cfg["model"] == "meta/llama-3.1-8b-instruct":
            errors.append("HTTP 410: Gone: the model has reached its end of life")
            return None
        return good

    cfg = [{"name": "nvidia-nim", "base_url": "https://example.test",
            "model": "meta/llama-3.1-8b-instruct",
            "fallback_model": "google/gemma-2-9b-it", "api_key": "n"}]
    with patch.object(mastra_client, "is_available", return_value=False), patch.object(
        llm_provider, "_chain", return_value=cfg), patch.object(
        llm_provider, "_chat", side_effect=fake_chat):
        result = asyncio.run(narrate_with_model(snapshot, 90))
    assert result is not None
    assert result["model"] == "google/gemma-2-9b-it"
    assert calls[0] == "meta/llama-3.1-8b-instruct"
