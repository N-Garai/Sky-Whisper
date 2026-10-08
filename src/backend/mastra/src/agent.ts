/**
 * SkyWhisper audio docent — Mastra agent (Apache-2.0, free, open source).
 *
 * The model is routed through Mastra's built-in OpenAI-compatible support:
 * Gemma via any OpenAI-compatible endpoint, or a local Ollama daemon.
 * The prompt harness and tool contracts are identical regardless of
 * provider — the same swap the Python backend offers, orchestrated here.
 */
import { Agent } from '@mastra/core/agent';
import type { OpenAICompatibleConfig } from '@mastra/core/llm';
import { formatSkyFactsTool, validateNarrationTool } from './tools.js';
import { SYSTEM_PROMPT } from './prompt.js';
import type { ProviderConfig } from './config.js';

export function modelFor(cfg: ProviderConfig): OpenAICompatibleConfig {
  if (cfg.provider === 'ollama') {
    return {
      providerId: 'ollama',
      modelId: cfg.modelId,
      url: cfg.url,
      api: 'chat',
    };
  }
  return {
    id: `gemma/${cfg.modelId}`,
    url: cfg.url,
    apiKey: cfg.apiKey,
    api: 'chat',
  };
}

export function createDocentAgent(cfg: ProviderConfig): Agent {
  return new Agent({
    id: 'skywhisper-agent',
    name: 'SkyWhisper Audio Docent',
    instructions: SYSTEM_PROMPT,
    model: modelFor(cfg),
    tools: { formatSkyFactsTool, validateNarrationTool },
  });
}
