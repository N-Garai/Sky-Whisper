/**
 * Mastra tools — deterministic astronomy plus the narration contract.
 *
 * get-sky-snapshot and get-body-direction are the agent's EYES: the
 * narrator receives only coordinates and must call tools for every fact,
 * so the trace shows real tool use. format/validate mirror the Python
 * validator number-for-number (tolerances, word-numbers, and the
 * raw-coordinate rejection included).
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod/v4';

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80,
  ninety: 90, hundred: 100,
};

export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const tok of text.match(/\d+(?:\.\d+)?/g) ?? []) {
    out.push(parseFloat(tok));
  }
  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) out.push(value);
  }
  return out;
}

export function validateText(text: string, facts: Record<string, number | string>): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const allowed = Object.values(facts).filter((v): v is number => typeof v === 'number');
  for (const n of extractNumbers(text)) {
    const known = allowed.some((f) => Math.abs(n - f) <= Math.max(0.05, Math.abs(f) * 0.02));
    if (!known) problems.push(`unapproved number: ${n}`);
  }
  if (/\d+\s*°|\d+\s*degrees?\s+(above|below)/i.test(text)) {
    problems.push('raw coordinate phrasing — use fist-widths instead');
  }
  return { ok: problems.length === 0, problems };
}

export function formatFactsBlock(facts: Record<string, number | string>): string {
  return Object.keys(facts)
    .sort()
    .map((k) => `${k} = ${facts[k]}`)
    .join('\n');
}

export const formatSkyFactsTool = createTool({
  id: 'format-sky-facts',
  description: 'Renders the computed ephemeris facts as the closed fact block the narrator may use.',
  inputSchema: z.object({
    factsJson: z.string().describe('JSON object of computed ephemeris facts from the Python backend'),
  }),
  outputSchema: z.object({
    factsBlock: z.string(),
  }),
  execute: async (inputData) => {
    const facts = JSON.parse((inputData as { factsJson: string }).factsJson) as Record<string, number | string>;
    return { factsBlock: formatFactsBlock(facts) };
  },
});

export const validateNarrationTool = createTool({
  id: 'validate-narration',
  description: 'Anti-hallucination check: every number in the narration must match a computed fact.',
  inputSchema: z.object({
    text: z.string(),
    factsJson: z.string().describe('JSON object of computed ephemeris facts'),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    problems: z.array(z.string()),
  }),
  execute: async (inputData) => {
    const { text, factsJson } = inputData as { text: string; factsJson: string };
    const facts = JSON.parse(factsJson) as Record<string, number | string>;
    return validateText(text, facts);
  },
});

const COMPASS8 = [
  'north', 'north-east', 'east', 'south-east',
  'south', 'south-west', 'west', 'north-west',
];

function compass8(azimuthDeg: number): string {
  const a = ((azimuthDeg % 360) + 360) % 360;
  return COMPASS8[Math.round(a / 45) % 8];
}

/** Body-relative phrase in the narration's voice (mirrors the backend). */
export function fistPhrase(altitudeDeg: number, azimuthDeg: number): string {
  const compass = compass8(azimuthDeg);
  if (altitudeDeg < 10) return `near the ${compass} horizon`;
  const fists = Math.max(1, Math.round(altitudeDeg / 10));
  return `${fists} ${fists === 1 ? 'fist' : 'fists'} above the ${compass}`;
}

export function snapshotUrl(port: string | undefined): string {
  const p = (port ?? '8080').trim() || '8080';
  return `http://127.0.0.1:${p}/api/sky/snapshot`;
}

interface SkyBody {
  kind: string;
  name: string;
  altitudeDeg: number;
  azimuthDeg: number;
}

