/**
 * Altitude/Azimuth → human-readable fist-width + compass direction.
 * Pure math, no external deps. Mirrors src/core/altaz.py.
 */

const COMPASS_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

export function azToCompass(azDeg: number): string {
  const idx = Math.round(((azDeg % 360) + 360) % 360 / 22.5) % 16;
  return COMPASS_16[idx];
}

export function altToFists(altDeg: number): string {
  if (altDeg < 5) return 'near the horizon';
  const fists = Math.round(altDeg / 10);
  return fists <= 1 ? 'one fist above the horizon' : `${fists} fists above the horizon`;
}

export function altazToFistCompass(altDeg: number, azDeg: number): string {
  const compass = azToCompass(azDeg);
  if (altDeg < 5) return `near the ${compass} horizon`;
  const fists = Math.max(1, Math.round(altDeg / 10));
  return `${fists} fist${fists > 1 ? 's' : ''} above the ${compass}`;
}