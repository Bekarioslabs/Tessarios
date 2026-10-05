/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { EntityType } from '../../types';

export interface AIMdSpec {
  aiSpecVersion: number;
  templateId: string;
  entityType: EntityType;
  writePolicy: {
    sectionUpdates: 'target-only' | 'full-document';
    preserveFrontmatter: boolean;
    preserveOtherSections: boolean;
    requireAcceptanceBeforeWrite: boolean;
  };
  contextPolicy: {
    strategy: 'minimal-relevant' | 'full';
    includeFrontmatter: 'always' | 'never';
    includeExistingSections: 'relevant' | 'all' | 'none';
    followContextFields: 'selective' | 'all';
  };
  sections: Record<string, {
    mode: 'collaborative' | 'muse' | 'canon-sensitive' | 'structured' | 'analytical';
    creativity: 'low' | 'medium' | 'high';
    context?: string[];
  }>;
  instructionsPrompt: string;
}

/**
 * Split a markdown string into raw YAML frontmatter string and remaining body content
 */
export function splitFrontmatterAndBody(markdown: string): { rawFrontmatter: string; body: string } {
  if (!markdown) return { rawFrontmatter: '', body: '' };

  const trimmed = markdown.trimStart();
  if (!trimmed.startsWith('---')) {
    return { rawFrontmatter: '', body: markdown };
  }

  const endMatch = trimmed.indexOf('\n---', 3);
  if (endMatch === -1) {
    return { rawFrontmatter: '', body: markdown };
  }

  const rawFrontmatter = trimmed.slice(3, endMatch).trim();
  const body = trimmed.slice(endMatch + 4).trimStart();

  return { rawFrontmatter, body };
}

/**
 * Clean quotes and extra whitespace from YAML keys and string values
 */
function cleanYamlStr(str: string): string {
  if (!str) return '';
  let s = str.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

/**
 * Splits a line into key and value at the colon that actually separates them, or
 * returns null when the line isn't a mapping at all. Two YAML rules matter here and
 * both used to be missing:
 *
 *   - A quoted key may itself contain colons (`"field:Rolle": …`), so the search for
 *     the separator has to start after the closing quote.
 *   - A colon only separates when followed by whitespace or end-of-line. Without that,
 *     a plain scalar like `relations:important` gets misread as a nested map and ends
 *     up stringifying to "[object Object]".
 */
function splitKeyValue(line: string): { key: string; value: string } | null {
  let searchFrom = 0;
  if (line.startsWith('"') || line.startsWith("'")) {
    const closingQuote = line.indexOf(line[0], 1);
    if (closingQuote === -1) return null;
    searchFrom = closingQuote + 1;
  }

  const colonIdx = line.indexOf(':', searchFrom);
  if (colonIdx === -1) return null;

  const after = line.slice(colonIdx + 1);
  if (after !== '' && !/^\s/.test(after)) return null;

  return { key: cleanYamlStr(line.slice(0, colonIdx)), value: after.trim() };
}

/**
 * Simple, robust YAML parser for frontmatter KV structures, arrays, and nested maps.
 * Handles Phase 0 schema validation and fallbacks without crashing on corrupt YAML.
 */
export function parseYamlSimple(rawYaml: string): Record<string, any> {
  const root: Record<string, any> = {};
  if (!rawYaml || !rawYaml.trim()) return root;

  const lines = rawYaml.split(/\r?\n/);
  const stack: { indent: number; key?: string; obj: any }[] = [
    { indent: -1, obj: root }
  ];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;

    const indent = rawLine.search(/\S/);
    const line = rawLine.trim();

    // Pop stack frames until we match current indentation level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1];

    if (line.startsWith('- ')) {
      const itemContent = line.slice(2).trim();

      // Convert current object container to array if it was initialized as map
      const parentFrame = stack.length > 1 ? stack[stack.length - 2] : null;
      if (parentFrame && current.key && !Array.isArray(parentFrame.obj[current.key])) {
        parentFrame.obj[current.key] = [];
        current.obj = parentFrame.obj[current.key];
      }

      // current.key is only ever undefined on the root stack frame (pushed once, without
      // a key, at the top of this function), and that frame can never be `current` while
      // parentFrame is non-null — every other frame is pushed with a key set. The `!` is
      // asserting that invariant, not sidestepping a real gap.
      const targetArr = Array.isArray(current.obj) ? current.obj : (parentFrame ? parentFrame.obj[current.key!] : []);

      const itemEntry = splitKeyValue(itemContent);
      if (itemEntry) {
        const { key: k, value: valStr } = itemEntry;
        const itemObj: Record<string, any> = {};
        if (valStr !== '') {
          itemObj[k] = parseValue(valStr);
        }
        if (Array.isArray(targetArr)) {
          targetArr.push(itemObj);
        }
        stack.push({ indent, key: k, obj: itemObj });
      } else {
        if (Array.isArray(targetArr)) {
          targetArr.push(parseValue(itemContent));
        }
      }
    } else {
      const entry = splitKeyValue(line);
      if (!entry) continue;
      const { key, value: valStr } = entry;

      if (valStr.length > 0) {
        current.obj[key] = parseValue(valStr);
      } else {
        current.obj[key] = {};
        stack.push({ indent, key, obj: current.obj[key] });
      }
    }
  }

  return root;
}

