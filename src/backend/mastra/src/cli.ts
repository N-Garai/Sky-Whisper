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
import { bodiesInFacts, buildNarrationWorkflow, extractMentioned } from './workflow.js';
import { findBody, fistPhrase, snapshotUrl } from './tools.js';

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

  // Body-direction unit: Saturn high in the south-east speaks fist-widths.
  if (fistPhrase(55, 135) !== '6 fists above the south-east') {
    failures.push(`fist phrase mismatch: ${fistPhrase(55, 135)}`);
  }
  if (fistPhrase(4, 200) !== 'near the south horizon') {
    failures.push(`low-altitude phrase mismatch: ${fistPhrase(4, 200)}`);
  }

  // Body lookup across planets, stars, Moon, and passes.
  const snapFixture = {
    planets: [{ name: 'Saturn', altitude_deg: 55, azimuth_deg: 135 }],
    stars: [{ name: 'Vega', altitude_deg: 30, azimuth_deg: 300, magnitude: 0.03 }],
    moon: { phase_name: 'full_moon', altitude_deg: -5, azimuth_deg: 100 },
    constellations: [{ name: 'Lyra', anchor_star: 'Vega', altitude_deg: 30, azimuth_deg: 300 }],
    satellite_passes: [],
  };
  const saturn = findBody(snapFixture, 'saturn');
  if (!saturn || saturn.kind !== 'planet') failures.push('findBody missed Saturn');
  const issMiss = findBody(snapFixture, 'andromeda galaxy');
  if (issMiss !== null) failures.push('findBody invented a body');
  const moonHit = findBody(snapFixture, 'moon');
  if (!moonHit || moonHit.kind !== 'moon') failures.push('findBody missed the Moon');

  // Facts keys recover body names for the mention envelope.
  const names = bodiesInFacts(JSON.stringify({
    'planet.Saturn.altitude_deg': 55, 'star.Vega.fists': 3, 'moon.illumination_pct': 74,
  }));
  if (!names.includes('Saturn') || !names.includes('Vega')) {
    failures.push(`bodiesInFacts mismatch: ${names.join(',')}`);
  }
  const mentioned = extractMentioned('Saturn glows while Mars hides', ['Saturn', 'Vega']);
  if (mentioned.length !== 1 || mentioned[0] !== 'Saturn') {
    failures.push(`extractMentioned mismatch: ${mentioned.join(',')}`);
  }

  // Snapshot endpoint builder never emits a malformed URL.
  if (snapshotUrl(' 8080 ') !== 'http://127.0.0.1:8080/api/sky/snapshot') {
    failures.push(`snapshotUrl mismatch: ${snapshotUrl(' 8080 ')}`);
  }

  // Budget echoes are instruction quotes, not hallucinations (mirrors Python).
  const budgeted = validateText(
    'aim for 218 words between 203 and 233 across 90 seconds',
    { ...facts, 'narration.word_budget': 218, 'narration.word_min': 203, 'narration.word_max': 233, 'narration.duration_seconds': 90 },
  );
  if (!budgeted.ok) failures.push(`validator rejected budget echo: ${budgeted.problems.join('; ')}`);

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
  // Hard backstop: never outlive the Python caller's timeout, so a stalled
  // provider cannot leave an orphaned Node process holding memory.
  // (Python kills on timeout too; this covers kill failures.)
  const hardKill = setTimeout(() => {
    process.stdout.write(JSON.stringify({ error: 'harness time budget exhausted' }) + '\n');
    process.exit(2);
  }, 60000);
  const cfg = resolveProvider();
  if (!cfg) {
    process.stdout.write(JSON.stringify({ error: 'no model provider configured' }) + '\n');
    process.exit(3);
  }
  let input: {
    factsJson: string; durationSeconds: number; budgetWords: number;
    context?: string; latitude?: number; longitude?: number; timestamp?: string;
  } | null = null;
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
  if (typeof input.latitude !== 'number' || typeof input.longitude !== 'number' || typeof input.timestamp !== 'string') {
    process.stdout.write(JSON.stringify({ error: 'observer coordinates required' }) + '\n');
    process.exit(2);
  }
  try {
    const workflow = buildNarrationWorkflow(cfg);
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        factsJson: input.factsJson,
        durationSeconds: input.durationSeconds,
        budgetWords: input.budgetWords,
        context: input.context,
        latitude: input.latitude,
        longitude: input.longitude,
        timestamp: input.timestamp,
      },
    });
    const output = result.status === 'success' ? result.result : null;
    const text = typeof output?.text === 'string' ? output.text : null;
    if (typeof text === 'string' && text.length >= 120) {
      clearTimeout(hardKill);
      process.stdout.write(JSON.stringify({
        text,
        bodies_mentioned: Array.isArray((output as any)?.bodiesMentioned)
          ? (output as any).bodiesMentioned.filter((b: unknown) => typeof b === 'string')
          : [],
        wordCount: typeof (output as any)?.wordCount === 'number' ? (output as any).wordCount : text.split(/\s+/).length,
      }) + '\n');
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
