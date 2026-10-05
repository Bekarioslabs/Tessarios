/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { LoreEntity, EntityType, Relation, MapMarker } from '../types';

export interface WikiLinkSuggestion {
  id: string;
  start: number;
  end: number;
  matchText: string;
  replacementText: string;
  entityTitle: string;
  entityType?: EntityType;
  contextSnippet: string;
  selected: boolean;
}

/**
  * Detects entity name occurrences in plain text and returns a list of actionable suggestions with context snippets.
  */
export function detectWikiLinkSuggestions(
  content: string,
  entities: Record<string, LoreEntity>,
  currentEntityId?: string
): WikiLinkSuggestion[] {
  if (!content || !entities) return [];

  const currentEntity = currentEntityId ? entities[currentEntityId] : null;
  const currentTitleLower = currentEntity ? currentEntity.title.toLowerCase().trim() : '';

  // Get list of entities sorted by title length descending (longer titles match first)
  const candidateEntities = Object.values(entities)
    .filter(e => {
      if (!e.title) return false;
      const cleanTitle = e.title.trim();
      if (cleanTitle.length < 3) return false; // Skip ultra-short titles like "A" or "1"
      if (e.id === currentEntityId) return false; // Don't self-link
      if (currentTitleLower && cleanTitle.toLowerCase() === currentTitleLower) return false;
      return true;
    })
    .sort((a, b) => b.title.trim().length - a.title.trim().length);

  if (candidateEntities.length === 0) return [];

  const PROTECTED_REGEX = /(```[\s\S]*?```|`[^`]+`|!\[\[[\s\S]*?\]\]|\[\[[\s\S]*?\]\]|!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]+\)|<!--[\s\S]*?-->)/g;

  // Track occupied character ranges [start, end]
  const occupiedRanges: [number, number][] = [];

  let match: RegExpExecArray | null;
  while ((match = PROTECTED_REGEX.exec(content)) !== null) {
    occupiedRanges.push([match.index, match.index + match[0].length]);
  }

  const isRangeOccupied = (start: number, end: number) => {
    return occupiedRanges.some(([rStart, rEnd]) => !(end <= rStart || start >= rEnd));
  };

  const suggestions: WikiLinkSuggestion[] = [];

  for (const entity of candidateEntities) {
    const cleanTitle = entity.title.trim();
    const escaped = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![a-zA-Z0-9_äöüÄÖÜß])${escaped}(?![a-zA-Z0-9_äöüÄÖÜß])`, 'gi');

    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      const matchStart = m.index;
      const matchEnd = matchStart + m[0].length;

      if (!isRangeOccupied(matchStart, matchEnd)) {
        occupiedRanges.push([matchStart, matchEnd]);

        const matchText = m[0];
        const replacementText = matchText.toLowerCase() === cleanTitle.toLowerCase()
          ? `[[${cleanTitle}]]`
          : `[[${cleanTitle}|${matchText}]]`;

        // Context snippet calculation
        const snippetStart = Math.max(0, matchStart - 25);
        const snippetEnd = Math.min(content.length, matchEnd + 25);

        const before = content.substring(snippetStart, matchStart).replace(/\n/g, ' ');
        const after = content.substring(matchEnd, snippetEnd).replace(/\n/g, ' ');

        const prefix = snippetStart > 0 ? '...' : '';
        const suffix = snippetEnd < content.length ? '...' : '';

        const contextSnippet = `${prefix}${before} → [${replacementText}] ← ${after}${suffix}`;

        suggestions.push({
          id: `sug_${matchStart}_${matchEnd}_${entity.id}`,
          start: matchStart,
          end: matchEnd,
          matchText,
          replacementText,
          entityTitle: cleanTitle,
          entityType: entity.type,
          contextSnippet,
          selected: true
        });
      }
    }
  }

  // Sort suggestions by appearance order in text
  return suggestions.sort((a, b) => a.start - b.start);
}

/**
 * Applies selected WikiLink suggestions to content string.
 */
export function applyWikiLinkSuggestions(
  content: string,
  suggestions: WikiLinkSuggestion[]
): { updatedContent: string; appliedCount: number } {
  const selected = suggestions.filter(s => s.selected);
  if (selected.length === 0) return { updatedContent: content, appliedCount: 0 };

  // Sort descending by start position to apply replacements without index shifts
  const sorted = [...selected].sort((a, b) => b.start - a.start);

  let updated = content;
  for (const sug of sorted) {
    updated = updated.substring(0, sug.start) + sug.replacementText + updated.substring(sug.end);
  }

  return { updatedContent: updated, appliedCount: selected.length };
}

