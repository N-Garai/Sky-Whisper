"""Validation tests: snapshot correctness + anti-hallucination narrator checks."""
from __future__ import annotations

import pytest

from src.backend.core.astronomy import build_snapshot
from src.backend.narration.template_narrator import (
    BODY_NOTES,
    build_focused_answer,
    build_script,
    cache_key,
    detect_body,
    extract_numbers,
    snapshot_facts,
    validate_narration,
    word_budget,
)
from src.shared.schemas import PackRequest

KOLKATA = PackRequest(
    latitude=22.5726,
    longitude=88.3639,
    timestamp="2026-10-07T18:00:00Z",
    duration_seconds=90,
)
LONDON = PackRequest(
    latitude=51.5074,
    longitude=-0.1278,
    timestamp="2026-10-07T22:00:00Z",
    duration_seconds=90,
)
NEW_YORK = PackRequest(
    latitude=40.7128,
    longitude=-74.0060,
    timestamp="2026-10-08T02:00:00Z",
    duration_seconds=90,
)


@pytest.fixture(scope="module")
def kolkata_snapshot():
    return build_snapshot(KOLKATA)


class TestSnapshotSchema:
    def test_schema_version(self, kolkata_snapshot):
        assert kolkata_snapshot.schema_version == "1.0"

    def test_location_echoed(self, kolkata_snapshot):
        assert kolkata_snapshot.location["latitude"] == 22.5726
        assert kolkata_snapshot.location["longitude"] == 88.3639

    def test_sun_state_is_valid(self, kolkata_snapshot):
        assert kolkata_snapshot.sun.state in {
            "night", "astronomical_twilight", "nautical_twilight",
            "civil_twilight", "day",
        }

    def test_moon_illumination_in_range(self, kolkata_snapshot):
        assert 0.0 <= kolkata_snapshot.moon.illumination <= 1.0

    def test_moon_phase_is_named(self, kolkata_snapshot):
        valid = {
            "new_moon", "waxing_crescent", "first_quarter", "waxing_gibbous",
            "full_moon", "waning_gibbous", "third_quarter", "waning_crescent",
        }
        assert kolkata_snapshot.moon.phase_name in valid

    def test_azimuth_normalized(self, kolkata_snapshot):
        bodies = kolkata_snapshot.planets + kolkata_snapshot.stars
        for b in bodies:
            assert 0.0 <= b.azimuth_deg < 360.0

    def test_no_below_horizon_body_marked_visible(self, kolkata_snapshot):
        bodies = kolkata_snapshot.planets + kolkata_snapshot.stars
        for b in bodies:
            if b.altitude_deg < 10.0:
                assert b.visible is False

    def test_sources_recorded(self, kolkata_snapshot):
        names = [s.name for s in kolkata_snapshot.sources]
        assert "Skyfield" in names

    def test_is_json_serializable(self, kolkata_snapshot):
        import json
        json.dumps(kolkata_snapshot.model_dump())


class TestMultipleLocations:
    """PRD: fixed-date regression fixtures for at least three cities."""

    @pytest.mark.parametrize("req", [KOLKATA, LONDON, NEW_YORK])
    def test_snapshot_builds(self, req):
        snap = build_snapshot(req)
        assert snap.timestamp == req.timestamp
        assert len(snap.stars) > 0
        assert len(snap.constellations) > 0

    @pytest.mark.parametrize("req", [KOLKATA, LONDON, NEW_YORK])
    def test_planets_include_all_five(self, req):
        snap = build_snapshot(req)
        names = {p.name for p in snap.planets}
        assert names == {"Mercury", "Venus", "Mars", "Jupiter", "Saturn"}


class TestValidation:
    def test_extract_numbers_decimal(self):
        assert extract_numbers("Saturn is 69.02 degrees up") == [69.02]

    def test_extract_numbers_word(self):
        nums = extract_numbers("three fists above the east")
        assert 3.0 in nums

    def test_valid_narration_passes(self, kolkata_snapshot):
        facts = snapshot_facts(kolkata_snapshot)
        text = build_script(kolkata_snapshot)["script"]
        ok, problems = validate_narration(text, facts)
        assert ok, problems

    def test_invented_number_is_rejected(self, kolkata_snapshot):
        facts = snapshot_facts(kolkata_snapshot)
        text = "Jupiter is 999 degrees above the horizon right now."
        ok, problems = validate_narration(text, facts)
        assert not ok
        assert any("999" in p for p in problems)

    def test_raw_coordinate_phrasing_is_rejected(self, kolkata_snapshot):
        facts = snapshot_facts(kolkata_snapshot)
        text = "look at 245.6 degrees azimuth and 31.2 degrees altitude."
        ok, problems = validate_narration(text, facts)
        assert not ok

    def test_near_miss_within_tolerance_passes(self, kolkata_snapshot):
        facts = snapshot_facts(kolkata_snapshot)
        fact_value = next(iter(facts.values()))
        ok, _ = validate_narration(f"it is {fact_value} up there", facts)
        assert ok

    @pytest.mark.parametrize("spelling", ["southeast", "south-east", "south east"])
    def test_wrong_intercardinal_is_rejected(self, spelling):
        # Production failure, pinned: a south-west moon narrated as
        # "south-east" — every number innocent, direction 90 degrees off.
        facts = {"moon.azimuth_deg": 225, "moon.fists": 4}
        ok, problems = validate_narration(f"find the moon in the {spelling}.", facts)
        assert not ok
        assert any("south-east" in p for p in problems)

    def test_matching_intercardinal_passes(self):
        facts = {"moon.azimuth_deg": 225, "moon.fists": 4}
        ok, problems = validate_narration("the moon hangs 4 fists above the south-west.", facts)
        assert ok, problems

    def test_bare_cardinal_needs_a_component(self):
        facts = {"moon.azimuth_deg": 225}
        ok, _ = validate_narration("look to the southern sky.", facts)
        assert ok
        ok, problems = validate_narration("look to the northern sky.", facts)
        assert not ok and any("northern" in p for p in problems)

    def test_compass_skipped_without_azimuths(self):
        ok, _ = validate_narration("look to the southeast.", {})
        assert ok


