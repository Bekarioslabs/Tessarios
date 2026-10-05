/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/// <reference types="vite/client" />
import { Template } from '../types';
import { Language } from './i18n';
import { IVaultStorage } from './storage/VaultStorage';

/**
 * Vite rewrites each `import.meta.glob` call into a plain object at build time. Outside
 * Vite (the Node test runner imports vaultManager, which imports this) the call does not
 * exist and would throw on module load; a try/catch is the only guard that works for both,
 * and it is the same one aiResolver.ts uses — see the comment there for why a runtime
 * `typeof` check does not.
 */
function loadGlob(loader: () => Record<string, Template>): Record<string, Template> {
  try {
    return loader() || {};
  } catch {
    return {};
  }
}

// Built-in JSON templates imported statically via Vite
const deTemplateModules = loadGlob(() => import.meta.glob<Template>('../templates/de/*.json', { eager: true, import: 'default' }));
const enTemplateModules = loadGlob(() => import.meta.glob<Template>('../templates/en/*.json', { eager: true, import: 'default' }));

export const DEFAULT_TEMPLATES: Template[] = Object.values(deTemplateModules);
export const DEFAULT_TEMPLATES_EN: Template[] = Object.values(enTemplateModules);

export const DEFAULT_TEMPLATES_LOCALIZED: Record<Language, Template[]> = {
  de: DEFAULT_TEMPLATES,
  en: DEFAULT_TEMPLATES_EN
};

/**
 * Load custom user templates stored in `.tessarios/templates/*.json` inside the vault
 */
export async function loadCustomTemplatesFromVault(storage: IVaultStorage): Promise<Template[]> {
  const customTemplates: Template[] = [];
  try {
    const files = await storage.listFiles('.tessarios/templates');
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await storage.readFile(file);
          const parsed = JSON.parse(content);
          if (parsed && parsed.id && parsed.name && parsed.type) {
            customTemplates.push({
              id: parsed.id,
              name: parsed.name,
              type: parsed.type,
              description: parsed.description || '',
              defaultContent: parsed.defaultContent || '',
              defaultFields: parsed.defaultFields || {},
              defaultTags: Array.isArray(parsed.defaultTags) ? parsed.defaultTags : []
            });
          }
        } catch (e) {
          console.warn(`Could not load custom template ${file}:`, e);
        }
      }
    }
  } catch {
    // .tessarios/templates directory may not exist yet, which is completely fine
  }
  return customTemplates;
}

/**
 * Get all available templates for the given language, including optional custom vault templates
 */
export function getAvailableTemplates(language: Language, customTemplates: Template[] = []): Template[] {
  const builtIn = DEFAULT_TEMPLATES_LOCALIZED[language] || DEFAULT_TEMPLATES;
  if (!customTemplates || customTemplates.length === 0) {
    return builtIn;
  }
  // Custom templates overwrite built-in templates if ID matches, or get appended
  const builtInIds = new Set(builtIn.map(t => t.id));
  const overriddenBuiltIn = builtIn.map(t => {
    const customMatch = customTemplates.find(ct => ct.id === t.id);
    return customMatch || t;
  });
  const brandNewCustom = customTemplates.filter(ct => !builtInIds.has(ct.id));
  return [...overriddenBuiltIn, ...brandNewCustom];
}
