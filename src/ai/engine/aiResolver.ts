/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Language } from '../../utils/i18n';
import { IVaultStorage } from '../../utils/storage/VaultStorage';
import { parseAIMdSpec, AIMdSpec } from './aiFrontmatterParser';

/**
 * Built-in prompt files, inlined at build time.
 *
 * `import.meta.glob` is a compile-time construct: Vite rewrites each call into a plain
 * object before the code ever runs. Guarding it with a runtime check like
 * `typeof import.meta.glob === 'function'` therefore always fails in the browser and
 * silently yields empty maps — the files get bundled but stay unreachable. Only a
 * try/catch works for both worlds: Vite replaces the call outright, while Node (where
 * the test runner lives and no rewrite happens) throws and lands in the fallback.
 */
function loadGlob(loader: () => Record<string, string>): Record<string, string> {
  try {
    return loader() || {};
  } catch {
    // No Vite transform in this environment (e.g. the Node test runner); callers
    // pass explicit fallback content there.
    return {};
  }
}

const agentsPromptModules = loadGlob(() =>
  (import.meta as any).glob('../AGENTS.md', { eager: true, query: '?raw', import: 'default' })
);

const soulPromptModules = loadGlob(() =>
  (import.meta as any).glob('../SOUL.md', { eager: true, query: '?raw', import: 'default' })
);

const projectPromptModules = loadGlob(() =>
  (import.meta as any).glob('../PROJECT.md', { eager: true, query: '?raw', import: 'default' })
);

const deAiMdModules = loadGlob(() =>
  (import.meta as any).glob('../../templates/de/*.ai.md', { eager: true, query: '?raw', import: 'default' })
);

const enAiMdModules = loadGlob(() =>
  (import.meta as any).glob('../../templates/en/*.ai.md', { eager: true, query: '?raw', import: 'default' })
);

export const DEFAULT_AGENTS_PROMPT = Object.values(agentsPromptModules)[0] || '';
export const DEFAULT_SOUL_PROMPT = Object.values(soulPromptModules)[0] || '';
export const DEFAULT_PROJECT_PROMPT = Object.values(projectPromptModules)[0] || '';

/**
 * Resolve global AGENTS.md constitution prompt.
 * Priority: .tessarios/AGENTS.md (in vault) -> src/ai/AGENTS.md (built-in)
 */
export async function resolveAgentsPrompt(
  storage?: IVaultStorage | null,
  fallbackPrompt?: string
): Promise<string> {
  if (storage) {
    try {
      const customAgents = await storage.readFile('.tessarios/AGENTS.md');
      if (customAgents && customAgents.trim()) {
        return customAgents.trim();
      }
    } catch {
      // Custom AGENTS.md does not exist in vault, fallback to built-in
    }
  }
  return fallbackPrompt || DEFAULT_AGENTS_PROMPT.trim();
}

/**
 * Resolve persona and conversation style prompt (SOUL.md).
 * Priority: .tessarios/SOUL.md (in vault) -> src/ai/SOUL.md (built-in generic fallback)
 */
export async function resolveSoulPrompt(
  storage?: IVaultStorage | null,
  fallbackPrompt?: string
): Promise<string> {
  if (storage) {
    try {
      const customSoul = await storage.readFile('.tessarios/SOUL.md');
      if (customSoul && customSoul.trim()) {
        return customSoul.trim();
      }
    } catch {
      // Custom SOUL.md does not exist in vault, fallback to built-in
    }
  }
  return fallbackPrompt || DEFAULT_SOUL_PROMPT.trim();
}

/**
 * Resolve project-level orientation prompt (PROJECT.md).
 * Priority: .tessarios/PROJECT.md (in the vault) -> src/ai/PROJECT.md (built-in generic fallback)
 */
export async function resolveProjectPrompt(
  storage?: IVaultStorage | null,
  fallbackPrompt?: string
): Promise<string> {
  if (storage) {
    try {
      const customProject = await storage.readFile('.tessarios/PROJECT.md');
      if (customProject && customProject.trim()) {
        return customProject.trim();
      }
    } catch {
      // Custom PROJECT.md does not exist in vault, fallback to built-in
    }
  }
  return fallbackPrompt || DEFAULT_PROJECT_PROMPT.trim();
}

/**
 * Resolve AIMdSpec for a specific template ID and language.
 * Priority: .tessarios/templates/<templateId>.ai.md -> src/templates/<lang>/<templateId>.ai.md
 */
export async function resolveAIMdSpec(
  templateId: string,
  language: Language = 'de',
  storage?: IVaultStorage | null,
  fallbackContent?: string
): Promise<AIMdSpec | null> {
  // 1. Check custom vault templates first
  if (storage) {
    try {
      const customContent = await storage.readFile(`.tessarios/templates/${templateId}.ai.md`);
      if (customContent && customContent.trim()) {
        return parseAIMdSpec(customContent, templateId);
      }
    } catch {
      // Not found in custom vault templates, check built-in
    }
  }

  // 2. Check built-in templates for requested language
  const moduleMap = language === 'en' ? enAiMdModules : deAiMdModules;
  const matchKey = Object.keys(moduleMap).find(k => k.endsWith(`/${templateId}.ai.md`));

  if (matchKey && moduleMap[matchKey]) {
    return parseAIMdSpec(moduleMap[matchKey], templateId);
  }

  // 3. Fallback to German built-in if English missing or vice versa
  const fallbackMap = language === 'en' ? deAiMdModules : enAiMdModules;
  const fallbackKey = Object.keys(fallbackMap).find(k => k.endsWith(`/${templateId}.ai.md`));
  if (fallbackKey && fallbackMap[fallbackKey]) {
    return parseAIMdSpec(fallbackMap[fallbackKey], fallbackIdKey(fallbackKey));
  }

  // 4. Node CLI test fallback
  if (fallbackContent) {
    return parseAIMdSpec(fallbackContent, templateId);
  }

  return null;
}

function fallbackIdKey(key: string): string {
  const parts = key.split('/');
  const file = parts[parts.length - 1];
  return file.replace('.ai.md', '');
}
