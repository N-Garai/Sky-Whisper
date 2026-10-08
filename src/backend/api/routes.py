"""SkyWhisper API — FastAPI routes for snapshot, pack generation, and playback."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from src.backend.audio.tts import synthesize
from src.backend.core.astronomy import EPHEMERIS_FILE, build_snapshot, parse_timestamp
from src.backend.narration.template_narrator import build_script, cache_key
from src.backend.services.satellites import compute_passes
from src.backend.services.weather import get_cloud_cover
from src.shared.schemas import PackRequest

APP_ROOT = Path(__file__).resolve().parents[3]
PACKS_DIR = APP_ROOT / "tmp" / "packs"
FRONTEND_DIST = APP_ROOT / "src" / "frontend" / "dist"

PACKS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="SkyWhisper API",
    version="0.1.0",
    description="Screenless astronomy — deterministic ephemeris, narration, audio packs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
@app.get("/api/health")
async def health() -> dict:
    """Cheap liveness probe — also used by the PWA to warm a cold instance."""
    tle_dir = APP_ROOT / "data" / "tle"
    tle_age = None
    tle_file = tle_dir / "visual.tle"
    if tle_file.exists():
        age_s = datetime.now(timezone.utc).timestamp() - tle_file.stat().st_mtime
        tle_age = f"{age_s / 3600:.1f}h"
    return {
        "status": "ok",
        "version": "0.1.0",
        "ephemeris": f"skyfield {EPHEMERIS_FILE}",
        "model": os.getenv("LLM_PROVIDER", "template"),
        "tts": "configured" if os.getenv("ELEVENLABS_API_KEY") else "disabled",
        "packs_cached": len(list(PACKS_DIR.glob("*.json"))),
        "tle_age": tle_age,
    }


@app.post("/api/sky/snapshot")
async def sky_snapshot(req: PackRequest) -> dict:
    """Deterministic sky computation. No LLM, no guessing."""
    try:
        passes = await compute_passes(req.latitude, req.longitude, parse_timestamp(req.timestamp))
        snap = build_snapshot(req, satellite_passes=passes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ephemeris error: {exc}")
    return snap.model_dump()


@app.post("/api/packs")
async def generate_pack(req: PackRequest) -> JSONResponse:
    """Full pack: snapshot -> narration -> audio. Cached by 0.5-degree grid."""
    try:
        passes = await compute_passes(req.latitude, req.longitude, parse_timestamp(req.timestamp))
        snap = build_snapshot(req, satellite_passes=passes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ephemeris error: {exc}")

    # Weather is best-effort: a failure never blocks the pack.
    try:
        date_str = req.timestamp[:10]
        weather = await get_cloud_cover(req.latitude, req.longitude, date_str)
        snap.weather.cloud_pct = weather["cloud_pct"]
        snap.weather.label = weather["label"]
    except Exception:
        pass

    script = build_script(snap, req.duration_seconds)

    # Open-weight model path (Gemma / Ollama). Falls back to the deterministic
    # narrator on any failure — validated output only, never unvalidated text.
    from src.backend.narration.llm_provider import narrate_with_model

    model_script = await narrate_with_model(snap, req.duration_seconds)
    if model_script is not None:
        script = model_script
    else:
        script["fallback_used"] = True
        script["model"] = "template"
        script["provider"] = "template"

    ckey = cache_key(
        req.latitude, req.longitude, req.timestamp,
        req.duration_seconds, os.getenv("ELEVEN_VOICE_ID", ""),
        os.getenv("LLM_PROVIDER", "template"),
    )

    meta_path = PACKS_DIR / f"{ckey}.json"
    audio_path = PACKS_DIR / f"{ckey}.mp3"

    # Serve the cached pack if it already exists (cache hit = no TTS spend).
    if meta_path.exists():
        try:
            cached = json.loads(meta_path.read_text(encoding="utf-8"))
            if cached.get("audio", {}).get("available") and not audio_path.exists():
                cached["audio"] = {"available": False, "reason": "cache miss on audio file"}
                meta_path.write_text(json.dumps(cached, indent=2), encoding="utf-8")
            return JSONResponse(cached)
        except Exception:
            pass  # corrupt cache entry — rebuild below

    tts = await synthesize(script["script"])
    audio_available = bool(tts.available and tts.audio)
    if audio_available:
        audio_path.write_bytes(tts.audio)

    pack = {
        "packId": ckey,
        "snapshot": snap.model_dump(),
        "narration": script,
        "audio": tts.to_dict(),
        "audioPath": f"/api/packs/{ckey}/audio" if audio_available else None,
        "transcriptPath": f"/api/packs/{ckey}/transcript",
        "expiresAt": None,  # ephemeral storage — no false promise of persistence
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }

    meta_path.write_text(json.dumps(pack, indent=2), encoding="utf-8")

    return JSONResponse(pack)


@app.get("/api/packs/{pack_id}/audio")
async def get_audio(pack_id: str) -> Response:
    """Stream the pack MP3. 404 after restart — ephemeral storage by design."""
    path = PACKS_DIR / f"{pack_id}.mp3"
    if not path.exists():
        raise HTTPException(status_code=404, detail="pack expired or not found")
    return Response(path.read_bytes(), media_type="audio/mpeg")


@app.get("/api/packs/{pack_id}/transcript")
async def get_transcript(pack_id: str) -> dict:
    path = PACKS_DIR / f"{pack_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="pack expired or not found")
    data = json.loads(path.read_text(encoding="utf-8"))
    return {"transcript": data.get("narration", {}).get("script", "")}


# Serve the built PWA from the same service — one free instance, one deploy.
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
