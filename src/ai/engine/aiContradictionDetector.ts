/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { EntityType, FieldDefinition, LoreEntity, Template } from '../../types';
import { extractManuscriptText } from '../../utils/manuscript';
import { resolveTemplateForEntity } from '../../utils/templateMatching';

export interface FieldContradiction {
  /** Title of the scene/chapter where the conflicting text was found. */
  sourceTitle: string;
  sourceId: string;
  /** The competing value that was found in that text. */
  conflictingValue: string;
}

const MANUSCRIPT_TYPES: EntityType[] = ['scene', 'chapter'];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strips `[[Title]]` / `[[Title|Alias]]` down to the plain display text. */
function unwrapWikilink(value: string): string {
  const match = value.match(/\[\[(.*?)\]\]/);
  if (!match) return value.trim();
  return match[1].split('|')[0].trim();
}

/** True if `phrase` occurs in `text` as a whole word/phrase, case-insensitive. */
function containsPhrase(text: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed) return false;
  const pattern = new RegExp(`(?:^|\\P{L})${escapeRegExp(trimmed)}(?:$|\\P{L})`, 'iu');
  return pattern.test(text);
}

/**
 * The values worth searching for: for a `select` field, every option other than the
 * one being proposed (the field's own options ARE the domain vocabulary — no outside
 * knowledge needed); plus the entity's own current value for this field, if it's
 * about to change. Both are deterministic — nothing here guesses at meaning.
 */
function competingValues(
  entity: LoreEntity,
  field: string,
  proposedValue: string,
  fieldDef: FieldDefinition | undefined
): string[] {
  const proposedNormalized = unwrapWikilink(proposedValue).toLowerCase();
  const values = new Set<string>();

  if (fieldDef?.type === 'select' && fieldDef.options) {
    for (const option of fieldDef.options) {
      if (option.toLowerCase() !== proposedNormalized) values.add(option);
    }
  }

  const current = entity.customFields?.[field];
  if (current && current.trim()) {
    const currentPlain = unwrapWikilink(current);
    if (currentPlain.toLowerCase() !== proposedNormalized) values.add(currentPlain);
  }

  return [...values].filter(v => v.trim().length > 0);
}

/**
 * Checks a proposed field value against the manuscript — deterministic text search,
 * no model call, no language understanding. Only scenes/chapters that actually
 * mention this entity are searched, keeping it fast and relevant. Returns the first
 * conflict found, or null. See docs/ki-spezifikation.md §6.
 */
export function findFieldContradiction(
  entity: LoreEntity,
  field: string,
  proposedValue: string,
  fieldDef: FieldDefinition | undefined,
  allEntities: Record<string, LoreEntity>
): FieldContradiction | null {
  const candidates = competingValues(entity, field, proposedValue, fieldDef);
  if (candidates.length === 0) return null;

  const nameNeedles = [entity.title, entity.customFields?.Heldenname]
    .filter((n): n is string => Boolean(n && n.trim()));
  if (nameNeedles.length === 0) return null;

  for (const other of Object.values(allEntities)) {
    if (!MANUSCRIPT_TYPES.includes(other.type)) continue;
    if (!other.content) continue;

    const mentionsEntity = nameNeedles.some(
      name => other.content.includes(`[[${name}`) || containsPhrase(other.content, name)
    );
    if (!mentionsEntity) continue;

    const manuscriptText = extractManuscriptText(other.content);
    for (const value of candidates) {
      if (containsPhrase(manuscriptText, value)) {
        return { sourceTitle: other.title, sourceId: other.id, conflictingValue: value };
      }
    }
  }

  return null;
}

/** One place where a scene says something its own dossiers disagree with. */
export interface SceneContradiction {
  /** The dossier whose field is being contradicted. */
  entityTitle: string;
  entityId: string;
  field: string;
  /** What the dossier says. */
  dossierValue: string;
  /** The competing value the scene text uses instead. */
  conflictingValue: string;
}

/** Every entry the text wikilinks to, excluding manuscript entries. */
function mentionedDossiers(
  scene: LoreEntity,
  allEntities: Record<string, LoreEntity>
): LoreEntity[] {
  const byTitle = new Map<string, LoreEntity>();
  for (const e of Object.values(allEntities)) {
    if (MANUSCRIPT_TYPES.includes(e.type) || e.type === 'book') continue;
    byTitle.set(e.title.trim().toLowerCase(), e);
  }

  const found = new Map<string, LoreEntity>();
  for (const raw of scene.content.match(/\[\[(.*?)\]\]/g) || []) {
    const ref = raw.slice(2, -2).split('|')[0].trim().toLowerCase();
    const hit = byTitle.get(ref) || allEntities[ref];
    if (hit && !MANUSCRIPT_TYPES.includes(hit.type) && hit.type !== 'book') {
      found.set(hit.id, hit);
    }
  }
  return [...found.values()];
}

