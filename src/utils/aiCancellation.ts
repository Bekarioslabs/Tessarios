/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** One id per send, so a "Stop" click can name exactly which in-flight request to abort. */
export function generateAiRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** The marker main.cjs throws for a deliberate abort — distinguishes "you stopped this"
 *  from "the server failed", which should never show as an error banner. */
const CANCELLED_MARKER = 'AI_REQUEST_CANCELLED';

export function isAiRequestCancelled(error: unknown): boolean {
  return error instanceof Error && error.message.includes(CANCELLED_MARKER);
}

/** Best-effort: the request may already have finished by the time this arrives (a normal
 *  race, not a bug), and there is nothing to do differently either way. */
export async function cancelAiRequest(requestId: string | null): Promise<void> {
  if (!requestId) return;
  try {
    const globalWindow = window as any;
    if (typeof globalWindow.vault?.aiChatCancel === 'function') {
      await globalWindow.vault.aiChatCancel(requestId);
    }
  } catch {
    // Nothing to recover — the caller resets its own UI state regardless.
  }
}
