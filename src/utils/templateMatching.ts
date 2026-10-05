/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { LoreEntity, Template } from '../types';

/**
 * Finds the template an existing entity was created from.
 *
 * `templateId` is chosen at creation time and then thrown away — it is never written
 * to the markdown file (see `serializeToMarkdown`). The one durable trace is the tag
 * set: each template stamps its `defaultTags` onto the entity, so `character-hero`
 * leaves ["character", "hero"] while `character-antagonist` leaves
 * ["character", "antagonist"]. Matching on those recovers the choice without adding a
 * stored field that could go stale.
 *
 * Falls back to the first template of the same type, which is what the editor already
 * does, so a hand-edited tag list degrades to "generic template for this type" rather
 * than to nothing.
 */
export function resolveTemplateForEntity(
  entity: Pick<LoreEntity, 'type' | 'tags'>,
  templates: Template[]
): Template | undefined {
  const entityTags = new Set((entity.tags || []).map(t => t.toLowerCase()));
  const sameType = templates.filter(t => t.type === entity.type);
  if (sameType.length === 0) return undefined;

  let best: Template | undefined;
  let bestScore = 0;

  for (const template of sameType) {
    const defaultTags = template.defaultTags || [];
    if (defaultTags.length === 0) continue;

    const allPresent = defaultTags.every(tag => entityTags.has(tag.toLowerCase()));
    if (!allPresent) continue;

    // More matched tags means a more specific template, so "character + hero" wins
    // over a hypothetical "character"-only template.
    if (defaultTags.length > bestScore) {
      best = template;
      bestScore = defaultTags.length;
    }
  }

  return best || sameType[0];
}

/**
 * Section headers a template defines, read from the `##` headings of its
 * `defaultContent`. This is the source for the default AI spec when a template has no
 * `.ai.md` of its own.
 */
export function templateSectionHeaders(template: Template): string[] {
  const headers: string[] = [];
  for (const line of (template.defaultContent || '').split(/\r?\n/)) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) headers.push(match[1]);
  }
  return headers;
}

/** Fields the app fills in by itself; their emptiness is never the author's to-do. */
const MANAGED_FIELDS = new Set(['created', 'lastModified']);

export interface DossierGaps {
  emptyFields: string[];
  emptySections: string[];
}

/**
 * What is still missing in a dossier, as template minus what the entity actually has.
 *
 * This is a calculation, not a question for a model: it is always correct, costs
 * nothing, and needs no genre knowledge — the template supplies the expectations, so
 * a new chronicle type gets a correct to-do list without anyone writing rules for it.
 */
export function findDossierGaps(
  entity: Pick<LoreEntity, 'content' | 'customFields'>,
  template: Template
): DossierGaps {
  const declaredFields = new Set([
    ...Object.keys(template.defaultFields || {}),
    ...Object.keys(template.fieldConfig || {}),
  ]);

  const emptyFields = [...declaredFields].filter(field => {
    if (MANAGED_FIELDS.has(field)) return false;
    if (template.fieldConfig?.[field]?.readonly) return false;
    const value = entity.customFields?.[field];
    return !value || !value.trim();
  });

  const content = entity.content || '';
  const emptySections = templateSectionHeaders(template).filter(header => {
    const lines = content.split(/\r?\n/);
    const startIdx = lines.findIndex(
      l => l.trim().toLowerCase() === `## ${header}`.toLowerCase()
    );
    // A section the author deleted outright counts as missing, same as an empty one.
    if (startIdx === -1) return true;

    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) break;
      if (lines[i].trim()) return false;
    }
    return true;
  });

  return { emptyFields, emptySections };
}