/**
 * Automatically detects entity names in plain text content and wraps them in [[WikiLinks]].
 * Ignores already linked text [[...]], code blocks, images, links, and current entity name.
 */
export function autoLinkEntitiesInText(
  content: string,
  entities: Record<string, LoreEntity>,
  currentEntityId?: string
): { updatedContent: string; addedLinksCount: number } {
  const suggestions = detectWikiLinkSuggestions(content, entities, currentEntityId);
  const { updatedContent, appliedCount } = applyWikiLinkSuggestions(content, suggestions);
  return { updatedContent, addedLinksCount: appliedCount };
}

/**
 * Slugify a title to a filename-safe format, matching Obsidian conventions
 */
export function toVaultUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const cleanPath = url.replace(/^(vault:\/*)+/i, '');
  return `vault://${cleanPath}`;
}

export function fromVaultUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return url.replace(/^(vault:\/*)+/i, '');
}

/**
 * Maps an entity type to its vault category folder. Single source of truth — used by the
 * live save path (vaultManager.ts), the backup tree (which mirrors this layout), and ZIP
 * export (fileSystemVault.ts), which must all agree on where a given entity type lives.
 *
 * One folder per entity type, deliberately: the previous grouping put book/chapter/scene
 * together in "Chronicles" and dumped eight unrelated types (relationship, power,
 * organization, storyline, brainstorm, note, visual, lore) into a catch-all "Lore" folder,
 * which made the vault unbrowsable outside the app.
 *
 * NOTE: main.cjs pre-creates these folders on vault init and keeps its own copy of this
 * list (main process is CommonJS and can't import this module) — update both together.
 */
const CATEGORY_FOLDERS: Record<EntityType, string> = {
  book: 'Books',
  chapter: 'Chapters',
  scene: 'Scenes',
  character: 'Characters',
  relationship: 'Relationships',
  item: 'Items',
  map: 'Maps',
  power: 'Powers',
  lore: 'Lore',
  organization: 'Organizations',
  place: 'Places',
  storyline: 'Storylines',
  brainstorm: 'Brainstorms',
  note: 'Notes',
  visual: 'Visuals',
};

export function getCategoryFolder(type: EntityType): string {
  return CATEGORY_FOLDERS[type] || 'Lore';
}

export function slugify(text: string): string {
  if (!text) return '';
  const germanMap: Record<string, string> = {
    'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
    'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue'
  };
  let str = text.toString().trim();
  str = str.replace(/[äöüßÄÖÜ]/g, m => germanMap[m] || m);

  const slug = str
    .toLowerCase()
    .normalize('NFD') // normalize characters (accents)
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');

  return slug || str.toLowerCase().replace(/[^a-z0-9]/g, '') || `entity-${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Language of the text this module writes into files itself — the gallery heading and the
 * map legend. It follows the interface language (App.tsx sets it), but an existing heading
 * keeps the spelling it already has, so switching the interface does not rewrite every
 * German note the next time it is saved.
 */
type GeneratedTextLanguage = 'de' | 'en';
let generatedTextLanguage: GeneratedTextLanguage = 'de';

export function setGeneratedTextLanguage(language: GeneratedTextLanguage): void {
  generatedTextLanguage = language;
}

/**
 * Generate a clean Markdown table for map markers (human-readable in Obsidian)
 */
export function generateMapMarkersTable(
  markers: MapMarker[],
  entities?: Record<string, LoreEntity>,
  language: GeneratedTextLanguage = generatedTextLanguage
): string {
  const en = language === 'en';
  if (!markers || markers.length === 0) {
    return en ? '*(No markers placed on this map yet)*' : '*(Keine Markierungen auf dieser Karte gesetzt)*';
  }

  const lines: string[] = [];
  lines.push(en
    ? '| Marker | Relative pos (X, Y) | Linked entry | Description |'
    : '| Marker | Relative Pos (X, Y) | Verknüpfter Eintrag | Beschreibung |');
  lines.push('| --- | --- | --- | --- |');

  markers.forEach(m => {
    const relX = (m.x / 100).toFixed(2);
    const relY = (m.y / 100).toFixed(2);
    let linkStr = en ? '*(unlinked)*' : '*(unverknüpft)*';
    if (m.targetEntityId) {
      const targetEntity = entities ? entities[m.targetEntityId] : null;
      const targetTitle = targetEntity ? targetEntity.title : m.targetEntityId;
      linkStr = `[[${targetTitle}]]`;
    }
    const cleanDesc = (m.description || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const cleanLabel = m.label.replace(/\|/g, '\\|');
    lines.push(`| **${cleanLabel}** | \`${relX}, ${relY}\` (${m.x}%, ${m.y}%) | ${linkStr} | ${cleanDesc} |`);
  });

  return lines.join('\n');
}