export function findBody(snapshot: any, query: string): SkyBody | null {
  const q = query.trim().toLowerCase();
  if (!q || snapshot === null || typeof snapshot !== 'object') return null;
  const aliases: Record<string, string> = {
    iss: 'international space station',
    'space station': 'international space station',
    'north star': 'polaris',
    polestar: 'polaris',
  };
  const needle = aliases[q] ?? q;
  const pools: Array<{ kind: string; items: any[] }> = [
    { kind: 'planet', items: snapshot.planets ?? [] },
    { kind: 'star', items: snapshot.stars ?? [] },
    { kind: 'constellation', items: snapshot.constellations ?? [] },
    { kind: 'satellite', items: snapshot.satellite_passes ?? [] },
  ];
  const nameOf = (kind: string, b: any): string =>
    kind === 'satellite' ? String(b.satellite ?? '') : String(b.name ?? '');
  const altOf = (kind: string, b: any): number => Number(
    kind === 'satellite' ? b.peak_altitude_deg ?? -1 : b.altitude_deg ?? -1,
  );
  const azOf = (kind: string, b: any, fallback: number): number => {
    if (kind === 'constellation') return fallback;
    const v = Number(kind === 'satellite' ? NaN : b.azimuth_deg ?? NaN);
    return Number.isFinite(v) ? v : fallback;
  };
  // Constellations resolve to their anchor star's position.
  const starAz = new Map<string, number>();
  for (const s of snapshot.stars ?? []) starAz.set(String(s.name ?? '').toLowerCase(), Number(s.azimuth_deg ?? 0));
  const matchIn = (items: any[], kind: string): SkyBody | null => {
    const scored = items
      .map((b) => ({ b, n: nameOf(kind, b).toLowerCase() }))
      .filter((e) => e.n.length > 0);
    const exact = scored.find((e) => e.n === needle);
    const starts = scored.find((e) => e.n.startsWith(needle));
    const contains = scored.find((e) => e.n.includes(needle));
    const hit = exact ?? starts ?? contains;
    if (!hit) return null;
    return {
      kind,
      name: nameOf(kind, hit.b),
      altitudeDeg: altOf(kind, hit.b),
      azimuthDeg: kind === 'constellation'
        ? (starAz.get(String((hit.b as any).anchor_star ?? '').toLowerCase()) ?? 0)
        : azOf(kind, hit.b, 0),
    };
  };
  // Moon first — single well-known body.
  if (snapshot.moon && 'moon'.includes(needle) && needle.length >= 3) {
    return {
      kind: 'moon',
      name: String(snapshot.moon.phase_name ?? 'moon').replace(/_/g, ' '),
      altitudeDeg: Number(snapshot.moon.altitude_deg ?? -1),
      azimuthDeg: Number(snapshot.moon.azimuth_deg ?? 0),
    };
  }
  for (const pool of pools) {
    const hit = matchIn(pool.items, pool.kind);
    if (hit) return hit;
  }
  return null;
}

export const getSkySnapshotTool = createTool({
  id: 'get-sky-snapshot',
  description:
    'Compute the deterministic sky for an observer: Sun, Moon, planets, named stars, constellations. Call this FIRST — never invent a position; every coordinate must come from this tool.',
  inputSchema: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    timestamp: z.string().describe('ISO-8601 UTC instant'),
  }),
  outputSchema: z.object({
    snapshotJson: z.string(),
    factsBlock: z.string(),
  }),
  execute: async (inputData) => {
    const { latitude, longitude, timestamp } = inputData as {
      latitude: number; longitude: number; timestamp: string;
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(snapshotUrl(process.env.SKYWHISPER_PORT), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude, timestamp }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`snapshot backend answered ${res.status}`);
      const snap = (await res.json()) as Record<string, unknown>;
      const facts: Record<string, number | string> = {};
      const moon = (snap.moon ?? {}) as Record<string, number>;
      facts['moon.illumination_pct'] = Math.round(Number(moon.illumination ?? 0) * 100);
      facts['moon.altitude_deg'] = Math.round(Number(moon.altitude_deg ?? 0));
      for (const p of ((snap.planets ?? []) as any[]).concat((snap.stars ?? []) as any[])) {
        facts[`body.${p.name}.altitude_deg`] = Math.round(Number(p.altitude_deg ?? 0));
        facts[`body.${p.name}.fists`] = Math.max(0, Math.round(Number(p.altitude_deg ?? 0) / 10));
      }
      return { snapshotJson: JSON.stringify(snap), factsBlock: formatFactsBlock(facts) };
    } finally {
      clearTimeout(timer);
    }
  },
});

export const getBodyDirectionTool = createTool({
  id: 'get-body-direction',
  description:
    'Look up one named body (planet, star, Moon, constellation, satellite) in a snapshot and speak where it is in body-relative words. Use for specifics and follow-up questions.',
  inputSchema: z.object({
    snapshotJson: z.string().describe('Snapshot JSON from get-sky-snapshot'),
    name: z.string().describe('Body name, e.g. Saturn, Vega, Moon, Orion, ISS'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    name: z.string(),
    kind: z.string(),
    phrase: z.string(),
  }),
  execute: async (inputData) => {
    const { snapshotJson, name } = inputData as { snapshotJson: string; name: string };
    let snap: any = null;
    try {
      snap = JSON.parse(snapshotJson);
    } catch {
      return { found: false, name, kind: 'unknown', phrase: 'snapshot unreadable' };
    }
    const hit = findBody(snap, name);
    if (!hit) {
      return {
        found: false,
        name,
        kind: 'unknown',
        phrase: `I only track the Sun, Moon, named planets, bright stars, constellations, and predicted satellite passes — "${name}" is outside that catalog.`,
      };
    }
    const up = hit.altitudeDeg >= 10;
    return {
      found: true,
      name: hit.name,
      kind: hit.kind,
      phrase: up
        ? `${hit.name} is ${fistPhrase(hit.altitudeDeg, hit.azimuthDeg)}`
        : `${hit.name} is below the horizon right now`,
    };
  },
});
