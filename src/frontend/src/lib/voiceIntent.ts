/**
 * Voice intent matching — pure, deterministic, offline-capable.
 *
 * Keyword spotting runs locally on the transcript: no round-trip, no key,
 * no model call for the things people say most. Free-form speech that
 * matches nothing is routed to the Mastra agent instead (see useVoiceAgent).
 */

export type VoiceIntent =
  | { type: 'wake' }
  | { type: 'describe' }
  | { type: 'replay' }
  | { type: 'pause' }
  | { type: 'play' }
  | { type: 'volume'; direction: 'up' | 'down' }
  | { type: 'ask'; query: string }
  | { type: 'none' };

/** Wake words — heard any time, they open a command window and confirm. */
export const WAKE_WORDS = ['hey whisper', 'hey, whisper', 'ok whisper', 'hello whisper'];

/** Volume phrases — checked before COMMANDS so "turn it up" never pauses. */
const VOLUME: Array<{ direction: 'up' | 'down'; phrases: string[] }> = [
  { direction: 'up', phrases: ['louder', 'turn it up', 'volume up', 'increase volume', 'speak up'] },
  { direction: 'down', phrases: ['quieter', 'turn it down', 'volume down', 'lower volume', 'softer', 'soften'] },
];

/** Command phrases — each maps to one deterministic action. */
const COMMANDS: Array<{ intent: Exclude<VoiceIntent['type'], 'ask' | 'none' | 'volume'>; phrases: string[] }> = [
  {
    intent: 'pause',
    phrases: ['pause', 'stop listening', 'stop', 'quiet', 'shush', 'be quiet'],
  },
  {
    intent: 'replay',
    phrases: ['repeat that', 'say it again', 'replay', 'say that again', 'one more time', 'play it again'],
  },
  {
    intent: 'play',
    phrases: ['resume', 'continue', 'keep going', 'play'],
  },
  {
    intent: 'describe',
    phrases: [
      'describe the sky',
      'how is it looking outside',
      "how's it looking outside",
      'how does it look outside',
      "what's above me",
      'what is above me',
      'tell me about tonight',
      "tonight's story",
      'tonight story',
      'what can i see',
      'what should i look at',
      'guide me',
    ],
  },
  { intent: 'wake', phrases: WAKE_WORDS },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[?!.,;:]/g, '').replace(/\s+/g, ' ').trim();
}

function includesPhrase(haystack: string, phrase: string): boolean {
  // Single words match on boundaries ("stop" must not fire on "top").
  if (!phrase.includes(' ')) {
    return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack);
  }
  return haystack.includes(phrase);
}

export interface MatchOptions {
  /** A wake word was heard recently — free-form speech becomes a question. */
  commandWindowOpen?: boolean;
  /** The panel explicitly asked a question ("ask anything"). */
  expectingQuestion?: boolean;
}

/**
 * Match a final transcript against the keyword list. Priority order is
 * deliberate: transport controls win over narration, narration over wake,
 * and free-form speech only becomes a question inside a command window
 * (otherwise every musing would trigger a model call).
 */
export function matchIntent(transcript: string, opts: MatchOptions = {}): VoiceIntent {
  const text = normalize(transcript);
  if (!text) return { type: 'none' };

  for (const { direction, phrases } of VOLUME) {
    if (phrases.some((p) => includesPhrase(text, normalize(p)))) {
      return { type: 'volume', direction };
    }
  }

  for (const { intent, phrases } of COMMANDS) {
    if (phrases.some((p) => includesPhrase(text, normalize(p)))) {
      if (intent === 'wake') return { type: 'wake' };
      if (intent === 'describe') return { type: 'describe' };
      if (intent === 'replay') return { type: 'replay' };
      if (intent === 'pause') return { type: 'pause' };
      return { type: 'play' };
    }
  }

  const substantial = text.split(' ').length >= 3;
  if (substantial && (opts.commandWindowOpen || opts.expectingQuestion)) {
    return { type: 'ask', query: transcript.trim() };
  }
  return { type: 'none' };
}
