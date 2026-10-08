"""Pure astronomy math helpers — no I/O, no framework, unit-testable in isolation."""
from __future__ import annotations

import math

# Twilight bands (USNO conventions): Sun's geocentric altitude thresholds.
TWILIGHT_BANDS = (
    (-18.0, "night"),
    (-12.0, "astronomical_twilight"),
    (-6.0, "nautical_twilight"),
    (0.0, "civil_twilight"),
)

COMPASS_8 = ["north", "north-east", "east", "south-east",
             "south", "south-west", "west", "north-west"]

# A held-out fist spans ~10 degrees of sky — standard naked-eye approximation
# (Sky & Telescope observing guides). Used for body-relative directions only.
DEG_PER_FIST = 10.0

# Naked-eye limiting magnitude under a decent sky.
LIMITING_MAGNITUDE = 5.5

# Object must clear this altitude to count as comfortably visible.
MIN_VISIBLE_ALT_DEG = 10.0


def normalize_az(az_deg: float) -> float:
    """Azimuth in [0, 360), clockwise from true north."""
    return az_deg % 360.0


def twilight_state(sun_alt_deg: float) -> str:
    for threshold, label in TWILIGHT_BANDS:
        if sun_alt_deg < threshold:
            return label
    return "day"


def illuminated_fraction(elong_deg: float) -> float:
    """Fraction of the lunar disk illuminated, from Sun-Moon elongation."""
    return round((1.0 - math.cos(math.radians(elong_deg))) / 2.0, 3)


def phase_name(elong_deg: float) -> str:
    e = elong_deg % 360.0
    if e < 22.5 or e >= 337.5:
        return "new_moon"
    if e < 67.5:
        return "waxing_crescent"
    if e < 112.5:
        return "first_quarter"
    if e < 157.5:
        return "waxing_gibbous"
    if e < 202.5:
        return "full_moon"
    if e < 247.5:
        return "waning_gibbous"
    if e < 292.5:
        return "third_quarter"
    return "waning_crescent"


def az_to_compass(az_deg: float) -> str:
    idx = int(((az_deg % 360.0) + 22.5) / 45.0) % 8
    return COMPASS_8[idx]


def altaz_to_phrase(alt_deg: float, az_deg: float) -> str:
    """Turn an altitude/azimuth into body-relative spoken language.

    Examples: 'near the south-west horizon', 'three fists above the east'.
    The listener never needs a coordinate.
    """
    compass = az_to_compass(az_deg)
    if alt_deg < MIN_VISIBLE_ALT_DEG:
        return f"near the {compass} horizon"
    fists = max(1, round(alt_deg / DEG_PER_FIST))
    if fists == 1:
        return f"one fist above the {compass}"
    return f"{fists} fists above the {compass}"


def airmass(alt_deg: float) -> float:
    """Relative airmass (Kasten & Young 1989). Qualitative use only."""
    z = 90.0 - max(-5.0, min(90.0, alt_deg))
    cz = math.cos(math.radians(z))
    denom = cz + 0.50572 * (96.07995 - z) ** -6.3636
    return 1.0 / denom if denom > 0 else float("inf")
