"""Open-weight LLM narration with an ordered model fallback chain.

Chain (first validated transcript wins; each stage is OpenAI-compatible):
  1. Gemini API  - Gemma 3   (GEMMA3_MODEL)
  2. Gemini API  - Gemma 4   (GEMMA4_MODEL)
  3. Groq        - open-weight model (GROQ_MODEL)
  4. NVIDIA NIM  - open-weight model (NVIDIA_MODEL)
  5. template narrator (deterministic, always available) - the caller's fallback

A stage is included only when its key is set. LOCAL_INFERENCE=true or
LLM_PROVIDER=ollama replaces the hosted chain with a local Ollama daemon.

The model never computes a coordinate. It receives the finished SkySnapshot
and the live conditions; every number it utters is validated against the
same facts before any stage's text is used.
"""
from __future__ import annotations

import os
from typing import Any

import aiohttp

from src.backend.narration.template_narrator import (
    snapshot_facts,
    validate_narration,
    word_budget,
)
from src.shared.sky_snapshot import SkySnapshot

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"
GROQ_BASE = "https://api.groq.com/openai/v1"
NVIDIA_BASE = "https://integrate.api.nvidia.com/v1"

# The prompt contract: narrate, never calculate.
SYSTEM_PROMPT = """You are the SkyWhisper stargazing docent. A deterministic astronomy engine has already computed tonight's sky for the observer. Your job is ONLY to narrate it.

HARD CONSTRAINTS:
1. Every altitude, direction, phase, and magnitude you state must come verbatim from the facts given to you. Never invent, estimate, round, or infer a celestial fact.
2. Never emit a raw number of degrees or a compass bearing. Directions must be body-relative: "two fists above the eastern horizon", "halfway up the southern sky".
3. One fist-width held at arm's length is 10 degrees. The facts include pre-computed fist counts; use those.
4. Output is fluid spoken prose for text-to-speech. No markdown, no bullets, no headers, no parentheses, no stage directions.
5. Keep the tone calm, slow, and warm. The listener is lying outdoors in the dark with the screen off.
6. If a body is listed as below the horizon, say so gently or omit it - never place it in the sky.
"""


def _chain() -> list[dict[str, str]]:
    """Ordered model stages. A stage is included only when its key is set."""
    if os.getenv("LOCAL_INFERENCE", "").lower() == "true" or \
       (os.getenv("LLM_PROVIDER") or "").strip().lower() == "ollama":
        return [{
            "name": "ollama",
            "base_url": os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"),
            "model": os.getenv("OLLAMA_MODEL", "gemma4:e2b"),
            "api_key": "",
        }]

    stages: list[dict[str, str]] = []
    gemini_key = os.getenv("GEMMA_API_KEY", "").strip()
    if gemini_key:
        stages.append({"name": "gemini-gemma3", "base_url": GEMINI_BASE,
                       "model": os.getenv("GEMMA3_MODEL", "gemma-3-27b-it"), "api_key": gemini_key})
        stages.append({"name": "gemini-gemma4", "base_url": GEMINI_BASE,
                       "model": os.getenv("GEMMA4_MODEL", "gemma-4-26b-a4b-it"), "api_key": gemini_key})
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if groq_key:
        stages.append({"name": "groq", "base_url": os.getenv("GROQ_BASE_URL", GROQ_BASE),
                       "model": os.getenv("GROQ_MODEL", "gemma2-9b-it"), "api_key": groq_key})
    nvidia_key = os.getenv("NVIDIA_API_KEY", "").strip()
    if nvidia_key:
        stages.append({"name": "nvidia-nim", "base_url": os.getenv("NVIDIA_BASE_URL", NVIDIA_BASE),
                       "model": os.getenv("NVIDIA_MODEL", "google/gemma-3-27b-it"), "api_key": nvidia_key})
    return stages


def _provider_config() -> dict[str, str]:
    """The first active stage, or a template marker."""
    stages = _chain()
    return stages[0] if stages else {"name": "template", "base_url": "", "model": "", "api_key": ""}


def is_configured() -> bool:
    return bool(_chain())


def _facts_block(snap: SkySnapshot) -> str:
    """Render the snapshot as the closed set of facts the model may speak."""
    facts = snapshot_facts(snap)
    return "\n".join(f"{k} = {v}" for k, v in sorted(facts.items()))


