/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getInitialLanguage } from '../i18n';

/** Which language a fresh install starts in, and that a stored choice always wins. */
export async function runLanguageTests(): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = [];
  let passed = true;
  function assert(condition: unknown, message: string) {
    if (condition) log.push(`✅ PASS: ${message}`);
    else { log.push(`❌ FAIL: ${message}`); passed = false; }
  }

  const g = globalThis as any;
  const original = {
    navigator: Object.getOwnPropertyDescriptor(g, 'navigator'),
    localStorage: Object.getOwnPropertyDescriptor(g, 'localStorage'),
  };
  const setEnv = (systemLanguage: string | undefined, stored: string | null) => {
    Object.defineProperty(g, 'navigator', { value: systemLanguage === undefined ? undefined : { language: systemLanguage }, configurable: true, writable: true });
    Object.defineProperty(g, 'localStorage', { value: { getItem: () => stored }, configurable: true, writable: true });
  };

  try {
    setEnv('en-US', null);
    assert(getInitialLanguage() === 'en', 'an English system starts in English');
    setEnv('de-DE', null);
    assert(getInitialLanguage() === 'de', 'a German system starts in German');
    setEnv('de', null);
    assert(getInitialLanguage() === 'de', 'a plain "de" system language counts as German');
    setEnv('fr-FR', null);
    assert(getInitialLanguage() === 'en', 'any other system language starts in English');
    setEnv(undefined, null);
    assert(getInitialLanguage() === 'en', 'without a system language it starts in English');
    setEnv('de-DE', 'en');
    assert(getInitialLanguage() === 'en', 'a stored choice beats the system language (English)');
    setEnv('en-US', 'de');
    assert(getInitialLanguage() === 'de', 'a stored choice beats the system language (German)');
    setEnv('en-US', 'klingon');
    assert(getInitialLanguage() === 'en', 'an invalid stored value is ignored');
  } catch (e: any) {
    log.push(`❌ FAIL: language test crashed: ${e?.message || e}`);
    passed = false;
  } finally {
    for (const key of ['navigator', 'localStorage'] as const) {
      if (original[key]) Object.defineProperty(g, key, original[key]!);
      else delete g[key];
    }
  }

  return { success: passed, log };
}