/**
 * Update or append the ## Legende & Marker section in markdown content
 */
export function updateMapContentWithMarkers(
  content: string,
  markers: MapMarker[],
  entities?: Record<string, LoreEntity>,
  floors?: any[],
  regions?: any[]
): string {
  // Strip out any old Zoom Map code blocks or sections if present
  let cleanContent = content.replace(/##\s+Interaktive Karte[\s\S]*?(?=\n##\s+|$)/gi, '').trim();

  const existingLegend = cleanContent.match(/##\s+(Legende\s*&\s*Marker|Legend\s*&\s*Markers)/i);
  const legendLanguage: GeneratedTextLanguage = existingLegend
    ? (/^legende/i.test(existingLegend[1]) ? 'de' : 'en')
    : generatedTextLanguage;
  const tableMarkdown = generateMapMarkersTable(markers, entities, legendLanguage);
  const hiddenMarkersComment = `<!-- MAP_MARKERS_DATA: ${JSON.stringify(markers)} -->`;
  const hiddenStudioComment = `<!-- MAP_STUDIO_DATA: ${JSON.stringify({ markers, floors, regions })} -->`;

  const newSectionContent = `## ${legendLanguage === 'en' ? 'Legend & Markers' : 'Legende & Marker'}\n\n${tableMarkdown}\n\n${hiddenMarkersComment}\n${hiddenStudioComment}`;

  // Match existing ## Legende & Marker section up to the next ## header or end of string
  const legendeRegex = /##\s+(?:Legende\s*&\s*Marker|Legend\s*&\s*Markers|Map\s*Markers|Karten-Markierungen)[\s\S]*?(?=\n##\s+|$)/i;

  if (legendeRegex.test(cleanContent)) {
    return cleanContent.replace(legendeRegex, newSectionContent).trim();
  } else {
    return `${cleanContent}\n\n${newSectionContent}`.trim();
  }
}

/**
 * Serialize a LoreEntity into an Obsidian Markdown string
 */
export function serializeToMarkdown(
  entity: LoreEntity,
  customImageUrl?: string,
  customGalleryUrls?: string[]
): string {
  const lines: string[] = [];
  lines.push('---');
  if (entity.id) {
    lines.push(`id: "${entity.id}"`);
  }
  lines.push(`type: ${entity.type}`);
  lines.push(`title: "${entity.title.replace(/"/g, '\\"')}"`);
  // Format lastModified as YYYY-MM-DD
  let dateStr = '';
  try {
    dateStr = new Date(entity.lastModified).toISOString().split('T')[0];
  } catch (e) {
    dateStr = new Date().toISOString().split('T')[0];
  }
  lines.push(`lastModified: ${dateStr}`);

  // Tags
  if (entity.tags && entity.tags.length > 0) {
    lines.push('tags:');
    entity.tags.forEach(tag => {
      lines.push(`  - ${tag}`);
    });
  }

  // Relations
  if (entity.relations && entity.relations.length > 0) {
    lines.push('relations:');
    entity.relations.forEach(rel => {
      lines.push(`  - "[[${rel.targetId.replace(/"/g, '\\"')}|${rel.type.replace(/"/g, '\\"')}: ${rel.targetId.replace(/"/g, '\\"')}]]"`);
    });
  }

  // Custom Fields as flat root properties for native Obsidian Properties editability
  if (entity.customFields && Object.keys(entity.customFields).length > 0) {
    const reserved = ['id', 'type', 'title', 'lastModified', 'isEncrypted', 'tags', 'relations', 'mapMarkers', 'imageUrl', 'cssclasses', 'cssclass'];
    Object.entries(entity.customFields).forEach(([key, val]) => {
      const safeKey = key.replace(/[:"']/g, '').trim();
      if (!reserved.includes(safeKey) && safeKey) {
        lines.push(`${safeKey}: "${val.replace(/"/g, '\\"')}"`);
      }
    });
  }

  // CSS classes for custom styling in Obsidian
  lines.push('cssclasses:');
  lines.push('  - dossier');
  lines.push(`  - dossier-${entity.type}`);
  if (entity.tags && entity.tags.length > 0) {
    const uniqueClasses = new Set<string>();
    entity.tags.forEach(tag => {
      const cleanTag = tag.toLowerCase().trim();
      if (['hero', 'antagonist', 'civilian', 'supporting'].includes(cleanTag)) {
        uniqueClasses.add(`  - dossier-${cleanTag}`);
        uniqueClasses.add(`  - dossier-${entity.type}-${cleanTag}`);
      }
    });
    uniqueClasses.forEach(cls => lines.push(cls));
  }

  // Image URL/base64 or custom relative path
  let finalImageUrl = customImageUrl !== undefined ? customImageUrl : entity.imageUrl;
  if (finalImageUrl) {
    lines.push(`imageUrl: "${fromVaultUrl(finalImageUrl)}"`);
  }

  lines.push('---');
  lines.push('');
  lines.push(`# ${entity.title}`);
  lines.push('');

  let bodyContent = entity.content || '';

  // An existing gallery heading keeps its spelling; only a new gallery follows the interface language
  const existingGalleryHeading = bodyContent.match(/###?\s+(Galerie|Gallery)\b/i);
  const galleryHeading = existingGalleryHeading
    ? (/^galerie$/i.test(existingGalleryHeading[1]) ? 'Galerie' : 'Gallery')
    : (generatedTextLanguage === 'en' ? 'Gallery' : 'Galerie');

  // Clean existing Galerie section from bodyContent to prevent duplication
  bodyContent = bodyContent.replace(/###?\s+(?:Galerie|Gallery)[\s\S]*?<!--\s*GALLERY_DATA:[\s\S]*?-->\s*/gi, '');
  bodyContent = bodyContent.replace(/###?\s+(?:Galerie|Gallery)(?:\s*!\[\[[^\]]+\]\]|\s*!\[.*?\]\([^)]+\))*\s*/gi, '');
  bodyContent = bodyContent.trim();

  // For map entities, ensure ## Legende & Marker table and MAP_MARKERS_DATA comment are updated
  if (entity.type === 'map') {
    bodyContent = updateMapContentWithMarkers(bodyContent, entity.mapMarkers || [], undefined, entity.mapFloors, entity.mapRegions);
  }

  // If we have a custom cover image URL (relative path), ensure it is embedded at top of body if not already present
  if (customImageUrl && !customImageUrl.startsWith('data:')) {
    const cleanCustomUrl = fromVaultUrl(customImageUrl);
    const filename = cleanCustomUrl.split('/').pop() || '';
    const imageEmbed = `![[${cleanCustomUrl}|400]]`;
    if (!bodyContent.includes(cleanCustomUrl) && !bodyContent.includes(filename)) {
      lines.push(imageEmbed);
      lines.push('');
    }
  }

  // Serialize visible Gallery section directly below main cover image
  const finalGallery = customGalleryUrls !== undefined ? customGalleryUrls : entity.galleryImageUrls;
  if (finalGallery && finalGallery.length > 0) {
    lines.push(`### ${galleryHeading}`);
    lines.push('');
    const galleryEmbeds: string[] = [];
    finalGallery.forEach((gUrl) => {
      if (!gUrl.startsWith('data:')) {
        const cleanGUrl = fromVaultUrl(gUrl);
        galleryEmbeds.push(`![[${cleanGUrl}|200]]`);
      }
    });

    for (let i = 0; i < galleryEmbeds.length; i += 3) {
      lines.push(galleryEmbeds.slice(i, i + 3).join(' '));
    }

    lines.push('');
    lines.push(`<!-- GALLERY_DATA: ${JSON.stringify(finalGallery)} -->`);
    lines.push('');
  }

  if (bodyContent) {
    lines.push(bodyContent);
  }

  return lines.join('\n');
}

/**
 * Parse an Obsidian Markdown file into a LoreEntity.
 * Uses a safe, simple hand-crafted YAML parser that processes frontmatter correctly.
 */
export function parseFromMarkdown(markdown: string, defaultId?: string): LoreEntity {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = normalized.match(frontmatterRegex);

  let yamlText = '';
  let bodyText = markdown;

  if (match) {
    yamlText = match[1];
    bodyText = match[2];
  }

  // Setup defaults
  let id = '';
  let title = 'Untitled Lore';
  let type: EntityType = 'lore';
  let lastModified = Date.now();
  let tags: string[] = [];
  let relations: Relation[] = [];
  let customFields: Record<string, string> = {};
  let mapMarkers: MapMarker[] = [];
  let imageUrl: string | undefined;

  // Try parsing title from Markdown body (e.g., # My Title)
  const titleHeaderMatch = bodyText.match(/^#\s+(.+)$/m);
  if (titleHeaderMatch) {
    title = titleHeaderMatch[1].trim();
  }

  // Simple, robust line-by-line frontmatter parser
  if (yamlText) {
    const lines = yamlText.split('\n');
    let currentKey = '';
    let inListKey = ''; // 'tags' | 'relations' | 'mapMarkers' | 'customFields' | ''
    let currentObject: any = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) continue;

      // Check indentation
      const indent = line.length - line.trimStart().length;

      if (indent === 0) {
        // Root YAML key
        inListKey = '';
        currentObject = null;
        const separatorIdx = trimmed.indexOf(':');
        if (separatorIdx !== -1) {
          const key = trimmed.substring(0, separatorIdx).trim();
          const value = trimmed.substring(separatorIdx + 1).trim();

          currentKey = key;
          
          const cleanVal = value.replace(/^["']|["']$/g, '').replace(/\\"/g, '"');

          if (key === 'id') {
            id = cleanVal;
          } else if (key === 'type') {
            type = cleanVal as EntityType;
          } else if (key === 'title') {
            title = cleanVal;
          } else if (key === 'lastModified') {
            const parsedNum = parseInt(cleanVal, 10);
            if (!isNaN(parsedNum) && parsedNum.toString() === cleanVal) {
              lastModified = parsedNum;
            } else {
              const parsedDate = Date.parse(cleanVal);
              lastModified = isNaN(parsedDate) ? Date.now() : parsedDate;
            }
          } else if (key === 'imageUrl') {
            imageUrl = cleanVal;
          } else if (key === 'isEncrypted') {
            // Legacy field from a removed feature — ignored, kept reserved so it
            // never leaks into customFields for older vault files.
          } else if (key === 'tags' && !value) {
            inListKey = 'tags';
          } else if (key === 'relations' && !value) {
            inListKey = 'relations';
          } else if (key === 'customFields' && !value) {
            inListKey = 'customFields';
          } else if (key === 'mapMarkers' && !value) {
            inListKey = 'mapMarkers';
          } else if ((key === 'cssclasses' || key === 'cssclass') && !value) {
            inListKey = 'cssclasses';
          } else {
            // Treat as flat custom field key-value if not a reserved key
            const reserved = ['id', 'type', 'title', 'lastModified', 'isEncrypted', 'tags', 'relations', 'mapMarkers', 'imageUrl', 'cssclasses', 'cssclass'];
            if (!reserved.includes(key) && key && value) {
              customFields[key] = cleanVal;
            }
          }
        }
      } else if (indent > 0) {
        // Child YAML field
        if (inListKey === 'tags' && trimmed.startsWith('-')) {
          const value = trimmed.substring(1).trim().replace(/^["']|["']$/g, '');
          if (value) tags.push(value);
        } else if (inListKey === 'relations') {
          if (trimmed.startsWith('-')) {
            const rest = trimmed.substring(1).trim().replace(/^["']|["']$/g, '');
            // Check if it's formatted as bracket link: [[targetId|alias]] or [[targetId]]
            const bracketMatch = rest.match(/^\[\[(.*?)\]\]$/);
            if (bracketMatch) {
              const inner = bracketMatch[1];
              const pipeIdx = inner.indexOf('|');
              if (pipeIdx !== -1) {
                const targetId = inner.substring(0, pipeIdx).trim();
                const alias = inner.substring(pipeIdx + 1).trim();
                // Check if alias contains type and target, e.g. "Organisation: sternenbande"
                const colonIdx = alias.indexOf(':');
                if (colonIdx !== -1) {
                  const relType = alias.substring(0, colonIdx).trim();
                  relations.push({
                    targetId,
                    type: relType
                  });
                } else {
                  relations.push({
                    targetId,
                    type: alias
                  });
                }
              } else {
                relations.push({
                  targetId: inner.trim(),
                  type: 'Associated'
                });
              }
              currentObject = null;
            } else if (rest.startsWith('targetId:') || rest.startsWith('type:')) {
              // Check if this is old-style inline, e.g. - targetId: "xyz" or - type: "abc"
              currentObject = {};
              relations.push(currentObject);
              parseKeyValue(rest, currentObject);
            } else {
              // New flat string style, e.g., "Friend: target-id"
              const colonIdx = rest.indexOf(':');
              if (colonIdx !== -1) {
                const relType = rest.substring(0, colonIdx).trim();
                const relTargetId = rest.substring(colonIdx + 1).trim();
                relations.push({
                  targetId: relTargetId,
                  type: relType
                });
                currentObject = null;
              } else {
                // Fallback for simple string item
                relations.push({
                  targetId: rest,
                  type: 'Associated'
                });
                currentObject = null;
              }
            }
          } else if (currentObject) {
            parseKeyValue(trimmed, currentObject);
          }
        } else if (inListKey === 'customFields') {
          const colonIdx = trimmed.indexOf(':');
          if (colonIdx !== -1) {
            const key = trimmed.substring(0, colonIdx).trim();
            const value = trimmed.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, '').replace(/\\"/g, '"');
            customFields[key] = value;
          }
        } else if (inListKey === 'mapMarkers') {
          if (trimmed.startsWith('-')) {
            currentObject = {};
            mapMarkers.push(currentObject);
            const rest = trimmed.substring(1).trim();
            parseKeyValue(rest, currentObject);
          } else {
            parseKeyValue(trimmed, currentObject);
          }
        }
      }
    }

    // Post-process list objects
    relations = relations.filter(r => r.targetId).map(r => ({
      targetId: r.targetId || '',
      type: r.type || 'Associated'
    }));

    mapMarkers = (mapMarkers as any[]).filter(m => m.id).map(m => ({
      id: m.id || Math.random().toString(36).substr(2, 9),
      x: typeof m.x === 'string' ? parseFloat(m.x) : (m.x || 50),
      y: typeof m.y === 'string' ? parseFloat(m.y) : (m.y || 50),
      label: m.label || 'Marker',
      targetEntityId: m.targetEntityId,
      description: m.description
    }));
  }

  let mapFloors: any[] | undefined = undefined;
  let mapRegions: any[] | undefined = undefined;
  let galleryImageUrls: string[] | undefined = undefined;

  // Check hidden comment for GALLERY_DATA
  const galleryCommentMatch = bodyText.match(/<!--\s*GALLERY_DATA:\s*([\s\S]*?)\s*-->/);
  if (galleryCommentMatch) {
    try {
      const parsed = JSON.parse(galleryCommentMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        galleryImageUrls = parsed;
      }
    } catch (e) {
      console.warn('Could not parse GALLERY_DATA comment:', e);
    }
  }

  // Fallback: extract gallery images from ### Galerie Markdown section if GALLERY_DATA was not present
  if (!galleryImageUrls || galleryImageUrls.length === 0) {
    const gallerySectionMatch = bodyText.match(/###?\s+(?:Galerie|Gallery)[\s\S]*?(?=\n#+|$)/i);
    if (gallerySectionMatch) {
      const sectionText = gallerySectionMatch[0];
      const extracted: string[] = [];
      const wikiImgRegex = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
      let imgM;
      while ((imgM = wikiImgRegex.exec(sectionText)) !== null) {
        extracted.push(imgM[1].trim());
      }
      const mdImgRegex = /!\[.*?\]\((.*?)\)/g;
      while ((imgM = mdImgRegex.exec(sectionText)) !== null) {
        extracted.push(imgM[1].trim());
      }
      if (extracted.length > 0) {
        galleryImageUrls = extracted;
      }
    }
  }

  // Fallback: extract cover imageUrl if missing from frontmatter
  if (!imageUrl) {
    const topImgMatch = bodyText.match(/^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/m) || bodyText.match(/^!\[.*?\]\((.*?)\)/m);
    if (topImgMatch) {
      imageUrl = topImgMatch[1].trim();
    }
  }

  // Check hidden body comments for map studio data: <!-- MAP_STUDIO_DATA: {...} --> or <!-- MAP_MARKERS_DATA: [...] -->
  if (type === 'map') {
    const studioMatch = bodyText.match(/<!--\s*MAP_STUDIO_DATA:\s*([\s\S]*?)\s*-->/);
    if (studioMatch) {
      try {
        const parsed = JSON.parse(studioMatch[1]);
        if (parsed.markers && Array.isArray(parsed.markers)) {
          mapMarkers = parsed.markers;
        }
        if (parsed.floors && Array.isArray(parsed.floors)) {
          mapFloors = parsed.floors;
        }
        if (parsed.regions && Array.isArray(parsed.regions)) {
          mapRegions = parsed.regions;
        }
      } catch (e) {
        console.warn('Could not parse MAP_STUDIO_DATA comment:', e);
      }
    }

    if (mapMarkers.length === 0) {
      const mapCommentMatch = bodyText.match(/<!--\s*(?:MAP_MARKERS_DATA|ZOOM_MAP_DATA):\s*([\s\S]*?)\s*-->/);
      if (mapCommentMatch) {
        try {
          const parsed = JSON.parse(mapCommentMatch[1]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            mapMarkers = parsed.map((m: any) => ({
              id: m.id || Math.random().toString(36).substr(2, 9),
              x: typeof m.x === 'string' ? parseFloat(m.x) : (m.x || 50),
              y: typeof m.y === 'string' ? parseFloat(m.y) : (m.y || 50),
              label: m.label || 'Marker',
              targetEntityId: m.targetEntityId,
              description: m.description,
              floorId: m.floorId
            }));
          }
        } catch (e) {
          console.warn('Could not parse map markers comment:', e);
        }
      }
    }
  }

  // Parse WikiLinks inside body text as automatic fallback/implicit relations
  // E.g., [[Gorgon Pass]] or [[gandalf-the-grey|Gandalf]]
  // Strip code blocks before extracting WikiLinks to avoid matching [[example]] in code
  const textWithoutCode = bodyText.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');

  const wikiLinkRegex = /(?:^|[^\!])\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let linkMatch;
  while ((linkMatch = wikiLinkRegex.exec(textWithoutCode)) !== null) {
    const rawTarget = linkMatch[1].trim();
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(rawTarget) || rawTarget.startsWith('assets/')) {
      continue;
    }
    const targetSlug = slugify(rawTarget);
    // Add implicit relation if not already explicitly modeled
    if (targetSlug && !relations.some(r => r.targetId === targetSlug)) {
      relations.push({
        targetId: targetSlug,
        type: 'Implicit Link'
      });
    }
  }

  // Clean the markdown body by removing title header, hidden metadata comments, Galerie block, and cover image embed
  let cleanBody = bodyText;
  if (titleHeaderMatch) {
    cleanBody = cleanBody.replace(/^#\s+.+$/m, '').trim();
  }
  cleanBody = cleanBody.replace(/###?\s+(?:Galerie|Gallery)[\s\S]*?<!--\s*GALLERY_DATA:[\s\S]*?-->\s*/gi, '');
  cleanBody = cleanBody.replace(/###?\s+(?:Galerie|Gallery)(?:\s*!\[\[[^\]]+\]\]|\s*!\[.*?\]\([^)]+\))*\s*/gi, '');
  cleanBody = cleanBody.replace(/<!--\s*GALLERY_DATA:[\s\S]*?-->/g, '');
  cleanBody = cleanBody.replace(/<!--\s*MAP_STUDIO_DATA:[\s\S]*?-->/g, '');
  cleanBody = cleanBody.replace(/<!--\s*MAP_MARKERS_DATA:[\s\S]*?-->/g, '');

  // Strip any accidental huge base64 image strings from the body text
  cleanBody = cleanBody.replace(/!\[.*?\]\(data:image\/[^;]+;base64,[^)]+\)/g, '');

  if (imageUrl) {
    const cleanFilename = imageUrl.split('/').pop() || '';
    cleanBody = cleanBody.replace(/^!\[\[[^\]]*\]\]\s*/m, (match) => {
      if (match.includes(cleanFilename) || match.includes(imageUrl!)) return '';
      return match;
    });
  }
  if (imageUrl) {
    imageUrl = toVaultUrl(imageUrl);
  }
  if (galleryImageUrls) {
    galleryImageUrls = galleryImageUrls.map(u => toVaultUrl(u));
  }

  // Rewrite markdown image syntax ![]() to use vault:// for relative assets
  cleanBody = cleanBody.replace(/!\[.*?\]\((?!http|data:)(.*?)\)/g, (match, path) => {
    return match.replace(path, toVaultUrl(path));
  });

  return {
    id: id || defaultId || slugify(title),
    title,
    type,
    content: cleanBody,
    tags,
    relations,
    customFields,
    mapMarkers: type === 'map' ? mapMarkers : undefined,
    mapFloors: type === 'map' ? mapFloors : undefined,
    mapRegions: type === 'map' ? mapRegions : undefined,
    imageUrl,
    galleryImageUrls,
    lastModified
  };
}

function parseKeyValue(str: string, obj: any) {
  if (!str || !obj) return;
  const parts = str.split(':');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join(':').trim().replace(/^["']|["']$/g, '').replace(/\\"/g, '"');
    obj[key] = val;
  }
}

export function inferTypeAndTemplateFromTitle(rawTitle: string, parentType?: EntityType): { type: EntityType; templateId?: string; cleanTitle: string } {
  let cleanTitle = rawTitle.trim();
  let type: EntityType = 'note';
  let templateId: string | undefined = 'note-template';

  // 1. Explicit syntax in link: [[chapter:Kapitel 01]] or [[note:Idee]]
  const prefixTypeMatch = cleanTitle.match(/^(chapter|book|character|relationship|item|map|power|lore|organization|place|scene|note|brainstorm|visual)[:=]\s*(.*)$/i);
  if (prefixTypeMatch) {
    const matchedType = prefixTypeMatch[1].toLowerCase() as EntityType;
    cleanTitle = prefixTypeMatch[2].trim().replace(/[:\\/]/g, ' -');
    type = matchedType;
    if (type === 'chapter') templateId = 'chapter-template';
    else if (type === 'book') templateId = 'book-template';
    else if (type === 'note') templateId = 'note-template';
    else if (type === 'scene') templateId = 'scene-template';
    else if (type === 'visual') templateId = cleanTitle.toLowerCase().includes('kostüm') || cleanTitle.toLowerCase().includes('costume') ? 'visual-costume-template' : 'visual-character-template';
    else if (type === 'place') templateId = 'place-template';
    else if (type === 'character') templateId = 'character-hero';
    else if (type === 'item') templateId = 'item-template';
    else if (type === 'power') templateId = 'power-template';
    else if (type === 'organization') templateId = 'organization-template';
    return { type, templateId, cleanTitle };
  }

  // Handle pipe syntax: [[type=chapter|Kapitel 01]]
  const pipeMatch = cleanTitle.match(/^type=([a-z]+)\|(.*)$/i);
  if (pipeMatch) {
    const matchedType = pipeMatch[1].toLowerCase() as EntityType;
    cleanTitle = pipeMatch[2].trim().replace(/[:\\/]/g, ' -');
    type = matchedType;
    if (type === 'chapter') templateId = 'chapter-template';
    else if (type === 'book') templateId = 'book-template';
    else if (type === 'note') templateId = 'note-template';
    else if (type === 'scene') templateId = 'scene-template';
    else if (type === 'visual') templateId = 'visual-character-template';
    return { type, templateId, cleanTitle };
  }

  // Replace colons/slashes in title to prevent Windows/filesystem issues
  cleanTitle = cleanTitle.replace(/[:\\/]/g, ' -').replace(/\s+/g, ' ').trim();

  const lower = cleanTitle.toLowerCase();

  // 2. Title Prefix Rules
  if (lower.startsWith('kapitel ') || lower.startsWith('chapter ') || /^kapitel\s*\d+/i.test(lower) || /^kap\.\s*\d+/i.test(lower)) {
    return { type: 'chapter', templateId: 'chapter-template', cleanTitle };
  }
  if (lower.startsWith('szene ') || lower.startsWith('scene ') || /^szene\s*\d+/i.test(lower)) {
    return { type: 'scene', templateId: 'scene-template', cleanTitle };
  }
  if (lower.startsWith('buch ') || lower.startsWith('book ')) {
    return { type: 'book', templateId: 'book-template', cleanTitle };
  }
  if (
    lower.startsWith('idee ') || lower.startsWith('idee – ') || lower.startsWith('idee - ') ||
    lower.startsWith('frage ') || lower.startsWith('notiz ') || lower.startsWith('arbeitsnotiz ') ||
    lower.startsWith('problem ') || lower.startsWith('recherche ') || lower.startsWith('entscheidung ') ||
    lower.startsWith('variante ') || lower.startsWith('erinnerung ')
  ) {
    return { type: 'note', templateId: 'note-template', cleanTitle };
  }
  if (lower.includes('kostüm') || lower.includes('kostuem') || lower.includes('costume')) {
    return { type: 'visual', templateId: 'visual-costume-template', cleanTitle };
  }
  if (lower.includes('visual') || lower.startsWith('visuell')) {
    return { type: 'visual', templateId: 'visual-character-template', cleanTitle };
  }
  if (lower.startsWith('ort ') || lower.startsWith('schauplatz ')) {
    return { type: 'place', templateId: 'place-template', cleanTitle };
  }
  if (lower.startsWith('figur ') || lower.startsWith('charakter ') || lower.startsWith('person ')) {
    return { type: 'character', templateId: 'character-hero', cleanTitle };
  }

  // 3. Parent Entity Context Rule
  if (parentType === 'book') {
    if (lower.includes('kapitel') || lower.includes('chapter') || /^\d+/.test(lower)) {
      return { type: 'chapter', templateId: 'chapter-template', cleanTitle };
    }
  } else if (parentType === 'chapter') {
    if (lower.includes('szene') || lower.includes('scene')) {
      return { type: 'scene', templateId: 'scene-template', cleanTitle };
    }
  } else if (parentType === 'character') {
    if (lower.includes('visual') || lower.includes('kostüm') || lower.includes('design')) {
      const isCostume = lower.includes('kostüm') || lower.includes('costume');
      return { type: 'visual', templateId: isCostume ? 'visual-costume-template' : 'visual-character-template', cleanTitle };
    }
  }

  return { type, templateId, cleanTitle };
}
