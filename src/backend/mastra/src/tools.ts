/**
 * Mastra tools — the deterministic half of the narration contract.
 *
 * These tools never touch the network or a model. They format the closed
 * set of ephemeris facts and gate model output against it, mirroring the
 * Python validator number-for-number (tolerances, word-numbers, and the
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
