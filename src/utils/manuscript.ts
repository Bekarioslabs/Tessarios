/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { LoreEntity } from '../types';

export type StatusType = 'Entwurf' | 'In Bearbeitung' | 'In Überarbeitung' | 'Fertig';

type ManuscriptLanguage = 'de' | 'en';

/**
 * The four states the manuscript workspace works with are named in German internally
 * (they are what its dropdown submits), but what lands in a file is whatever the entry's
 * own template offers: "Completed" in an English vault, "Fertig" in a German one. Reading
 * therefore accepts both — and the template defaults "Planung"/"Planning" — instead of
 * only the German spelling, which left every English scene looking unfinished.
 */
const STATUS_ALIASES: Record<StatusType, { de: string[]; en: string[] }> = {
  'Entwurf': { de: ['entwurf', 'planung', 'geplant', 'pausiert'], en: ['draft', 'planning', 'paused'] },
  'In Bearbeitung': { de: ['in bearbeitung', 'aktiv'], en: ['in progress', 'active'] },
  'In Überarbeitung': { de: ['in überarbeitung', 'in ueberarbeitung'], en: ['revising', 'in revision'] },
  'Fertig': { de: ['fertig', 'abgeschlossen'], en: ['completed', 'done', 'finished'] },
};

const STATUS_STORED: Record<StatusType, Record<ManuscriptLanguage, string>> = {
  'Entwurf': { de: 'Entwurf', en: 'Draft' },
  'In Bearbeitung': { de: 'In Bearbeitung', en: 'In Progress' },
  'In Überarbeitung': { de: 'In Überarbeitung', en: 'Revising' },
  'Fertig': { de: 'Fertig', en: 'Completed' },
};

/** Maps any recognised spelling to the internal status. Empty or unknown means a draft. */
export function normalizeStatus(raw?: string | null): StatusType {
  const value = (raw || '').trim().toLowerCase();
  if (!value) return 'Entwurf';
  for (const status of Object.keys(STATUS_ALIASES) as StatusType[]) {
    const { de, en } = STATUS_ALIASES[status];
    if (de.includes(value) || en.includes(value)) return status;
  }
  return 'Entwurf';
}

function detectStatusLanguage(raw?: string | null): ManuscriptLanguage | null {
  const value = (raw || '').trim().toLowerCase();
  if (!value) return null;
  for (const status of Object.keys(STATUS_ALIASES) as StatusType[]) {
    if (STATUS_ALIASES[status].de.includes(value)) return 'de';
    if (STATUS_ALIASES[status].en.includes(value)) return 'en';
  }
  return null;
}

/** `[[Title]]` / `[[Title|Alias]]` to the plain title; anything else is returned trimmed. */
function unwrapLink(value?: string): string {
  if (!value) return '';
  const m = value.match(/\[\[(.*?)\]\]/);
  return (m ? m[1].split('|')[0] : value).trim();
}

/**
 * The spelling to write into a file. An entry that already carries a status keeps the
 * language it was written in, so a German vault opened in the English interface does not
 * start collecting English values that its own dropdown cannot show; only an entry
 * without one follows the interface language.
 */
export function statusValueFor(status: StatusType, uiLanguage: ManuscriptLanguage, existingRaw?: string | null): string {
  const language = detectStatusLanguage(existingRaw) ?? uiLanguage;
  return STATUS_STORED[status][language];
}

export interface ManuscriptSceneItem {
  id: string;
  title: string;
  chapterIndex: number; // 1-based
  sceneIndex: number;   // 1-based
  entity: LoreEntity;
  status: StatusType;
  wordCount: number;
}

export interface ManuscriptChapterItem {
  id: string;
  title: string;
  chapterIndex: number; // 1-based
  entity: LoreEntity;
  scenes: ManuscriptSceneItem[];
  status: StatusType;
  totalWordCount: number;
}

export interface ManuscriptBookItem {
  id: string;
  title: string;
  entity: LoreEntity;
  chapters: ManuscriptChapterItem[];
  status: StatusType;
  totalWordCount: number;
}

/**
 * Extract words belonging strictly to the manuscript section
 * (text after ## Manuskript or ## Manuscript, or full text if no header exists)
 */
export function extractManuscriptText(content: string | undefined): string {
  if (!content) return '';
  const regex = /(?:^|\n)#+\s*(?:manuskript|manuscript)\b/i;
  const match = content.match(regex);
  if (!match || match.index === undefined) {
    return content;
  }
  let extracted = content.slice(match.index + match[0].length);
  // Strip initial newlines immediately following the ## Manuskript header
  if (extracted.startsWith('\r\n\r\n')) extracted = extracted.slice(4);
  else if (extracted.startsWith('\r\n')) extracted = extracted.slice(2);
  else if (extracted.startsWith('\n\n')) extracted = extracted.slice(2);
  else if (extracted.startsWith('\n')) extracted = extracted.slice(1);
  return extracted;
}

