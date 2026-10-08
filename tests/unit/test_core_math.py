"""Unit tests for the pure astronomy math core."""
from __future__ import annotations

import math

from src.core import (
    altaz_to_phrase,
    az_to_compass,
    illuminated_fraction,
    normalize_az,
    phase_name,
    twilight_state,
    airmass,
)


class TestNormalizeAzimuth:
    def test_positive_within_range(self):
        assert normalize_az(90.0) == 90.0

    def test_negative_wraps(self):
        assert normalize_az(-90.0) == 270.0

    def test_full_circle(self):
        assert normalize_az(360.0) == 0.0

    def test_multiple_turns(self):
        assert normalize_az(450.0) == 90.0


class TestTwilightState:
    def test_night(self):
        assert twilight_state(-25.0) == "night"

    def test_astronomical_twilight(self):
        assert twilight_state(-15.0) == "astronomical_twilight"

    def test_nautical_twilight(self):
        assert twilight_state(-9.0) == "nautical_twilight"

    def test_civil_twilight(self):
        assert twilight_state(-3.0) == "civil_twilight"

    def test_day(self):
        assert twilight_state(5.0) == "day"

    def test_exact_boundaries(self):
        # USNO bands are [upper, lower): -18 is the night edge.
        assert twilight_state(-18.0) == "astronomical_twilight"
        assert twilight_state(-12.0) == "nautical_twilight"
        assert twilight_state(-6.0) == "civil_twilight"
        assert twilight_state(0.0) == "day"


class TestIlluminatedFraction:
    def test_new_moon(self):
        assert illuminated_fraction(0.0) == 0.0

    def test_first_quarter(self):
        assert illuminated_fraction(90.0) == 0.5

    def test_full_moon(self):
        assert illuminated_fraction(180.0) == 1.0

    def test_range_always_in_unit_interval(self):
        for e in range(0, 360, 5):
            f = illuminated_fraction(float(e))
            assert 0.0 <= f <= 1.0


class TestPhaseName:
    def test_new(self):
        assert phase_name(0.0) == "new_moon"

    def test_waxing_crescent(self):
        assert phase_name(45.0) == "waxing_crescent"

    def test_first_quarter(self):
        assert phase_name(90.0) == "first_quarter"

    def test_waxing_gibbous(self):
        assert phase_name(135.0) == "waxing_gibbous"

    def test_full(self):
        assert phase_name(180.0) == "full_moon"

    def test_waning_gibbous(self):
        assert phase_name(225.0) == "waning_gibbous"

    def test_third_quarter(self):
        assert phase_name(270.0) == "third_quarter"

    def test_waning_crescent(self):
        assert phase_name(315.0) == "waning_crescent"

    def test_wraps_past_full_circle(self):
        assert phase_name(360.0) == "new_moon"
        assert phase_name(385.0) == "waxing_crescent"


class TestCompass:
    def test_north(self):
        assert az_to_compass(0.0) == "north"

    def test_east(self):
        assert az_to_compass(90.0) == "east"

    def test_south(self):
        assert az_to_compass(180.0) == "south"

    def test_west(self):
        assert az_to_compass(270.0) == "west"

    def test_northeast(self):
        assert az_to_compass(45.0) == "north-east"

    def test_wraps(self):
        assert az_to_compass(360.0) == "north"


class TestAltAzPhrase:
    def test_near_horizon(self):
        assert "near the" in altaz_to_phrase(2.0, 180.0)

    def test_one_fist(self):
        assert altaz_to_phrase(12.0, 90.0) == "one fist above the east"

    def test_multiple_fists(self):
        assert altaz_to_phrase(55.0, 180.0) == "6 fists above the south"

    def test_never_contains_raw_degrees(self):
        phrase = altaz_to_phrase(47.0, 212.0)
        assert "47" not in phrase
        assert "degree" not in phrase


class TestAirmass:
    def test_zenith_is_one(self):
        assert abs(airmass(90.0) - 1.0) < 1e-6

    def test_sixty_degrees_is_two(self):
        assert abs(airmass(30.0) - 2.0) < 0.01

    def test_higher_is_more_airmass(self):
        assert airmass(80.0) < airmass(20.0)
