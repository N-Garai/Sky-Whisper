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

Every run returns a `generation` record: which stage answered, and for each
stage that was tried, why it did not (HTTP status, exception, or validation
failure). API keys are never recorded.
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
            "label": "Ollama (local)",
            "base_url": os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"),
            "model": os.getenv("OLLAMA_MODEL", "gemma4:e2b"),
            "api_key": "",
        }]

    stages: list[dict[str, str]] = []
    gemini_key = os.getenv("GEMMA_API_KEY", "").strip()
    if gemini_key:
        gemma3 = (os.getenv("GEMMA3_MODEL") or os.getenv("GEMMA_MODEL") or "gemma-3-27b-it").strip()
        stages.append({"name": "gemini-gemma3", "label": "Gemma 3 (Gemini API)",
                       "base_url": GEMINI_BASE,
                       "model": gemma3, "api_key": gemini_key})
        stages.append({"name": "gemini-gemma4", "label": "Gemma 4 (Gemini API)",
                       "base_url": GEMINI_BASE,
                       "model": os.getenv("GEMMA4_MODEL", "gemma-4-26b-a4b-it").strip(), "api_key": gemini_key})
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if groq_key:
        # gemma2-9b-it was retired by Groq (2025-10 shutdown); gpt-oss-120b
        # is Groq's recommended open-weight replacement (131K context).
        stages.append({"name": "groq", "label": "Groq",
                       "base_url": os.getenv("GROQ_BASE_URL", GROQ_BASE),
                       "model": os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"), "api_key": groq_key})
    nvidia_key = os.getenv("NVIDIA_API_KEY", "").strip()
    if nvidia_key:
        # google/gemma-7b is the model in NVIDIA's own NIM API reference
        # examples, so it is the safest served default; override freely.
        stages.append({"name": "nvidia-nim", "label": "NVIDIA NIM",
                       "base_url": os.getenv("NVIDIA_BASE_URL", NVIDIA_BASE),
                       "model": os.getenv("NVIDIA_MODEL", "google/gemma-7b"), "api_key": nvidia_key})
    return stages


def chain_signature() -> str:
    """Stable description of the configured chain, for the pack cache key."""
    return "|".join(f"{c['name']}:{c['model']}" for c in _chain()) or "template"


def _provider_config() -> dict[str, str]:
    """The first active stage, or a template marker."""
    stages = _chain()
    return stages[0] if stages else {"name": "template", "label": "Template",
                                     "base_url": "", "model": "", "api_key": ""}


def is_configured() -> bool:
    return bool(_chain())


def _length_bands(budget: int) -> tuple[int, int, int, int]:
    """Tight target band plus a wide sanity band.

    The tight band (±15 words) is what the prompt asks for and what earns a
    pass without a retry. The wide band accepts any fact-clean narration of
    plausible spoken length — rejecting those is what kept the whole chain
    stuck on template. Anything outside the wide band is a degenerate runaway.
    """
    return budget - 15, budget + 15, max(60, budget // 3), budget * 3


def _facts_block(snap: SkySnapshot) -> str:
    """Render the snapshot as the closed set of facts the model may speak."""
    facts = snapshot_facts(snap)
    return "\n".join(f"{k} = {v}" for k, v in sorted(facts.items()))


def _user_prompt(snap: SkySnapshot, duration_seconds: int,
                 extra_context: str | None = None) -> str:
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
    context = f"\n\nListener request to honor first:\n{extra_context.strip()}\n" if extra_context and extra_context.strip() else ""
    return (
        f"Write a transcript to be read aloud for EXACTLY about {duration_seconds} seconds "
        f"of speech: between {budget - 15} and {budget + 15} words. Count your words.\n"
        f"{context}\n"
        "Live conditions:\n" + "\n".join(live) + "\n\n"
        "Closed set of computed facts you may speak (use only these numbers):\n"
        f"{_facts_block(snap)}\n\n"
        "Structure: open with the moon, then the visible planets, then the brightest "
        "stars, then one constellation to trace, mention the weather and any pass, and "
        "end by telling the listener to put the phone down and look up."
    )


async def _chat(cfg: dict[str, str], system: str, user: str,
                errors: list[str]) -> str | None:
    """One OpenAI-compatible chat completion. Returns None on any failure.

    Every failure appends a short reason to `errors`: the HTTP status with a
    provider message excerpt, or the exception type. API keys are never
    included.
    """
    if not cfg["base_url"]:
        errors.append("no base url configured")
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
                    detail = (await resp.text())[:120].replace("\n", " ")
                    errors.append(f"HTTP {resp.status}: {detail}"[:200])
                    return None
                data = await resp.json()
                return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:  # network, timeout, malformed response
        errors.append(f"{type(exc).__name__}: {exc}"[:200])
        return None


async def _stage_text(
    cfg: dict[str, str], snap: SkySnapshot, duration_seconds: int, facts: dict,
    errors: list[str], extra_context: str | None = None,
) -> str | None:
    """Run one chain stage. Returns validated text, or None with reasons in `errors`.

    The same length and fact gates apply to every stage, so a bad stage is
    skipped rather than shipped.
    """
    budget = word_budget(duration_seconds)
    lo, hi, wide_lo, wide_hi = _length_bands(budget)
    user = _user_prompt(snap, duration_seconds, extra_context)

    text = await _chat(cfg, SYSTEM_PROMPT, user, errors)
    if not text or len(text) < 120:
        errors.append("reply empty or too short")
        return None

    if not (lo <= len(text.split()) <= hi):
        retry = (
            user
            + f"\n\nYour previous attempt had {len(text.split())} words; "
            + f"it must be {lo} to {hi}. Rewrite it to that length."
        )
        text = await _chat(cfg, SYSTEM_PROMPT, retry, errors)
        if not text or len(text) < 120:
            errors.append("reply empty or too short after retry")
            return None
        # One retry is all the budget buys. A fact-clean narration inside
        # the wide band still ships — only degenerate runaways are dropped.
        if not ((lo <= len(text.split()) <= hi) or (wide_lo <= len(text.split()) <= wide_hi)):
            errors.append("length out of range after retry")
            return None

    ok, problems = validate_narration(text, facts)
    if not ok:
        retry = (
            user
            + "\n\nYour previous output was rejected for these reasons and must not be repeated: "
            + "; ".join(problems)
            + ". Rewrite using only the facts above."
        )
        text = await _chat(cfg, SYSTEM_PROMPT, retry, errors)
        if not text:
            errors.append("no text after validation retry")
            return None
        ok, problems = validate_narration(text, facts)
        if not ok:
            errors.append("failed validation: " + "; ".join(problems))
            return None
    return text


def _generation(stage: dict[str, str] | None, attempts: list[dict[str, str]],
                status: str) -> dict[str, Any]:
    """The record the UI shows. Contains no secrets."""
    name = stage.get("name", "template") if stage else "template"
    return {
        "status": status,                       # "model" | "template"
        "stage": name,
        "label": (stage.get("label") or name) if stage else "Template narrator",
        "model": stage.get("model", "template") if stage else "template",
        "attempts": attempts,                   # every stage tried, in order
    }


def _result(snap: SkySnapshot, text: str, facts: dict, budget: int,
            cfg: dict[str, str], orchestrator: str,
            attempts: list[dict[str, str]]) -> dict[str, Any]:
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
        "generation": _generation(cfg, attempts, "model"),
        "facts": facts,
    }


async def narrate_with_model(
    snap: SkySnapshot, duration_seconds: int = 90,
    extra_context: str | None = None,
) -> dict[str, Any] | None:
    """Walk the model chain. Returns the first validated transcript, or None
    so the caller uses the template narrator.

    `extra_context` (a listener question) is honored first by every path,
    including the Mastra workflow. The caller can read the reasons from
    `last_attempts()` after a None result. Mastra is tried first when its
    harness is available; its output still goes through the same length
    and validation gates.
    """
    global _LAST_ATTEMPTS
    _LAST_ATTEMPTS = []
    stages = _chain()
    if not stages:
        return None

    budget = word_budget(duration_seconds)
    facts = snapshot_facts(snap)
    lo, hi, wide_lo, wide_hi = _length_bands(budget)
    attempts: list[dict[str, str]] = []
    tried_models: set[str] = set()

    from src.backend.narration.mastra_client import is_available, narrate_via_mastra

    mastra_up = is_available()

    def _mastra_ok(text: str) -> bool:
        ok, _ = validate_narration(text, facts)
        n = len(text.split())
        return ok and ((lo <= n <= hi) or (wide_lo <= n <= wide_hi))

    for cfg in stages:
        if cfg["model"] in tried_models:
            attempts.append({"stage": cfg["name"], "status": "skipped",
                             "reason": "same model already tried"})
            continue
        tried_models.add(cfg["model"])

        # Path 1 — Mastra workflow for this rung (facts -> agent -> validate),
        # pinned to the rung's endpoint via environment overrides.
        if mastra_up:
            text = await narrate_via_mastra(
                facts, duration_seconds, budget,
                env_overrides={
                    "MASTRA_MODEL_ID": cfg["model"],
                    "MASTRA_BASE_URL": cfg["base_url"],
                    "MASTRA_API_KEY": cfg.get("api_key", ""),
                },
                context=extra_context,
            )
            if text is not None and _mastra_ok(text):
                return _result(snap, text, facts, budget, cfg, "mastra", attempts)
            attempts.append({"stage": cfg["name"] + " (mastra)", "status": "rejected",
                             "reason": "no usable text or failed gates"})

        # Path 2 — direct provider HTTP for this rung.
        errors: list[str] = []
        text = await _stage_text(cfg, snap, duration_seconds, facts, errors, extra_context)
        if text is not None:
            return _result(snap, text, facts, budget, cfg, "direct", attempts)
        attempts.append({"stage": cfg["name"], "status": "failed",
                         "reason": "; ".join(errors) or "unknown"})

    _LAST_ATTEMPTS = attempts
    return None


_LAST_ATTEMPTS: list[dict[str, str]] = []


def last_attempts() -> list[dict[str, str]]:
    """Attempt log from the most recent narrate_with_model call that fell back."""
    return list(_LAST_ATTEMPTS)


def template_generation() -> dict[str, Any]:
    """The generation record for a template-only pack, with why each stage failed."""
    return _generation(None, last_attempts(), "template")