/**
 * Update text under ## Manuskript in an entity's content string
 */
export function updateManuscriptText(fullContent: string | undefined, newText: string): string {
  const current = fullContent || '';
  const regex = /(?:^|\n)(#+\s*(?:manuskript|manuscript)\b)/i;
  const match = current.match(regex);
  
  if (!match || match.index === undefined) {
    // If no ## Manuskript header existed, append it cleanly
    const trimmed = current.trim();
    if (!trimmed) {
      return `## Manuskript\n\n${newText}`;
    }
    return `${trimmed}\n\n## Manuskript\n\n${newText}`;
  }

  const headerEnd = match.index + match[0].length;
  const beforeHeader = current.slice(0, headerEnd);
  return `${beforeHeader}\n\n${newText}`;
}

/**
 * Count words in text
 */
export function countWords(text: string | undefined): number {
  if (!text) return 0;
  const cleaned = extractManuscriptText(text);
  return cleaned.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Parse chapter and scene numbers from title string like "Szene_K01_S02" or "Kapitel 01"
 */
export function parseIndexesFromTitle(title: string): { kIndex?: number; sIndex?: number } {
  // Pattern: K01 or K1 or Kapitel 1 or Kap. 1 or Chapter 1
  const kMatch = title.match(/(?:K|Kapitel|Kap\.?|Chapter)\s*0*(\d+)/i);
  // Pattern: S02 or S2 or Szene 2 or Scene 2
  const sMatch = title.match(/(?:S|Szene|Scene)\s*0*(\d+)/i);

  const kIndex = kMatch ? parseInt(kMatch[1], 10) : undefined;
  const sIndex = sMatch ? parseInt(sMatch[1], 10) : undefined;

  return { kIndex, sIndex };
}

/**
 * Format scene title according to standard: Szene_K01_S01 [– optional custom name]
 */
export function formatSceneTitle(
  chapterIndex: number,
  sceneIndex: number,
  customSubTitle?: string,
  language: ManuscriptLanguage = 'de'
): string {
  const kPad = String(chapterIndex).padStart(2, '0');
  const sPad = String(sceneIndex).padStart(2, '0');
  const base = `${language === 'en' ? 'Scene' : 'Szene'}_K${kPad}_S${sPad}`;

  if (customSubTitle) {
    // Strip an existing numbered prefix in either language, so renumbering never stacks
    // "Szene_K01_S01 – Scene_K01_S01 – …"
    const cleanSub = customSubTitle.replace(/^(?:Szene|Scene)_K\d+_S\d+\s*[-–—]?\s*/i, '').trim();
    if (cleanSub) {
      return `${base} – ${cleanSub}`;
    }
  }
  return base;
}

/**
 * Format chapter title: Kapitel 01 / Chapter 01 [– optional custom name]
 */
export function formatChapterTitle(
  chapterIndex: number,
  customSubTitle?: string,
  language: ManuscriptLanguage = 'de'
): string {
  const kPad = String(chapterIndex).padStart(2, '0');
  const base = `${language === 'en' ? 'Chapter' : 'Kapitel'} ${kPad}`;
  if (customSubTitle) {
    // Also strips the bare "K01 –" form, which parseIndexesFromTitle accepts as a number.
    const cleanSub = customSubTitle.replace(/^(?:Kapitel|Kap\.?|Chapter|K)\s*0*\d+\s*[-–—]?\s*/i, '').trim();
    if (cleanSub) {
      return `${base} – ${cleanSub}`;
    }
  }
  return base;
}

/**
 * Calculate Chapter Status based on child scenes:
 * - If all scenes Fertig -> Fertig
 * - If all scenes Entwurf -> Entwurf
 * - Otherwise -> In Bearbeitung
 */
export function calculateChapterStatus(scenes: ManuscriptSceneItem[], currentEntityStatus?: string): StatusType {
  if (scenes.length === 0) {
    return normalizeStatus(currentEntityStatus);
  }
  const statuses = scenes.map(s => s.status);
  const allFertig = statuses.every(s => s === 'Fertig');
  if (allFertig) return 'Fertig';

  const allEntwurf = statuses.every(s => s === 'Entwurf');
  if (allEntwurf) return 'Entwurf';

  return 'In Bearbeitung';
}

/**
 * Calculate Book Status based on child chapters:
 * - If all chapters Fertig -> Fertig
 * - If all chapters Entwurf -> Entwurf
 * - Otherwise -> In Bearbeitung
 */
export function calculateBookStatus(chapters: ManuscriptChapterItem[], currentEntityStatus?: string): StatusType {
  if (chapters.length === 0) {
    return normalizeStatus(currentEntityStatus);
  }
  const statuses = chapters.map(c => c.status);
  const allFertig = statuses.every(s => s === 'Fertig');
  if (allFertig) return 'Fertig';

  const allEntwurf = statuses.every(s => s === 'Entwurf');
  if (allEntwurf) return 'Entwurf';

  return 'In Bearbeitung';
}

/**
 * Extract full manuscript hierarchy from all entities in vault
 */
export function getManuscriptHierarchy(entities: Record<string, LoreEntity>): ManuscriptBookItem[] {
  const books = Object.values(entities).filter(e => e.type === 'book');
  const chapters = Object.values(entities).filter(e => e.type === 'chapter');
  const scenes = Object.values(entities).filter(e => e.type === 'scene');

  // If no book entity exists, create a virtual/fallback book wrapper if there are chapters or scenes
  let bookEntities = books;
  if (bookEntities.length === 0 && (chapters.length > 0 || scenes.length > 0)) {
    bookEntities = [{
      id: 'default-book',
      title: 'Hauptbuch',
      type: 'book',
      content: '',
      tags: [],
      relations: [],
      lastModified: Date.now(),
      customFields: { 'Status': 'In Bearbeitung' }
    }];
  }

  return bookEntities.map(bookEntity => {
    // Find chapters belonging to this book
    let bookChapters = chapters.filter(c => {
      if (books.length <= 1) return true; // Single book case
      const parentBookRel = c.relations?.find(r => r.targetId === bookEntity.id || r.type?.toLowerCase().includes('buch'));
      const parentBookField = unwrapLink(c.customFields?.['Buch'] || c.customFields?.['Book']);
      return !!parentBookRel || parentBookField === bookEntity.id || parentBookField === bookEntity.title;
    });

    // Sort chapters by chapter index K01, K02 or custom field order
    bookChapters.sort((a, b) => {
      const idxA = parseIndexesFromTitle(a.title).kIndex ?? 999;
      const idxB = parseIndexesFromTitle(b.title).kIndex ?? 999;
      if (idxA !== idxB) return idxA - idxB;
      return a.title.localeCompare(b.title, 'de');
    });

    const chapterItems: ManuscriptChapterItem[] = bookChapters.map((chEntity, chIdx) => {
      const chapterNumber = parseIndexesFromTitle(chEntity.title).kIndex || (chIdx + 1);

      // Find scenes belonging to this chapter
      const chScenes = scenes.filter(sc => {
        // 1. Direct relation
        const relMatch = sc.relations?.some(r => r.targetId === chEntity.id);
        // 2. Custom field
        const chapterField = unwrapLink(sc.customFields?.['Kapitel'] ?? sc.customFields?.['Chapter']);
        const fieldMatch = chapterField === chEntity.id || chapterField === chEntity.title;
        // 3. Title pattern matching K01
        const parsed = parseIndexesFromTitle(sc.title);
        const titleMatch = parsed.kIndex === chapterNumber;

        return relMatch || fieldMatch || (titleMatch && (books.length <= 1 || sc.relations?.some(r => r.targetId === chEntity.id)));
      });

      // Sort scenes by scene index S01, S02...
      chScenes.sort((a, b) => {
        const idxA = parseIndexesFromTitle(a.title).sIndex ?? 999;
        const idxB = parseIndexesFromTitle(b.title).sIndex ?? 999;
        if (idxA !== idxB) return idxA - idxB;
        return a.title.localeCompare(b.title, 'de');
      });

      const sceneItems: ManuscriptSceneItem[] = chScenes.map((scEntity, scIdx) => {
        const sNumber = parseIndexesFromTitle(scEntity.title).sIndex || (scIdx + 1);
        const wordCnt = countWords(scEntity.content);
        const status = normalizeStatus(scEntity.customFields?.['Status']);

        return {
          id: scEntity.id,
          title: scEntity.title,
          chapterIndex: chapterNumber,
          sceneIndex: sNumber,
          entity: scEntity,
          status,
          wordCount: wordCnt
        };
      });

      const chapterWordCount = sceneItems.reduce((acc, s) => acc + s.wordCount, 0) + countWords(chEntity.content);
      const calculatedChStatus = calculateChapterStatus(sceneItems, chEntity.customFields?.['Status']);

      return {
        id: chEntity.id,
        title: chEntity.title,
        chapterIndex: chapterNumber,
        entity: chEntity,
        scenes: sceneItems,
        status: calculatedChStatus,
        totalWordCount: chapterWordCount
      };
    });

    const bookTotalWords = chapterItems.reduce((acc, c) => acc + c.totalWordCount, 0) + countWords(bookEntity.content);
    const calculatedBkStatus = calculateBookStatus(chapterItems, bookEntity.customFields?.['Status']);

    return {
      id: bookEntity.id,
      title: bookEntity.title,
      entity: bookEntity,
      chapters: chapterItems,
      status: calculatedBkStatus,
      totalWordCount: bookTotalWords
    };
  });
}

/** The field a scene already uses for its chapter, else the one the interface language implies. */
function chapterKeyFor(scene: LoreEntity, language: ManuscriptLanguage): string {
  if (scene.customFields && 'Kapitel' in scene.customFields) return 'Kapitel';
  if (scene.customFields && 'Chapter' in scene.customFields) return 'Chapter';
  return language === 'en' ? 'Chapter' : 'Kapitel';
}

function chapterNumberKeyFor(chapter: LoreEntity, language: ManuscriptLanguage): string {
  if (chapter.customFields && 'Kapitelnummer' in chapter.customFields) return 'Kapitelnummer';
  if (chapter.customFields && 'ChapterNumber' in chapter.customFields) return 'ChapterNumber';
  return language === 'en' ? 'ChapterNumber' : 'Kapitelnummer';
}

/**
 * Reorders scenes inside a chapter and automatically renames them according to Szene_KXX_SYY convention
 */
export function reorderScenesAndRename(
  entities: Record<string, LoreEntity>,
  chapterId: string,
  reorderedSceneIds: string[],
  language: ManuscriptLanguage = 'de'
): Record<string, LoreEntity> {
  const updated = { ...entities };
  const chapterEntity = updated[chapterId];
  if (!chapterEntity) return updated;

  const chIndex = parseIndexesFromTitle(chapterEntity.title).kIndex || 1;

  reorderedSceneIds.forEach((sId, index) => {
    const scEntity = updated[sId];
    if (!scEntity) return;

    const newSceneNumber = index + 1;
    const newTitle = formatSceneTitle(chIndex, newSceneNumber, scEntity.title, language);

    // Update relations
    let relations = scEntity.relations ? [...scEntity.relations] : [];
    if (!relations.some(r => r.targetId === chapterId)) {
      relations.push({ targetId: chapterId, type: language === 'en' ? 'In Chapter' : 'In Kapitel' });
    }

    updated[sId] = {
      ...scEntity,
      title: newTitle,
      relations,
      customFields: {
        ...scEntity.customFields,
        // Keep the key the entry already uses; a new one follows the interface language.
        [chapterKeyFor(scEntity, language)]: chapterEntity.title,
        'Position': String(newSceneNumber)
      },
      lastModified: Date.now()
    };
  });

  return updated;
}

/**
 * Reorder chapters inside a book and update chapter names and all child scene names (K01 -> K02 etc.)
 */
export function reorderChaptersAndRename(
  entities: Record<string, LoreEntity>,
  bookId: string,
  reorderedChapterIds: string[],
  language: ManuscriptLanguage = 'de'
): Record<string, LoreEntity> {
  let updated = { ...entities };

  reorderedChapterIds.forEach((chId, index) => {
    const chEntity = updated[chId];
    if (!chEntity) return;

    const newChIndex = index + 1;
    const newChTitle = formatChapterTitle(newChIndex, chEntity.title, language);

    // Update chapter entity title
    updated[chId] = {
      ...chEntity,
      title: newChTitle,
      customFields: {
        ...chEntity.customFields,
        [chapterNumberKeyFor(chEntity, language)]: String(newChIndex)
      },
      lastModified: Date.now()
    };

    // Find scenes under this chapter and update their K-index to newChIndex
    const childSceneIds = Object.values(updated)
      .filter(e => e.type === 'scene' && (
        e.relations?.some(r => r.targetId === chId) ||
        unwrapLink(e.customFields?.['Kapitel'] ?? e.customFields?.['Chapter']) === chEntity.title ||
        unwrapLink(e.customFields?.['Kapitel'] ?? e.customFields?.['Chapter']) === chId
      ))
      .sort((a, b) => {
        const idxA = parseIndexesFromTitle(a.title).sIndex ?? 999;
        const idxB = parseIndexesFromTitle(b.title).sIndex ?? 999;
        return idxA - idxB;
      })
      .map(s => s.id);

    updated = reorderScenesAndRename(updated, chId, childSceneIds, language);
  });

  return updated;
}

