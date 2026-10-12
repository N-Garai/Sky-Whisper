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

/** Openers that mark free speech as a question, even with no wake word. */
const QUESTION_OPENERS = [
  'what', 'whats', "what's", 'where', "where's", 'when', 'which', 'how',
  'who', 'tell me', 'describe', 'is there', 'are there', 'can you',
  'could you', 'will there', 'do you',
];

/**
 * Named bodies — a question naming one is about THAT body ("tell me more
 * about Saturn", "is Venus up tonight") and must reach the agent, never
 * the whole-sky describe path. Generic words stay too: "what planets are
 * up" is a listing question for the agent, not a narration request.
 */
const BODY_WORDS = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
  'uranus', 'neptune', 'star', 'stars', 'planet', 'planets',
  'constellation', 'orion', 'sirius', 'vega', 'polaris', 'iss',
  'satellite', 'satellites', 'milky way', 'comet', 'meteor', 'meteors',
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
 * deliberate: volume, then transport controls, then preset narration
 * phrases, then fuzzy sky/tonight describe (no named body), then wake.
 * After that, anything shaped like a genuine question goes to the agent —
 * no wake word required, because the mic is already explicitly on and the
 * user is clearly addressing the sky, not musing aloud.
 */
export function matchIntent(transcript: string, opts: MatchOptions = {}): VoiceIntent {
  const raw = transcript.trim();
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

  const words = text.split(' ');
  const substantial = words.length >= 3;
  // Fuzzy describe: sky/tonight talk with no named body in it ("what's
  // tonight sky", "how's the sky tonight") is a narration request, even
  // though it matches no preset phrase. Runs before question routing so
  // such speech never pays for a server round-trip.
  if (words.length >= 2) {
    const tokens = new Set(words);
    const skyTalk = tokens.has('sky') || tokens.has('tonight');
    const namesBody = BODY_WORDS.some((b) => includesPhrase(text, b));
    if (skyTalk && !namesBody) return { type: 'describe' };
  }
  // Direct questions: ends with "?" or opens like one ("where can…").
  // The mic being on is consent enough — no wake word demanded.
  if (substantial) {
    if (/\?\s*$/.test(raw)) return { type: 'ask', query: raw };
    if (QUESTION_OPENERS.some((opener) => text === opener || text.startsWith(opener + ' '))) {
      return { type: 'ask', query: raw };
    }
  }
  if (substantial && (opts.commandWindowOpen || opts.expectingQuestion)) {
    return { type: 'ask', query: raw };
  }
  return { type: 'none' };
}
