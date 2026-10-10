"""Mastra orchestration bridge — the free, open-source agent harness path.

When a model provider is configured AND the Node harness is present, the
narration step runs as a Mastra workflow (facts -> docent agent ->
validate, one retry) in a short-lived subprocess. Every other situation —
no provider, no node, build missing, timeout, bad exit — returns None and
the caller falls back to the direct HTTP path, then the deterministic
template narrator. The harness failing can never break a pack.

The harness's own validator is step one; the Python `validate_narration`
re-check in `llm_provider` remains the final gate before audio.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
from pathlib import Path
from typing import Any

_HARNESS_DIR = Path(__file__).resolve().parents[1] / "mastra"
_CLI = _HARNESS_DIR / "dist" / "cli.js"

# Long enough for a hosted free-tier model round-trip (plus one retry),
# short enough that pack generation never hangs on it.
TIMEOUT_SECONDS = 75


def harness_dir() -> Path:
    return _HARNESS_DIR


def is_available() -> bool:
    """Node present and the harness compiled. Cheap, no I/O beyond stat."""
    return shutil.which("node") is not None and _CLI.is_file()


async def narrate_via_mastra(
    facts: dict[str, Any],
    duration_seconds: int,
    budget_words: int,
    timeout: float = TIMEOUT_SECONDS,
    env_overrides: dict[str, str] | None = None,
    context: str | None = None,
) -> str | None:
    """Run the Mastra narration workflow. Returns text, or None to fall back.

    `env_overrides` pins the harness to one chain rung (model, endpoint,
    key) without touching the parent process environment. `context` is a
    listener question the narration must honor first. Never raises.
    """
    if not is_available():
        return None
    payload = json.dumps({
        "factsJson": json.dumps(facts),
        "durationSeconds": duration_seconds,
        "budgetWords": budget_words,
        "context": context or "",
    })
    env = {**os.environ, **(env_overrides or {})}
    try:
        proc = await asyncio.create_subprocess_exec(
            "node", str(_CLI), "narrate",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=env,
        )
        out, _ = await asyncio.wait_for(proc.communicate(payload.encode("utf-8")), timeout)
    except Exception:
        return None
    if proc.returncode != 0:
        return None
    try:
        data = json.loads(out.decode("utf-8", errors="replace"))
    except Exception:
        return None
    text = data.get("text", "")
    if not isinstance(text, str) or len(text) < 120:
        return None
    return text.strip()
