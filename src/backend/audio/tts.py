"""ElevenLabs TTS adapter — real audio when configured, honest null otherwise."""
from __future__ import annotations

import asyncio
import hashlib
import os
from dataclasses import dataclass, field
from typing import Optional

import aiohttp

ELEVEN_API = "https://api.elevenlabs.io/v1/text-to-speech"
DEFAULT_VOICE = "pNInz6obpgDQGcFmaJgB"
DEFAULT_MODEL = "eleven_turbo_v2_5"
DEFAULT_FORMAT = "mp3_22050_32"

# Bounded backoff for transient provider failures only.
_RETRY_STATUS = {429, 500, 502, 503, 504}


@dataclass
class TTSResult:
    audio: Optional[bytes] = None
    available: bool = False
    format: str = ""
    bytes_size: int = 0
    voice: str = ""
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "available": self.available,
            "format": self.format if self.available else None,
            "bytes": self.bytes_size if self.available else 0,
            "voice": self.voice if self.available else None,
            "reason": self.reason or None,
        }


def is_configured() -> bool:
    return bool(os.getenv("ELEVENLABS_API_KEY"))


def _voice_id() -> str:
    return os.getenv("ELEVEN_VOICE_ID", DEFAULT_VOICE)


def tts_cache_key(text: str, voice_id: str) -> str:
    raw = f"{text}|{voice_id}|{DEFAULT_MODEL}|{DEFAULT_FORMAT}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


async def _post(session: aiohttp.ClientSession, url: str, headers: dict, body: dict) -> Optional[bytes]:
    async with session.post(url, headers=headers, json=body) as resp:
        if resp.status == 200:
            return await resp.read()
        if resp.status in _RETRY_STATUS:
            return None
        # Auth/validation errors are not worth retrying.
        raise ValueError(f"tts rejected: {resp.status}")


async def synthesize(text: str) -> TTSResult:
    """Synthesize text to MP3. Returns an honest unavailable result when
    no key is set — never fake audio bytes."""
    api_key = os.getenv("ELEVENLABS_API_KEY", "")
    voice_id = _voice_id()

    if not api_key:
        return TTSResult(reason="tts not configured — set ELEVENLABS_API_KEY")

    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    body = {
        "text": text,
        "model_id": DEFAULT_MODEL,
        "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.15},
    }
    url = f"{ELEVEN_API}/{voice_id}?output_format={DEFAULT_FORMAT}"

    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        try:
            audio = await _post(session, url, headers, body)
            if audio is None:  # transient — retry once after backoff
                await asyncio.sleep(2)
                audio = await _post(session, url, headers, body)
        except ValueError as exc:
            return TTSResult(reason=str(exc))
        except Exception as exc:
            return TTSResult(reason=f"tts request failed: {exc}")

        if audio is None:
            return TTSResult(reason="tts unavailable after retry")

    return TTSResult(
        audio=audio,
        available=True,
        format=DEFAULT_FORMAT,
        bytes_size=len(audio),
        voice=voice_id,
    )
