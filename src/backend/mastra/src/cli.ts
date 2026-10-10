#!/usr/bin/env node
/**
 * Mastra CLI — the bridge the Python backend spawns.
 *
 *   node dist/cli.js selftest            # no model, no network: tools only
 *   node dist/cli.js narrate             # stdin {factsJson,durationSeconds,budgetWords}
 *                                        # stdout {text} | exit 2 unusable | exit 3 unconfigured
 */
import { resolveProvider } from './config.js';
import { formatFactsBlock, validateText } from './tools.js';
import { buildNarrationWorkflow } from './workflow.js';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (c) => {
      data += c;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function selftest(): Promise<void> {
  const failures: string[] = [];

  // Facts tool contract.
  const block = formatFactsBlock({ 'moon.illumination_pct': 74, 'moon.fists': 3 });
  if (!block.includes('moon.illumination_pct = 74')) failures.push('facts block mismatch');

  // Validator accepts grounded numbers, rejects invented ones.
  // (Compound words like "seventy four" read as separate tokens in both
  // runtimes by design — narration uses digits or single words for values.)
  const facts = { 'moon.illumination_pct': 74, 'moon.fists': 3 };
  const good = validateText('the moon is three fists up and 74 percent lit', facts);
  if (!good.ok) failures.push(`validator rejected grounded text: ${good.problems.join('; ')}`);
  const bad = validateText('jupiter glows at 42 degrees near mars at 99', facts);
  if (bad.ok) failures.push('validator accepted invented numbers');
  const raw = validateText('look 47 degrees above the east', { 'star.vega.fists': 5 });
  if (raw.ok) failures.push('validator accepted raw coordinate phrasing');

  // Workflow object commits (shape check, no model call).
  const cfg = { provider: 'ollama' as const, modelId: 'gemma3:1b', url: 'http://127.0.0.1:11434/v1', apiKey: '' };
  try {
    buildNarrationWorkflow(cfg);
  } catch (err) {
    failures.push(`workflow build failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Explicit rung pin used by the Python chain (pure resolution, no network).
  const pinned = resolveProvider({
    ...process.env,
    MASTRA_MODEL_ID: 'openai/gpt-oss-120b',
    MASTRA_BASE_URL: 'https://api.groq.com/openai/v1',
    MASTRA_API_KEY: '',
  } as NodeJS.ProcessEnv);
  if (!pinned || pinned.provider !== 'custom' || pinned.modelId !== 'openai/gpt-oss-120b') {
    failures.push('rung override resolution failed');
  }
  if (resolveProvider({ ...process.env, MASTRA_MODEL_ID: 'x' } as NodeJS.ProcessEnv) !== null) {
    failures.push('rung override without base URL should be unconfigured');
  }

  if (failures.length > 0) {
    process.stdout.write(JSON.stringify({ ok: false, failures }) + '\n');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ ok: true }) + '\n');
}

async function narrate(): Promise<void> {
  const cfg = resolveProvider();
  if (!cfg) {
    process.stdout.write(JSON.stringify({ error: 'no model provider configured' }) + '\n');
    process.exit(3);
  }
  let input: { factsJson: string; durationSeconds: number; budgetWords: number; context?: string } | null = null;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    input = null;
  }
  if (!input || typeof input.factsJson !== 'string') {
    process.stdout.write(JSON.stringify({ error: 'invalid stdin JSON' }) + '\n');
    process.exit(2);
  }
  if (typeof input.context !== 'string') input.context = '';
  try {
    const workflow = buildNarrationWorkflow(cfg);
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        factsJson: input.factsJson,
        durationSeconds: input.durationSeconds,
        budgetWords: input.budgetWords,
        context: input.context,
      },
    });
    const text = result.status === 'success' ? result.result?.text : null;
    if (typeof text === 'string' && text.length >= 120) {
      process.stdout.write(JSON.stringify({ text }) + '\n');
      return;
    }
    process.stdout.write(JSON.stringify({ error: 'workflow produced unusable output' }) + '\n');
    process.exit(2);
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) + '\n',
    );
    process.exit(2);
  }
}

const cmd = process.argv[2];
if (cmd === 'selftest') await selftest();
else if (cmd === 'narrate') await narrate();
else {
  process.stderr.write('usage: cli.js <selftest|narrate>\n');
  process.exit(2);
}
