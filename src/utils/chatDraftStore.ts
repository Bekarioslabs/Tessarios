/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { IVaultStorage } from './storage/VaultStorage';

/**
 * An unfinished conversation, persisted as-is — never a conversation log. One message,
 * one destination, one pending reply; a new message overwrites the previous reply
 * rather than appending to a history.
 *
 * Both stores below are keyed by entry id and are pure convenience: losing one costs
 * an unsent message, never anything written to a dossier or a scene.
 */
export interface StoredDossierDraft {
  chatPrompt: string;
  targetSection: string;
  aiResponse: string;
}

/** The manuscript companion's equivalent. `role` is which hat it was wearing. */
export interface StoredManuscriptDraft {
  chatPrompt: string;
  role: string;
  aiResponse: string;
}

const DOSSIER_DRAFTS_PATH = '.tessarios/freeform-drafts.json';
const MANUSCRIPT_DRAFTS_PATH = '.tessarios/manuscript-drafts.json';

/** One prior round of the live, in-memory-only conversation about the current target. */
export interface ChatExchange {
  prompt: string;
  reply: string;
}

/**
 * Caps how much of the current conversation gets replayed to the model — a safety valve
 * for the rare case of many rounds on one target, not the everyday mechanism. Trims the
 * oldest exchanges first, always keeps at least the latest one.
 */
const EXCHANGE_CHAR_BUDGET = 6000;

export function trimExchangesToBudget(exchanges: ChatExchange[]): ChatExchange[] {
  let used = 0;
  const kept: ChatExchange[] = [];
  for (let i = exchanges.length - 1; i >= 0; i--) {
    const len = exchanges[i].prompt.length + exchanges[i].reply.length;
    if (used + len > EXCHANGE_CHAR_BUDGET && kept.length > 0) break;
    used += len;
    kept.unshift(exchanges[i]);
  }
  return kept;
}

/** Best-effort read. Missing file, corrupt JSON, or no storage all yield "no drafts". */
async function loadDraftMap<T>(
  storage: IVaultStorage | null,
  path: string
): Promise<Record<string, T>> {
  if (!storage) return {};
  try {
    const raw = await storage.readFile(path);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Writes the full draft map, dropping empty entries first — a draft that has been
 * cleared or was never touched shouldn't cost a permanent line in this file. Silent
 * on failure: this is a convenience cache, never the vault's canon.
 */
async function saveDraftMap<T extends { chatPrompt: string; aiResponse: string }>(
  storage: IVaultStorage | null,
  path: string,
  drafts: Record<string, T>
): Promise<void> {
  if (!storage) return;
  const meaningful = Object.fromEntries(
    Object.entries(drafts).filter(([, d]) => d.chatPrompt.trim() || d.aiResponse.trim())
  );
  try {
    if (Object.keys(meaningful).length === 0) {
      await storage.deleteFile(path);
      return;
    }
    await storage.writeFile(path, JSON.stringify(meaningful, null, 2));
  } catch {
    // Best-effort — the in-memory draft for this session is unaffected.
  }
}

export const loadDossierDrafts = (storage: IVaultStorage | null) =>
  loadDraftMap<StoredDossierDraft>(storage, DOSSIER_DRAFTS_PATH);

export const saveDossierDrafts = (
  storage: IVaultStorage | null,
  drafts: Record<string, StoredDossierDraft>
) => saveDraftMap(storage, DOSSIER_DRAFTS_PATH, drafts);

export const loadManuscriptDrafts = (storage: IVaultStorage | null) =>
  loadDraftMap<StoredManuscriptDraft>(storage, MANUSCRIPT_DRAFTS_PATH);

export const saveManuscriptDrafts = (
  storage: IVaultStorage | null,
  drafts: Record<string, StoredManuscriptDraft>
) => saveDraftMap(storage, MANUSCRIPT_DRAFTS_PATH, drafts);