/**
 * The closed set of context rules a `.ai.md` section may request. Anything else is a
 * plausible-looking identifier that resolves to nothing at runtime — the exact class of
 * bug this project keeps re-discovering the hard way (see AGENTS.md). Failing here, at
 * load time, beats failing silently three layers down in the context resolver.
 */
const VALID_CONTEXT_RULES = [
  'current-entity',
  'relations',
  'relations:important',
  'relations:group-relevant',
  'lore:relevant',
  'storylines:relevant',
  'books:relevant',
  'mentioned:dossiers',
] as const;

function assertValidContextRule(rule: string, templateId: string, sectionName: string): void {
  const trimmed = rule.trim();
  if ((VALID_CONTEXT_RULES as readonly string[]).includes(trimmed)) return;
  if (trimmed.startsWith('section:') && trimmed.length > 'section:'.length) return;
  if (trimmed.startsWith('field:') && trimmed.length > 'field:'.length) return;

  throw new Error(
    `Unbekannte Kontextregel "${rule}" in Abschnitt "${sectionName}" von ${templateId}.ai.md. ` +
    `Gültig sind: ${VALID_CONTEXT_RULES.join(', ')}, section:<Name>, field:<Name>.`
  );
}

function parseValue(valStr: string): any {
  const cleaned = cleanYamlStr(valStr);
  if (cleaned === 'true') return true;
  if (cleaned === 'false') return false;
  if (cleaned === 'null' || cleaned === '~') return null;
  if (!isNaN(Number(cleaned)) && cleaned !== '') return Number(cleaned);
  return cleaned;
}

/**
 * Parses a `.ai.md` file string into an AIMdSpec with Phase 0 Schema Fallbacks
 */
export function parseAIMdSpec(markdownContent: string, templateId: string): AIMdSpec {
  const { rawFrontmatter, body } = splitFrontmatterAndBody(markdownContent);
  const yamlData = parseYamlSimple(rawFrontmatter);

  const fallbackMode = 'collaborative';
  const fallbackCreativity = 'medium';

  // Phase 0 Fallback Validation
  const sectionsParsed: Record<string, any> = {};
  if (yamlData.sections && typeof yamlData.sections === 'object') {
    for (const [secName, secVal] of Object.entries(yamlData.sections)) {
      if (secVal && typeof secVal === 'object') {
        const valObj = secVal as any;
        const validMode = ['collaborative', 'muse', 'canon-sensitive', 'structured', 'analytical'].includes(valObj.mode)
          ? valObj.mode
          : fallbackMode;
        const validCreativity = ['low', 'medium', 'high'].includes(valObj.creativity)
          ? valObj.creativity
          : fallbackCreativity;
        
        let contextList: string[] = [];
        if (Array.isArray(valObj.context)) {
          contextList = valObj.context.map((c: any) => String(c));
          const resolvedTemplateId = yamlData.templateId || templateId;
          contextList.forEach(rule => assertValidContextRule(rule, resolvedTemplateId, secName));
        }

        sectionsParsed[secName] = {
          mode: validMode,
          creativity: validCreativity,
          context: contextList
        };
      }
    }
  }

  return {
    aiSpecVersion: Number(yamlData.aiSpecVersion) || 1,
    templateId: yamlData.templateId || templateId,
    entityType: (yamlData.entityType as EntityType) || 'character',
    writePolicy: {
      sectionUpdates: yamlData.writePolicy?.sectionUpdates === 'full-document' ? 'full-document' : 'target-only',
      preserveFrontmatter: yamlData.writePolicy?.preserveFrontmatter !== false,
      preserveOtherSections: yamlData.writePolicy?.preserveOtherSections !== false,
      requireAcceptanceBeforeWrite: yamlData.writePolicy?.requireAcceptanceBeforeWrite !== false,
    },
    contextPolicy: {
      strategy: yamlData.contextPolicy?.strategy === 'full' ? 'full' : 'minimal-relevant',
      includeFrontmatter: yamlData.contextPolicy?.includeFrontmatter === 'never' ? 'never' : 'always',
      includeExistingSections: yamlData.contextPolicy?.includeExistingSections || 'relevant',
      followContextFields: yamlData.contextPolicy?.followContextFields || 'selective',
    },
    sections: sectionsParsed,
    instructionsPrompt: body.trim(),
  };
}
