/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * How many characters of resolved dossier context may travel with one request.
 *
 * This is a character budget, not a token budget, because it is applied while
 * assembling text — see AIContextResolver. German prose runs at roughly 3 characters
 * per token, so the estimates shown in settings divide by 3.
 *
 * The right value depends on two things the app cannot see: the context length
 * configured in LM Studio or Ollama, and how much VRAM the KV cache may occupy there.
 * Setting it too high does not error — the server silently drops the front of the
 * prompt, which is exactly where the constitution and project orientation sit. So this
 * is a choice the author makes, with the trade named, rather than a number picked here.
 */
export type ContextBudgetKey = 'small' | 'medium' | 'large' | 'huge';

export const CONTEXT_BUDGETS: Record<ContextBudgetKey, number> = {
  small: 8000,
  medium: 16000,
  large: 40000,
  huge: 100000,
};

/**
 * Deliberately modest: a fresh install has whatever context length its server defaults
 * to, often 4096 tokens, and the prompt layers alone already claim a good part of that.
 * Someone who has configured a large window can raise this and will see the difference.
 */
export const DEFAULT_CONTEXT_BUDGET_KEY: ContextBudgetKey = 'medium';

const STORAGE_KEY = 'aiContextBudget';

export function getContextBudgetKey(): ContextBudgetKey {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in CONTEXT_BUDGETS) return stored as ContextBudgetKey;
  return DEFAULT_CONTEXT_BUDGET_KEY;
}

export function setContextBudgetKey(key: ContextBudgetKey): void {
  localStorage.setItem(STORAGE_KEY, key);
}

/** The active budget in characters. */
export function getContextBudget(): number {
  return CONTEXT_BUDGETS[getContextBudgetKey()];
}

/**
 * Rough token estimate for a character count.
 *
 * German prose sits near 3 characters per token in the tokenizers these models use —
 * compound words are expensive. This is an estimate and is always labelled as one:
 * the exact count is only known to the server, and asking it would cost a round trip
 * per keystroke. Being roughly right, live, beats being exactly right, too late.
 */
export const CHARS_PER_TOKEN = 3;

export function estimateTokens(characters: number): number {
  return Math.round(characters / CHARS_PER_TOKEN);
}

/**
 * The context length the server is running the model with, in tokens.
 *
 * The app cannot know this on its own — it is a per-model setting inside LM Studio or
 * Ollama. It can sometimes be read back (see `ai:contextLength`), but not reliably, so
 * the stored value is what the author confirms. Exceeding it does not produce an error
 * anywhere: the server silently drops the oldest part of the prompt, which is where the
 * constitution and project orientation sit. That is why this is worth showing a bar for.
 */
const CONTEXT_LENGTH_KEY = 'aiModelContextLength';
/**
 * Only the assumption shown before the author has confirmed anything — "Server fragen"
 * (now reading LM Studio's own /api/v0/models, which reports what is really allocated)
 * or a manual entry immediately replaces it. 8192 undersold what local models commonly
 * run today: querying a real LM Studio instance while building this showed Qwen3-14B at
 * its native 32768 and a loaded Gemma at 260,000 of a 262,144 maximum. 32768 is picked as
 * a number a modestly-sized local model plausibly supports without yet claiming anything
 * about a specific machine — a bigger default would flatter hardware that may not back it.
 */
export const DEFAULT_MODEL_CONTEXT_TOKENS = 32768;

export function getModelContextTokens(): number {
  const stored = Number(localStorage.getItem(CONTEXT_LENGTH_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_MODEL_CONTEXT_TOKENS;
}

export function setModelContextTokens(tokens: number): void {
  localStorage.setItem(CONTEXT_LENGTH_KEY, String(Math.max(512, Math.round(tokens))));
}

/**
 * How full the context is, as a fraction, plus the band it falls in. The bands are not
 * cosmetic: 'over' means part of the prompt is being discarded by the server right now.
 */
export type ContextLoadLevel = 'ok' | 'tight' | 'over';

export function contextLoad(promptTokens: number, contextTokens: number): {
  ratio: number;
  level: ContextLoadLevel;
} {
  const ratio = contextTokens > 0 ? promptTokens / contextTokens : 0;
  // Headroom matters: the model still has to fit its *answer* in the same window, so
  // "full" is a problem well before 100%.
  const level: ContextLoadLevel = ratio >= 0.9 ? 'over' : ratio >= 0.7 ? 'tight' : 'ok';
  return { ratio, level };
}
