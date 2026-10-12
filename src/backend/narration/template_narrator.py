"""Narration — deterministic template narrator + optional Gemma routing.

The template narrator is the guaranteed path: it renders a SkySnapshot into
spoken prose with zero external calls. When a Gemma provider is configured,
the model narrates the same snapshot, and the validator below checks every
number it utters against the snapshot before audio is rendered.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import re
from typing import Any

from src.core import DEG_PER_FIST, MIN_VISIBLE_ALT_DEG, altaz_to_phrase, az_to_compass
from src.shared.sky_snapshot import SkySnapshot

# Target speaking rate for duration budgeting (words per minute).
WPM = 145

# Spelled-out numbers the validator must also catch.
_WORD_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40,
    "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80,
    "ninety": 90, "hundred": 100,
}


def word_budget(duration_seconds: int) -> int:
    """Target word count for a given duration: W = round(D * r / 60)."""
    return round(duration_seconds * WPM / 60)


def cache_key(lat: float, lon: float, ts: str, duration: int, voice: str, model: str) -> str:
    """Pack cache key. Location snaps to a 0.5-degree grid so nearby
    stargazers share a pack."""
    lat_grid = round(lat * 2) / 2
    lon_grid = round(lon * 2) / 2
    raw = f"{lat_grid}|{lon_grid}|{ts}|{duration}|{voice}|{model}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def snapshot_facts(snap: SkySnapshot) -> dict[str, float | str]:
    """Every number the narration is allowed to utter, keyed by source.

    Includes derived fist-width counts (altitude / 10) because the narration
    speaks body-relative directions, not raw degrees. The validator
    whitelist is what makes that safe.
    """
    facts: dict[str, float | str] = {}
    facts["moon.illumination_pct"] = round(snap.moon.illumination * 100)
    facts["moon.altitude_deg"] = round(snap.moon.altitude_deg)
    facts["moon.azimuth_deg"] = round(snap.moon.azimuth_deg)
    facts["moon.fists"] = _fists(snap.moon.altitude_deg)
    facts["sun.altitude_deg"] = round(snap.sun.altitude_deg)
    facts["sun.azimuth_deg"] = round(snap.sun.azimuth_deg)
    for p in snap.planets:
        facts[f"planet.{p.name}.altitude_deg"] = round(p.altitude_deg)
        facts[f"planet.{p.name}.azimuth_deg"] = round(p.azimuth_deg)
        facts[f"planet.{p.name}.fists"] = _fists(p.altitude_deg)
    for s in snap.stars:
        facts[f"star.{s.name}.altitude_deg"] = round(s.altitude_deg)
        facts[f"star.{s.name}.azimuth_deg"] = round(s.azimuth_deg)
        facts[f"star.{s.name}.fists"] = _fists(s.altitude_deg)
        if s.magnitude is not None:
            facts[f"star.{s.name}.magnitude"] = round(s.magnitude, 2)
    return facts


def _fists(alt_deg: float) -> int:
    """Derived fist count the narration may speak (1 fist = 10 degrees)."""
    if alt_deg < MIN_VISIBLE_ALT_DEG:
        return 0
    return max(1, round(alt_deg / DEG_PER_FIST))


def extract_numbers(text: str) -> list[float]:
    """All numerals + spelled-out small numbers, including decimals."""
    out: list[float] = []
    for tok in re.findall(r"\d+(?:\.\d+)?", text):
        out.append(float(tok))
    for word, value in _WORD_NUMBERS.items():
        if re.search(rf"\b{word}\b", text, flags=re.IGNORECASE):
            out.append(float(value))
    return out


def validate_narration(text: str, facts: dict[str, float]) -> tuple[bool, list[str]]:
    """Anti-hallucination check: every number must be within +/-2% of a fact,
    and every compass direction must match a computed body position.

    Compass rule (set-level, no sentence parsing): a specific intercardinal
    ("south-east") must equal some visible body's 8-wound direction exactly;
    a bare cardinal ("south", "southern sky") must be a component of at
    least one body's direction. A model that moves the moon 90 degrees
    fails here even when all its numbers are individually innocent.
    Skipped when the facts carry no azimuths (backward compatible).

    Returns (ok, problems). On failure the caller regenerates once, then
    falls back to the deterministic template narrator.
    """
    problems: list[str] = []
    allowed = set(facts.values())
    for n in extract_numbers(text):
        if any(abs(n - f) <= max(0.05, abs(f) * 0.02) for f in allowed):
            continue
        problems.append(f"unapproved number: {n}")
    # Reject raw coordinate phrasing — narration speaks fist-widths, not degrees.
    # Digits or spelled-out numbers ("fifty-four degrees up" dodges the digit
    # form) followed by a height word are all the same violation.
    if re.search(r"\d+\s*°|\d+\s*degrees?\s+(above|below)", text, flags=re.IGNORECASE):
        problems.append("raw coordinate phrasing — use fist-widths instead")
    number_words = "|".join(sorted(set(_WORD_NUMBERS), key=len, reverse=True))
    if re.search(rf"(?:\b(?:{number_words})\b(?:[\s-]+\w+){{0,2}}\s+degrees?\s+(?:above|below|up|high)\b)",
                 text, flags=re.IGNORECASE):
        problems.append("raw coordinate phrasing — use fist-widths instead")
    supported = set()
    for key, value in facts.items():
        if key.endswith(".azimuth_deg") and isinstance(value, (int, float)):
            supported.add(az_to_compass(float(value)))
    if supported:
        components = set()
        for wound in supported:
            components.update(wound.split("-"))
        for match in re.finditer(
            r"\b(north|south|east|west)(?:[\s-]*(east|west))?\b", text, flags=re.IGNORECASE
        ):
            first, second = match.group(1).lower(), match.group(2)
            if second:
                wound = f"{first}-{second.lower()}"
                if wound not in supported:
                    problems.append(f"unsupported direction: {wound}")
            elif first not in components:
                problems.append(f"unsupported direction: {first}")
        for match in re.finditer(
            r"\b(northern|southern|eastern|western)\b", text, flags=re.IGNORECASE
        ):
            cardinal = {"northern": "north", "southern": "south",
                        "eastern": "east", "western": "west"}[match.group(1).lower()]
            if cardinal not in components:
                problems.append(f"unsupported direction: {match.group(1).lower()}")
        for match in re.finditer(
            r"\b(southwestern|southeastern|northwestern|northeastern)\b",
            text, flags=re.IGNORECASE,
        ):
            wound = {"southwestern": "south-west", "southeastern": "south-east",
                     "northwestern": "north-west",
                     "northeastern": "north-east"}[match.group(1).lower()]
            if wound not in supported:
                problems.append(f"unsupported direction: {wound}")
    return (not problems), problems


def build_script(snap: SkySnapshot, duration_seconds: int = 90) -> dict[str, Any]:
    """Deterministic narration from the sky snapshot — no LLM required."""
    budget = word_budget(duration_seconds)
    facts = snapshot_facts(snap)
    lines: list[str] = []

    loc = snap.location
    lat, lon = loc.get("latitude", 0), loc.get("longitude", 0)
    lines.append(f"tonight, above {abs(lat):.1f} degrees {'north' if lat >= 0 else 'south'}, "
                 f"{abs(lon):.1f} degrees {'east' if lon >= 0 else 'west'}.")

    sun = snap.sun
    if sun.state == "night":
        lines.append("the sky is fully dark now — the best kind of night for this.")
    elif sun.state == "astronomical_twilight":
        lines.append("the last of the twilight has drained from the sky.")
    elif sun.state == "nautical_twilight":
        lines.append("the sky is deep blue, with the first stars showing.")
    elif sun.state == "civil_twilight":
        lines.append("twilight is settling — the bright planets are out already.")
    else:
        lines.append("the sun is still up, so only the brightest things will show.")

    moon = snap.moon
    phase = moon.phase_name.replace("_", " ")
    illum_pct = round(moon.illumination * 100)
    if moon.altitude_deg >= 10:
        lines.append(
            f"the moon is a {phase}, {illum_pct} percent lit, "
            f"{altaz_to_phrase(moon.altitude_deg, moon.azimuth_deg)}."
        )
    elif moon.altitude_deg >= 0:
        lines.append(f"the moon is a {phase}, low on the {az_to_compass(moon.azimuth_deg)} horizon.")
    else:
        lines.append(f"the moon is a {phase} tonight, but it is below the horizon right now.")

    visible_planets = [p for p in snap.planets if p.visible]
    for p in visible_planets[:3]:
        lines.append(
            f"{p.name} is waiting for you {altaz_to_phrase(p.altitude_deg, p.azimuth_deg)} — "
            "steady, and brighter than the stars around it."
        )

    bright = [s for s in snap.stars if s.visible]
    for s in bright[:3]:
        lines.append(
            f"{s.name} {altaz_to_phrase(s.altitude_deg, s.azimuth_deg)}, "
            "the brightest thing in that part of the sky."
        )

    for c in snap.constellations[:2]:
        anchor = c.anchor_star
        if anchor and any(s.name == anchor and s.visible for s in snap.stars):
            lines.append(
                f"from {anchor}, trace {c.name} — its pattern spreads out from that one star."
            )

    if snap.weather.cloud_pct is not None:
        cloud = snap.weather.cloud_pct
        if cloud < 25:
            lines.append("the forecast says clear skies — you picked a good night.")
        elif cloud < 60:
            lines.append("there will be cloud tonight, but there are always gaps. patience.")
        else:
            lines.append("heavy cloud is forecast. listen anyway, and try again tomorrow.")

    for sp in snap.satellite_passes[:1]:
        lines.append(f"later, a possible pass of {sp.satellite}. look up when it comes.")

    for w in snap.warnings[:1]:
        lines.append(f"one honest note: {w}.")

    lines.append("put the phone down now. look up. the sky will do the rest.")

    script = " ".join(lines)
    words = len(script.split())

    return {
        "title": f"tonight above {abs(lat):.1f}, {abs(lon):.1f}",
        "script": script,
        "word_count": words,
        "word_budget": budget,
        "claims": [],
        "warnings": snap.warnings,
        "fallback_used": True,
        "facts": facts,
    }


# Curated identification notes, one or two per body. Template-grade trust:
# reviewed once, served deterministically. Deliberately free of numbers
# and compass words so they always pass the same gates model prose does.
BODY_NOTES: dict[str, tuple[str, ...]] = {
    "Mercury": (
        "a small world of extremes, scorched in daylight and frozen through the night",
        "a steady spark low near the sun's glow that never twinkles the way stars do",
    ),
    "Venus": (
        "wrapped in bright cloud, the most brilliant point in the sky after the sun and moon",
        "steady and unblinking, outshining every true star around it",
    ),
    "Mars": (
        "a calm ember among the stars, distinctly red to a steady gaze",
        "binoculars steady it into a tiny red disc",
    ),
    "Jupiter": (
        "the giant of the night sky, outshining every star in view",
        "small binoculars show its bright moons strung in a row beside it",
    ),
    "Saturn": (
        "a pale gold point to the unaided eye, calm and steady",
        "any small telescope resolves its rings, tilted for a fine view",
    ),
    "Moon": (
        "its dark patches are ancient lava plains, visible without any aid",
        "binoculars turn the bright edge into mountains and craters",
    ),
    "Sun": (
        "never look straight at it without certified solar filters",
        "its glare is what washes the fainter stars from view",
    ),
    "star": (
        "a sun like ours, seen across an enormous distance",
        "steady your gaze and its light settles against the dark",
    ),
}

_STAR_NAMES = (
    "sirius", "canopus", "arcturus", "vega", "capella", "rigel",
    "procyon", "betelgeuse", "altair", "aldebaran", "antares", "spica",
    "pollux", "fomalhaut", "deneb", "regulus", "castor", "polaris",
)


def detect_body(transcript: str) -> str | None:
    """Name the body a follow-up question is about, if any.

    Earliest mention wins ("Jupiter and Saturn" is about Jupiter).
    Returns the display name (planets, Moon, Sun, bright stars) or None
    for whole-sky questions.
    """
    lowered = transcript.lower()
    candidates: list[tuple[int, str]] = []
    for name in ("mercury", "venus", "mars", "jupiter", "saturn", "moon", "sun"):
        for match in re.finditer(rf"\b{name}\b", lowered):
            candidates.append((match.start(), name.capitalize()))
    for star in _STAR_NAMES:
        for match in re.finditer(rf"\b{star}\b", lowered):
            candidates.append((match.start(), star.capitalize()))
    if not candidates:
        return None
    candidates.sort()
    return candidates[0][1]


def _body_position(snap: SkySnapshot, body: str) -> tuple[float, float] | None:
    """(altitude, azimuth) of a detected body in this snapshot, if present."""
    if body == "Moon":
        return (snap.moon.altitude_deg, snap.moon.azimuth_deg)
    if body == "Sun":
        return (snap.sun.altitude_deg, snap.sun.azimuth_deg)
    lowered = body.lower()
    for p in snap.planets:
        if p.name.lower() == lowered:
            return (p.altitude_deg, p.azimuth_deg)
    for s in snap.stars:
        if s.name.lower() == lowered:
            return (s.altitude_deg, s.azimuth_deg)
    return None


def _body_magnitude(snap: SkySnapshot, body: str) -> float | None:
    for s in snap.stars:
        if s.name.lower() == body.lower():
            return s.magnitude
    return None


def build_focused_answer(snap: SkySnapshot, body: str) -> dict[str, Any] | None:
    """Deterministic 3-sentence answer about one body: where to look, how
    to identify it, one curated note. The model path's fallback when a
    follow-up names a body — always about what was asked, never the
    whole sky, and short enough to speak in seconds."""
    pos = _body_position(snap, body)
    if pos is None:
        return None
    alt, az = pos
    notes = BODY_NOTES.get(body, BODY_NOTES["star"])
    day = 0
    try:
        day = int(snap.timestamp[8:10])
    except (ValueError, IndexError, TypeError):
        pass
    note = notes[day % len(notes)]
    sentences: list[str] = []
    if alt < 0:
        sentences.append(f"{body} is below your horizon right now, out of sight.")
        sentences.append(note.capitalize() + ".")
        other = notes[(day + 1) % len(notes)]
        if other != note:
            sentences.append(other.capitalize() + ".")
    elif body == "Moon":
        phase = snap.moon.phase_name.replace("_", " ")
        pct = round(snap.moon.illumination * 100)
        sentences.append(f"the moon is a {phase}, {pct} percent lit, {altaz_to_phrase(alt, az)}.")
        sentences.append("look for the thin bright curve, unmistakable even through city glow.")
        sentences.append(note.capitalize() + ".")
    elif body == "Sun":
        sentences.append("the sun is still up, so only the brightest things will show.")
        sentences.append(note.capitalize() + ".")
        sentences.append(notes[(day + 1) % len(notes)].capitalize() + ".")
    else:
        sentences.append(f"{body} is waiting for you {altaz_to_phrase(alt, az)}.")
        mag = _body_magnitude(snap, body)
        if mag is not None:
            if mag < 0.5:
                sentences.append(f"{body} is among the very brightest points up tonight.")
            elif mag < 1.5:
                sentences.append(f"{body} is brighter than most stars near it.")
            else:
                sentences.append("it is a modest star, easier with binoculars steady on it.")
        else:
            sentences.append("a steady point that does not twinkle the way stars do.")
        sentences.append(note.capitalize() + ".")
    script = " ".join(sentences)
    return {"script": script, "word_count": len(script.split())}