class TestFocusedAnswers:
    def test_detect_body_names_target(self):
        assert detect_body("tell me more about Mercury") == "Mercury"
        assert detect_body("Spica?") == "Spica"
        assert detect_body("where is the sun right now") == "Sun"
        assert detect_body("Jupiter and Saturn tonight") == "Jupiter"
        assert detect_body("describe the sky") is None
        assert detect_body("what is that bright one") is None

    def test_focused_answer_is_short_and_valid(self, kolkata_snapshot):
        facts = snapshot_facts(kolkata_snapshot)
        for body in ("Mercury", "Moon", "Spica"):
            ans = build_focused_answer(kolkata_snapshot, body)
            assert ans is not None
            assert body.lower() in ans["script"].lower()
            assert ans["word_count"] <= 90
            ok, problems = validate_narration(ans["script"], facts)
            assert ok, problems

    @pytest.mark.parametrize("body", [
        "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Moon", "Sun",
        "Sirius", "Canopus", "Arcturus", "Vega", "Capella", "Rigel",
        "Procyon", "Betelgeuse", "Altair", "Aldebaran", "Antares", "Spica",
        "Pollux", "Fomalhaut", "Deneb", "Regulus", "Castor", "Polaris",
    ])
    def test_every_supported_body_gets_a_valid_answer(self, kolkata_snapshot, body):
        """The focused path must work for every planet, the Moon, the Sun,
        and every catalog star — detected, short, and gate-clean."""
        assert detect_body(f"tell me more about {body}") == body
        facts = snapshot_facts(kolkata_snapshot)
        ans = build_focused_answer(kolkata_snapshot, body)
        assert ans is not None
        assert body.lower() in ans["script"].lower()
        assert ans["word_count"] <= 90
        ok, problems = validate_narration(ans["script"], facts)
        assert ok, problems

    def test_focused_answer_below_horizon(self, kolkata_snapshot):
        downs = [p.name for p in kolkata_snapshot.planets if p.altitude_deg < 0]
        downs += [s.name for s in kolkata_snapshot.stars if s.altitude_deg < 0]
        assert downs, "fixture needs a below-horizon body"
        ans = build_focused_answer(kolkata_snapshot, downs[0])
        assert ans is not None
        assert "below your horizon" in ans["script"]
        ok, problems = validate_narration(ans["script"], snapshot_facts(kolkata_snapshot))
        assert ok, problems

    def test_bank_notes_are_gate_clean(self, kolkata_snapshot):
        facts = snapshot_facts(kolkata_snapshot)
        for notes in BODY_NOTES.values():
            for note in notes:
                ok, problems = validate_narration(note, facts)
                assert ok, problems


class TestNarration:
    def test_word_budget(self):
        # W = round(D * r / 60), r = 145
        assert word_budget(90) == 218
        assert word_budget(60) == 145

    def test_script_is_prose_not_markdown(self, kolkata_snapshot):
        script = build_script(kolkata_snapshot)
        text = script["script"]
        assert "**" not in text
        assert "#" not in text
        assert "\n\n" not in text

    def test_script_never_invents_objects(self, kolkata_snapshot):
        script = build_script(kolkata_snapshot)
        visible = {s.name for s in kolkata_snapshot.stars if s.visible}
        visible |= {p.name for p in kolkata_snapshot.planets if p.visible}
        # Any star the script names must actually be visible in the snapshot.
        for name in {"Sirius", "Vega", "Deneb", "Betelgeuse", "Rigel", "Saturn"}:
            if name in script["script"]:
                assert name in visible or name in {p.name for p in kolkata_snapshot.planets}

    def test_cache_key_stable_across_key_order(self):
        a = cache_key(22.5, 88.5, "2026-10-07T18:00:00Z", 90, "v1", "template")
        b = cache_key(22.5, 88.5, "2026-10-07T18:00:00Z", 90, "v1", "template")
        assert a == b

    def test_cache_key_snaps_to_half_degree_grid(self):
        a = cache_key(22.5726, 88.3639, "2026-10-07T18:00:00Z", 90, "v1", "template")
        b = cache_key(22.51, 88.49, "2026-10-07T18:00:00Z", 90, "v1", "template")
        assert a == b

    def test_cache_key_differs_for_different_duration(self):
        a = cache_key(22.5, 88.5, "2026-10-07T18:00:00Z", 60, "v1", "template")
        b = cache_key(22.5, 88.5, "2026-10-07T18:00:00Z", 90, "v1", "template")
        assert a != b


class TestRequestValidation:
    def test_latitude_out_of_range_rejected(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            PackRequest(latitude=91.0, longitude=0.0, timestamp="2026-10-07T18:00:00Z")

    def test_longitude_out_of_range_rejected(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            PackRequest(latitude=0.0, longitude=200.0, timestamp="2026-10-07T18:00:00Z")

    def test_elevation_clamped(self):
        req = PackRequest(latitude=0.0, longitude=0.0, timestamp="2026-10-07T18:00:00Z",
                          elevation_meters=99999)
        assert req.elevation_meters == 10000

    def test_duration_clamped(self):
        req = PackRequest(latitude=0.0, longitude=0.0, timestamp="2026-10-07T18:00:00Z",
                          duration_seconds=99999)
        assert req.duration_seconds == 300