def _user_prompt(snap: SkySnapshot, duration_seconds: int) -> str:
    """The full live inputs plus the time budget the speech must fit."""
    budget = word_budget(duration_seconds)
    live = [
        f"sky state = {snap.sun.state}",
        f"weather = {snap.weather.label}"
        + (f", cloud cover {snap.weather.cloud_pct:.0f} percent" if snap.weather.cloud_pct is not None else ""),
    ]
    for sp in snap.satellite_passes[:2]:
        live.append(f"satellite pass = {sp.satellite} (rise {sp.rise_time}, peak {sp.peak_direction})")
    for w in snap.warnings[:2]:
        live.append(f"note = {w}")
    return (
        f"Write a transcript to be read aloud for EXACTLY about {duration_seconds} seconds "
        f"of speech: between {budget - 15} and {budget + 15} words. Count your words.\n\n"
        "Live conditions:\n" + "\n".join(live) + "\n\n"
        "Closed set of computed facts you may speak (use only these numbers):\n"
        f"{_facts_block(snap)}\n\n"
        "Structure: open with the moon, then the visible planets, then the brightest "
        "stars, then one constellation to trace, mention the weather and any pass, and "
        "end by telling the listener to put the phone down and look up."
    )


async def _chat(cfg: dict[str, str], system: str, user: str) -> str | None:
    """One OpenAI-compatible chat completion. Returns None on any failure."""
    if not cfg["base_url"]:
        return None
    url = f"{cfg['base_url'].rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if cfg["api_key"]:
        headers["Authorization"] = "Bearer " + cfg["api_key"]
    body = {
        "model": cfg["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.6,
        "max_tokens": 900,
        "stream": False,
    }
    timeout = aiohttp.ClientTimeout(total=45)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=headers, json=body) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


async def _stage_text(
    cfg: dict[str, str], snap: SkySnapshot, duration_seconds: int, facts: dict
) -> tuple[str | None, str]:
    """Run one chain stage. Returns (validated_text, reason).

    The same length and fact gates apply to every stage, so a bad stage is
    skipped rather than shipped.
    """
    budget = word_budget(duration_seconds)
    lo, hi = budget - 15, budget + 15
    user = _user_prompt(snap, duration_seconds)

    text = await _chat(cfg, SYSTEM_PROMPT, user)
    if not text or len(text) < 120:
        return None, "empty or too short"

    if not (lo <= len(text.split()) <= hi):
        retry = (
            user
            + f"\n\nYour previous attempt had {len(text.split())} words; "
            + f"it must be {lo} to {hi}. Rewrite it to that length."
        )
        text = await _chat(cfg, SYSTEM_PROMPT, retry)
        if not text or not (lo <= len(text.split()) <= hi):
            return None, "length out of range"

    ok, problems = validate_narration(text, facts)
    if not ok:
        retry = (
            user
            + "\n\nYour previous output was rejected for these reasons and must not be repeated: "
            + "; ".join(problems)
            + ". Rewrite using only the facts above."
        )
        text = await _chat(cfg, SYSTEM_PROMPT, retry)
        if not text:
            return None, "no text after validation retry"
        ok, problems = validate_narration(text, facts)
        if not ok:
            return None, "failed validation: " + "; ".join(problems)
    return text, "ok"


def _result(snap: SkySnapshot, text: str, facts: dict, budget: int,
            cfg: dict[str, str], orchestrator: str) -> dict[str, Any]:
    return {
        "title": f"tonight above {abs(snap.location['latitude']):.1f}, {abs(snap.location['longitude']):.1f}",
        "script": text,
        "word_count": len(text.split()),
        "word_budget": budget,
        "claims": [],
        "warnings": snap.warnings,
        "fallback_used": False,
        "model": cfg["model"],
        "provider": cfg["name"],
        "orchestrator": orchestrator,
        "facts": facts,
    }


async def narrate_with_model(
    snap: SkySnapshot, duration_seconds: int = 90
) -> dict[str, Any] | None:
    """Walk the model chain. Returns the first validated transcript, or None
    so the caller uses the template narrator.

    Mastra is tried first when its harness is available; its output still
    goes through the same length and validation gates.
    """
    stages = _chain()
    if not stages:
        return None

    budget = word_budget(duration_seconds)
    facts = snapshot_facts(snap)
    lo, hi = budget - 15, budget + 15
    attempts: list[str] = []

    from src.backend.narration.mastra_client import is_available, narrate_via_mastra

    if is_available():
        text = await narrate_via_mastra(facts, duration_seconds, budget)
        if text is not None:
            ok, _ = validate_narration(text, facts)
            if ok and lo <= len(text.split()) <= hi:
                return _result(snap, text, facts, budget, stages[0], "mastra")
            attempts.append("mastra: length/validation")

    for cfg in stages:
        text, reason = await _stage_text(cfg, snap, duration_seconds, facts)
        if text is not None:
            return _result(snap, text, facts, budget, cfg, "direct")
        attempts.append(f"{cfg['name']}: {reason}")

    # Every stage failed. Record why, so the response can say so honestly.
    snap.warnings.append("model chain fell back to template: " + " | ".join(attempts))
    return None
