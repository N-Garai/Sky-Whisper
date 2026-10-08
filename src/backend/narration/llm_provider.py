"""Open-weight LLM narration — Gemma via any OpenAI-compatible endpoint.

Providers are selected by environment, never hardcoded:
  LLM_PROVIDER=template  -> deterministic narrator only (default, $0)
  LLM_PROVIDER=openai    -> GEMMA_BASE_URL + GEMMA_API_KEY + GEMMA_MODEL
  LLM_PROVIDER=ollama    -> local Ollama daemon (LOCAL_INFERENCE=true)

The model never computes a coordinate. It receives the finished SkySnapshot
as structured facts and narrates it; every number it utters is validated
against the same facts before the text is used.
"""
from __future__ import annotations

import os
from typing import Any

import aiohttp

from src.backend.narration.template_narrator import (
    build_script,
    snapshot_facts,
    validate_narration,
    word_budget,
)
from src.shared.sky_snapshot import SkySnapshot

# The prompt contract: narrate, never calculate.
SYSTEM_PROMPT = """You are the SkyWhisper stargazing docent. A deterministic astronomy engine has already computed tonight's sky for the observer. Your job is ONLY to narrate it.

HARD CONSTRAINTS:
1. Every altitude, direction, phase, and magnitude you state must come verbatim from the facts given to you. Never invent, estimate, round, or infer a celestial fact.
2. Never emit a raw number of degrees or a compass bearing. Directions must be body-relative: "two fists above the eastern horizon", "halfway up the southern sky".
3. One fist-width held at arm's length is 10 degrees. The facts include pre-computed fist counts; use those.
4. Output is fluid spoken prose for text-to-speech. No markdown, no bullets, no headers, no parentheses, no stage directions.
5. Keep the tone calm, slow, and warm. The listener is lying outdoors in the dark with the screen off.
6. If a body is listed as below the horizon, say so gently or omit it — never place it in the sky.
"""


def _provider_config() -> dict[str, str]:
    """Resolve the active provider from environment, or None-equivalent."""
    provider = (os.getenv("LLM_PROVIDER") or "template").strip().lower()
    if provider == "ollama" or os.getenv("LOCAL_INFERENCE", "").lower() == "true":
        return {
            "provider": "ollama",
            "base_url": os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
            "model": os.getenv("OLLAMA_MODEL", "gemma3:1b"),
            "api_key": "",
        }
    if provider in ("openai", "gemma"):
        return {
            "provider": "openai",
            "base_url": os.getenv("GEMMA_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai"),
            "model": os.getenv("GEMMA_MODEL", "gemma-3-4b-it"),
            "api_key": os.getenv("GEMMA_API_KEY", ""),
        }
    return {"provider": "template", "base_url": "", "model": "", "api_key": ""}


def is_configured() -> bool:
    return _provider_config()["provider"] != "template"


def _facts_block(snap: SkySnapshot) -> str:
    """Render the snapshot as the closed set of facts the model may speak."""
    facts = snapshot_facts(snap)
    lines = [f"{k} = {v}" for k, v in sorted(facts.items())]
    return "\n".join(lines)


def _user_prompt(snap: SkySnapshot, duration_seconds: int) -> str:
    from src.backend.narration.template_narrator import word_budget

    budget = word_budget(duration_seconds)
    return (
        f"Narrate tonight's sky for about {duration_seconds} seconds of speech "
        f"(roughly {budget} words). Use only the facts below.\n\n"
        f"{_facts_block(snap)}\n\n"
        "Begin with the moon, then the visible planets, then the brightest stars, "
        "then one constellation to trace. End by telling the listener to put the "
        "phone down and look up."
    )


async def _chat(cfg: dict[str, str], system: str, user: str) -> str | None:
    """One OpenAI-compatible chat completion. Returns None on any failure."""
    if not cfg["base_url"]:
        return None
    url = f"{cfg['base_url'].rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if cfg["api_key"]:
        auth = "Bearer " + cfg["api_key"]
        headers["Authorization"] = auth
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


async def narrate_with_model(
    snap: SkySnapshot, duration_seconds: int = 90
) -> dict[str, Any] | None:
    """Model path. Returns a validated script, or None to fall back.

    Orchestration order: Mastra workflow first (when a provider is set and
    the harness is built), direct provider HTTP second, deterministic
    template narrator last. None is the honest signal: the caller uses the
    deterministic narrator rather than shipping unvalidated model output.
    """
    cfg = _provider_config()
    if cfg["provider"] == "template":
        return None

    budget = word_budget(duration_seconds)
    facts = snapshot_facts(snap)

    # Path 1 — Mastra agent harness (facts -> docent agent -> validate).
    from src.backend.narration.mastra_client import is_available, narrate_via_mastra

    orchestrator = "direct"
    text: str | None = None
    if is_available():
        text = await narrate_via_mastra(facts, duration_seconds, budget)
        if text is not None:
            orchestrator = "mastra"

    # Path 2 — direct provider HTTP (harness absent or its run unusable).
    if text is None:
        user = _user_prompt(snap, duration_seconds)
        text = await _chat(cfg, SYSTEM_PROMPT, user)

    if not text or len(text) < 120:
        return None

    # The guard that makes the zero-hallucination claim real — applied to
    # every model path, whichever orchestrator produced the text.
    ok, problems = validate_narration(text, facts)
    if not ok:
        # One regeneration attempt with the problems fed back.
        user = _user_prompt(snap, duration_seconds)
        retry_user = (
            user
            + "\n\nYour previous output was rejected for these reasons and must not "
            f"be repeated: {'; '.join(problems)}. Rewrite using only the facts above."
        )
        text = await _chat(cfg, SYSTEM_PROMPT, retry_user)
        orchestrator = "direct"
        if not text:
            return None
        ok, problems = validate_narration(text, facts)
        if not ok:
            return None

    return {
        "title": f"tonight above {abs(snap.location['latitude']):.1f}, {abs(snap.location['longitude']):.1f}",
        "script": text,
        "word_count": len(text.split()),
        "word_budget": budget,
        "claims": [],
        "warnings": snap.warnings,
        "fallback_used": False,
        "model": cfg["model"],
        "provider": cfg["provider"],
        "orchestrator": orchestrator,
        "facts": facts,
    }