/**
 * The reverse of `findFieldContradiction`, and what the manuscript editor role needs:
 * instead of checking one proposed field value against the manuscript, this reads one
 * scene and asks which of its own dossiers it contradicts.
 *
 * Only `select` fields are checked, and only against their sibling options. That is the
 * whole trick and the reason this needs no model: a select field's options *are* the
 * domain vocabulary, so "the dossier says Protagonist and the scene says Nebenheld" is
 * decidable by text search, with nothing guessed about meaning. Free text is left alone
 * — there is no way to tell a contradiction from a turn of phrase without understanding
 * the sentence.
 *
 * Findings are shown, never enforced: a scene may simply be ahead of a dossier the
 * author has not updated yet.
 */
/**
 * How close, in characters, a value has to sit to a mention of the figure before the
 * scene counts as saying it *about* that figure. Roughly one sentence either side.
 */
const NAME_PROXIMITY_CHARS = 120;

/**
 * Options that are ordinary words in prose first and category labels second. A scene
 * that says "No." or "the door was low" is not claiming anything about a dossier field
 * that happens to offer yes/no or low/medium/high, so these are never searched for.
 * Checking them produced false findings on dialogue alone.
 */
const GENERIC_OPTIONS = new Set([
  'yes', 'no', 'none', 'low', 'medium', 'high', 'undecided', 'unknown', 'other',
  'ja', 'nein', 'offen', 'keiner', 'niedrig', 'mittel', 'hoch', 'unbekannt', 'sonstiges',
]);

/** Words that start a title without naming anyone. */
const TITLE_PREFIXES = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'herr', 'frau']);

/** Every way a scene might refer to this dossier: its full title, its hero name or
 *  alias, and each distinct name word ("Mira" for "Mira Okafor"). */
function nameNeedles(dossier: LoreEntity): string[] {
  const names = new Set<string>();
  const add = (n?: string) => {
    if (n && n.trim()) names.add(n.trim());
  };
  add(dossier.title);
  add(dossier.customFields?.HeroName);
  add(dossier.customFields?.Heldenname);
  add(dossier.customFields?.Alias);
  for (const word of dossier.title.split(/\s+/)) {
    const bare = word.replace(/[.,]/g, '');
    if (bare.length >= 4 && !TITLE_PREFIXES.has(bare.toLowerCase())) names.add(bare);
  }
  return [...names];
}

function phraseIndexes(text: string, phrase: string): number[] {
  const trimmed = phrase.trim();
  if (!trimmed) return [];
  const pattern = new RegExp(`(?<!\\p{L})${escapeRegExp(trimmed)}(?!\\p{L})`, 'giu');
  return [...text.matchAll(pattern)].map(m => m.index ?? 0);
}

/** True if `phrase` appears within NAME_PROXIMITY_CHARS of any mention of the figure. */
function occursNearName(text: string, phrase: string, names: string[]): boolean {
  const hits = phraseIndexes(text, phrase);
  if (hits.length === 0) return false;
  const nameHits = names.flatMap(n => phraseIndexes(text, n));
  return hits.some(h => nameHits.some(n => Math.abs(h - n) <= NAME_PROXIMITY_CHARS));
}

export function findSceneContradictions(
  scene: LoreEntity,
  allEntities: Record<string, LoreEntity>,
  templates: Template[]
): SceneContradiction[] {
  const sceneText = extractManuscriptText(scene.content);
  if (!sceneText.trim()) return [];

  const findings: SceneContradiction[] = [];

  for (const dossier of mentionedDossiers(scene, allEntities)) {
    const template = resolveTemplateForEntity(dossier, templates);
    const fieldConfig = template?.fieldConfig;
    if (!fieldConfig) continue;
    const names = nameNeedles(dossier);

    for (const [field, def] of Object.entries(fieldConfig)) {
      if (def.type !== 'select' || !def.options || def.options.length === 0) continue;

      const current = dossier.customFields?.[field];
      if (!current || !current.trim()) continue;
      const currentPlain = unwrapWikilink(current);

      // The scene stating the dossier's own value about this figure is agreement,
      // not conflict.
      if (occursNearName(sceneText, currentPlain, names)) continue;

      for (const option of def.options) {
        if (option.toLowerCase() === currentPlain.toLowerCase()) continue;
        if (GENERIC_OPTIONS.has(option.trim().toLowerCase())) continue;
        if (!occursNearName(sceneText, option, names)) continue;

        findings.push({
          entityTitle: dossier.title,
          entityId: dossier.id,
          field,
          dossierValue: currentPlain,
          conflictingValue: option,
        });
        break; // one finding per field is enough to send the author looking
      }
    }
  }

  return findings;
}
