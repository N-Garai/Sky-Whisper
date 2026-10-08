/**
 * Provider resolution — mirrors the Python narrator contract exactly.
 *
 *   LLM_PROVIDER=template  -> null (deterministic narrator only, default, $0)
 *   LLM_PROVIDER=openai|gemma -> GEMMA_BASE_URL + GEMMA_API_KEY + GEMMA_MODEL
 *   LLM_PROVIDER=ollama     -> local Ollama daemon (or LOCAL_INFERENCE=true)
 *
 * Everything is environment-selected, nothing is hardcoded, and every
 * option is free: Mastra itself is Apache-2.0, Gemma is open-weight, and
 * Ollama runs on the user's own machine.
 */
export interface ProviderConfig {
  provider: 'openai' | 'ollama';
  modelId: string;
  url: string;
  apiKey: string;
}

function withV1(url: string): string {
  const base = url.trim().replace(/\/+$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

export function resolveProvider(env: NodeJS.ProcessEnv = process.env): ProviderConfig | null {
  const provider = (env.LLM_PROVIDER ?? 'template').trim().toLowerCase();
  const localInference = (env.LOCAL_INFERENCE ?? '').toLowerCase() === 'true';

  if (provider === 'ollama' || localInference) {
    return {
      provider: 'ollama',
      modelId: (env.OLLAMA_MODEL ?? 'gemma3:1b').trim() || 'gemma3:1b',
      url: withV1(env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'),
      apiKey: '',
    };
  }

  if (provider === 'openai' || provider === 'gemma') {
    const apiKey = (env.GEMMA_API_KEY ?? '').trim();
    if (!apiKey) return null; // key absent -> honest template fallback
    return {
      provider: 'openai',
      modelId: (env.GEMMA_MODEL ?? 'gemma-3-4b-it').trim() || 'gemma-3-4b-it',
      url: (env.GEMMA_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai')
        .trim()
        .replace(/\/+$/, ''),
      apiKey,
    };
  }

  return null;
}
