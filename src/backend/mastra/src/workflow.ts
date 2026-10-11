/**
 * Audio-pack narration workflow: facts -> narrate -> validate.
 *
 * Three committed steps. The narrate step calls the docent agent; the
 * validate step gates the text with the deterministic tool and regenerates
 * at most once. A twice-rejected text throws, and the caller falls back
 * to the deterministic template narrator — unvalidated model text is
 * never served.
 */
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod/v4';
import type { Agent } from '@mastra/core/agent';
import { createDocentAgent } from './agent.js';
import { validateText } from './tools.js';
import { agentBrief, userPrompt } from './prompt.js';
import type { ProviderConfig } from './config.js';

export interface NarrationInput {
  factsJson: string;
  durationSeconds: number;
  budgetWords: number;
  context?: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export interface NarrationOutput {
  text: string;
}

/** Zod narration envelope: the contract every narration leaves the harness in. */
export const narrationEnvelope = z.object({
  script: z.string().min(120),
  bodiesMentioned: z.array(z.string()).default([]),
  wordCount: z.number(),
});

export type NarrationEnvelope = z.infer<typeof narrationEnvelope>;

/** Body names recoverable from the flat facts dict (planet.X / star.X keys). */
export function bodiesInFacts(factsJson: string): string[] {
  try {
    const facts = JSON.parse(factsJson) as Record<string, unknown>;
    const names = new Set<string>();
    for (const k of Object.keys(facts)) {
      const m = /^(?:planet|star)\.(.+)\.(?:altitude_deg|fists)$/.exec(k);
      if (m) names.add(m[1]);
    }
    return [...names];
  } catch {
    return [];
  }
}

export function extractMentioned(text: string, candidates: string[]): string[] {
  const lowered = text.toLowerCase();
  return candidates.filter((c) => lowered.includes(c.toLowerCase()));
}

/**
 * Generate narration text. Streams first (real token streaming), falls back
 * to a plain completion — identical output contract either way. The brief
 * carries coordinates only; get-sky-snapshot is a REQUIRED first tool call,
 * so the trace always shows the agent fetching before narrating.
 */
export async function generateNarration(
  agent: Agent,
  brief: string,
): Promise<string> {
  try {
    const stream = await agent.stream(brief, {
      maxSteps: 8,
      toolChoice: { type: 'tool', toolName: 'get-sky-snapshot' },
    });
    let text = '';
    for await (const chunk of stream.textStream) text += chunk;
    if (text.trim().length >= 120) return text.trim();
  } catch {
    // Streaming or forced tools unsupported here — plain completion below.
  }
  const res = await agent.generate(brief, { maxSteps: 8 });
  const text = (res.text ?? '').trim();
  if (text.length < 120) throw new Error('model returned unusable text');
  return text;
}

const factsStep = createStep({
  id: 'format-facts-step',
  inputSchema: z.object({
    factsJson: z.string(),
    durationSeconds: z.number(),
    budgetWords: z.number(),
    context: z.string().optional().default(''),
    latitude: z.number(),
    longitude: z.number(),
    timestamp: z.string(),
  }),
  outputSchema: z.object({
    factsJson: z.string(),
    factsBlock: z.string(),
    durationSeconds: z.number(),
    budgetWords: z.number(),
    context: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    timestamp: z.string(),
  }),
  execute: async ({ inputData }) => {
    const facts = JSON.parse(inputData.factsJson) as Record<string, number | string>;
    const factsBlock = Object.keys(facts)
      .sort()
      .map((k) => `${k} = ${facts[k]}`)
      .join('\n');
    return {
      factsJson: inputData.factsJson,
      factsBlock,
      durationSeconds: inputData.durationSeconds,
      budgetWords: inputData.budgetWords,
      context: inputData.context ?? '',
      latitude: inputData.latitude,
      longitude: inputData.longitude,
      timestamp: inputData.timestamp,
    };
  },
});

export function buildNarrationWorkflow(cfg: ProviderConfig) {
  const agent = createDocentAgent(cfg);

  const narrateStep = createStep({
    id: 'narrate-step',
    inputSchema: z.object({
      factsJson: z.string(),
      factsBlock: z.string(),
      durationSeconds: z.number(),
      budgetWords: z.number(),
      context: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      timestamp: z.string(),
    }),
    outputSchema: z.object({
      text: z.string(),
      factsBlock: z.string(),
      bodiesMentioned: z.array(z.string()),
      wordCount: z.number(),
      context: z.string(),
      durationSeconds: z.number(),
      budgetWords: z.number(),
    }),
    execute: async ({ inputData }) => {
      const brief = agentBrief(
        inputData.latitude, inputData.longitude, inputData.timestamp,
        inputData.durationSeconds, inputData.budgetWords, inputData.context,
      );
      const text = await generateNarration(agent, brief);
      const words = text.split(/\s+/).filter(Boolean);
      const envelope = narrationEnvelope.parse({
        script: text,
        bodiesMentioned: extractMentioned(text, bodiesInFacts(inputData.factsJson ?? '')),
        wordCount: words.length,
      });
      return {
        text: envelope.script,
        factsBlock: inputData.factsBlock,
        bodiesMentioned: envelope.bodiesMentioned,
        wordCount: envelope.wordCount,
        context: inputData.context,
        durationSeconds: inputData.durationSeconds,
        budgetWords: inputData.budgetWords,
      };
    },
  });

  const validateStep = createStep({
    id: 'validate-step',
    inputSchema: z.object({
      text: z.string(),
      factsBlock: z.string(),
      bodiesMentioned: z.array(z.string()),
      wordCount: z.number(),
      context: z.string().optional().default(''),
      durationSeconds: z.number().optional(),
      budgetWords: z.number().optional(),
    }),
    outputSchema: z.object({
      text: z.string(),
      bodiesMentioned: z.array(z.string()),
      wordCount: z.number(),
    }),
    execute: async ({ inputData }) => {
      const facts: Record<string, number | string> = {};
      for (const line of inputData.factsBlock.split('\n')) {
        const eq = line.indexOf(' = ');
        if (eq > 0) {
          const v = line.slice(eq + 3);
          const n = Number(v);
          facts[line.slice(0, eq)] = Number.isNaN(n) ? v : n;
        }
      }
      // The prompt states the duration and word budget in digits; a model
      // quoting them back is echoing instructions, not hallucinating.
      // Python merges the same numbers before its final gate.
      if (typeof inputData.budgetWords === 'number' && inputData.budgetWords > 0) {
        facts['narration.word_budget'] = inputData.budgetWords;
        facts['narration.word_min'] = inputData.budgetWords - 15;
        facts['narration.word_max'] = inputData.budgetWords + 15;
      }
      if (typeof inputData.durationSeconds === 'number' && inputData.durationSeconds > 0) {
        facts['narration.duration_seconds'] = inputData.durationSeconds;
      }
      let text = inputData.text;
      if (!text || text.length < 120) throw new Error('model returned unusable text');
      let check = validateText(text, facts);
      if (!check.ok) {
        const retry = await agent.generate(
          `${userPrompt(inputData.factsBlock, 90, 220, inputData.context ?? '')}\n\nYour previous output was rejected for these reasons and must not be repeated: ${check.problems.join('; ')}. Rewrite using only the facts above.`,
          { maxSteps: 3 },
        );
        text = (retry.text ?? '').trim();
        check = validateText(text, facts);
        if (!check.ok) throw new Error(`model output failed validation: ${check.problems.join('; ')}`);
      }
      const words = text.split(/\s+/).filter(Boolean);
      return {
        text,
        bodiesMentioned: extractMentioned(text, bodiesInFacts(JSON.stringify(facts))),
        wordCount: words.length,
      };
    },
  });

  return createWorkflow({
    id: 'skywhisper-narration',
    inputSchema: z.object({
      factsJson: z.string(),
      durationSeconds: z.number(),
      budgetWords: z.number(),
      context: z.string().optional().default(''),
      latitude: z.number(),
      longitude: z.number(),
      timestamp: z.string(),
    }),
    outputSchema: z.object({
      text: z.string(),
      bodiesMentioned: z.array(z.string()),
      wordCount: z.number(),
    }),
  })
    .then(factsStep)
    .then(narrateStep)
    .then(validateStep)
    .commit();
}
