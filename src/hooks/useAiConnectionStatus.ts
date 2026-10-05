/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';

/**
 * Polls the AI provider configured in Settings (aiProvider/aiBaseUrl in localStorage) and
 * reports whether it's actually reachable with a model loaded — not just whether the server
 * process is running. LM Studio and Ollama both happily answer with an empty model list when
 * no model has been loaded, which reads as "ready" if you only check for a response.
 */
export function useAiConnectionStatus(pollIntervalMs = 20000): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const globalVault = (window as any).vault;
      if (!globalVault || typeof globalVault.listAiModels !== 'function') {
        if (!cancelled) setIsReady(false);
        return;
      }
      const provider = localStorage.getItem('aiProvider') || 'lmstudio';
      const baseUrl = localStorage.getItem('aiBaseUrl') || 'http://127.0.0.1:1234/v1';
      try {
        const models: string[] = await globalVault.listAiModels(provider, baseUrl);
        if (!cancelled) setIsReady(Array.isArray(models) && models.length > 0);
      } catch {
        if (!cancelled) setIsReady(false);
      }
    };

    check();
    const interval = setInterval(check, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pollIntervalMs]);

  return isReady;
}
