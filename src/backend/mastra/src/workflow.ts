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
import { createDocentAgent } from './agent.js';
import { validateText } from './tools.js';
import { userPrompt } from './prompt.js';
import type { ProviderConfig } from './config.js';

export interface NarrationInput {
  factsJson: string;
  durationSeconds: number;
  budgetWords: number;
  context?: string;
}

export interface NarrationOutput {
  text: string;
}

const factsStep = createStep({
  id: 'format-facts-step',
  inputSchema: z.object({
    factsJson: z.string(),
    durationSeconds: z.number(),
    budgetWords: z.number(),
    context: z.string().optional().default(''),
  }),
  outputSchema: z.object({
    factsBlock: z.string(),
    durationSeconds: z.number(),
    budgetWords: z.number(),
    context: z.string(),
  }),
  execute: async ({ inputData }) => {
    const facts = JSON.parse(inputData.factsJson) as Record<string, number | string>;
    const factsBlock = Object.keys(facts)
      .sort()
      .map((k) => `${k} = ${facts[k]}`)
      .join('\n');
    return {
      factsBlock,
      durationSeconds: inputData.durationSeconds,
      budgetWords: inputData.budgetWords,
      context: inputData.context ?? '',
    };
  },
});

export function buildNarrationWorkflow(cfg: ProviderConfig) {
  const agent = createDocentAgent(cfg);

  const narrateStep = createStep({
    id: 'narrate-step',
    inputSchema: z.object({
      factsBlock: z.string(),
      durationSeconds: z.number(),
      budgetWords: z.number(),
      context: z.string(),
    }),
    outputSchema: z.object({
      text: z.string(),
      factsBlock: z.string(),
      context: z.string(),
    }),
    execute: async ({ inputData }) => {
      const prompt = userPrompt(inputData.factsBlock, inputData.durationSeconds, inputData.budgetWords, inputData.context);
      const res = await agent.generate(prompt, { maxSteps: 3 });
      return { text: (res.text ?? '').trim(), factsBlock: inputData.factsBlock, context: inputData.context };
    },
  });

  const validateStep = createStep({
    id: 'validate-step',
    inputSchema: z.object({
      text: z.string(),
      factsBlock: z.string(),
      context: z.string().optional().default(''),
      durationSeconds: z.number().optional(),
      budgetWords: z.number().optional(),
    }),
    outputSchema: z.object({
      text: z.string(),
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
      return { text };
    },
  });

  return createWorkflow({
    id: 'skywhisper-narration',
    inputSchema: z.object({
      factsJson: z.string(),
      durationSeconds: z.number(),
      budgetWords: z.number(),
      context: z.string().optional().default(''),
    }),
    outputSchema: z.object({
      text: z.string(),
    }),
  })
    .then(factsStep)
    .then(narrateStep)
    .then(validateStep)
    .commit();
}
