/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState } from 'react';
import { LoreEntity, LooseMediaAsset, EntityType } from '../types';
import { slugify } from '../utils/markdown';
import { getTypeTranslation, Language } from '../utils/i18n';
import { getTypeIcon, getTypeColor } from './EntityTypeBadge';
import { BaseModal } from './BaseModal';
import { Plus } from 'lucide-react';

type CellAlign = 'left' | 'center' | 'right';

interface ParsedTable {
  header: string[];
  align: CellAlign[];
  rows: string[][];
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * Recognises a GitHub-style table block: a header row, a |---|:---:|---:| separator that
 * also carries the column alignment, then any number of data rows. Returns null if the
 * block isn't a table, so the caller can fall through to its other block handlers.
 */
function parseTable(lines: string[]): ParsedTable | null {
  if (lines.length < 2) return null;
  if (!lines[0].includes('|')) return null;

  const separator = lines[1].trim();
  if (!/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(separator)) return null;

  const header = splitTableRow(lines[0]);
  const align: CellAlign[] = splitTableRow(lines[1]).map((spec) => {
    const left = spec.startsWith(':');
    const right = spec.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });

  const rows = lines.slice(2).filter((l) => l.trim()).map(splitTableRow);
  return { header, align, rows };
}

function alignClass(align: CellAlign | undefined): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

/**
 * Flips the nth checkbox in the raw markdown. Indexed by order of appearance rather than
 * by line/paragraph position so it stays correct regardless of how the block splitter
 * grouped things, and so identical task text isn't ambiguous.
 */
export function toggleCheckboxInMarkdown(content: string, occurrence: number, checked: boolean): string {
  let seen = -1;
  return content.replace(/^([ \t]*[-*][ \t]+)\[([ xX])\]/gm, (full, prefix: string) => {
    seen++;
    return seen === occurrence ? `${prefix}[${checked ? 'x' : ' '}]` : full;
  });
}

interface WikiTextRendererProps {
  content: string;
  entities?: Record<string, LoreEntity>;
  looseMedia?: Record<string, LooseMediaAsset>;
  onSelectEntity?: (id: string) => void;
  onAddEntity?: (type: any, title: string, parentId?: string, templateId?: string) => void;
  language?: Language;
  className?: string;
  /** Supplying this makes rendered checkboxes clickable — they write the flipped
   *  state back into the markdown. Omit it to keep them read-only. */
  onContentChange?: (newContent: string) => void;
}

export const WikiTextRenderer: React.FC<WikiTextRendererProps> = ({
  content,
  entities = {},
  looseMedia = {},
  onSelectEntity,
  onAddEntity,
  language = 'de',
  className = '',
  onContentChange,
}) => {
  const [pendingCreateTitle, setPendingCreateTitle] = useState<string | null>(null);

  // Running index of checkboxes across the whole document, assigned in render order so it
  // matches toggleCheckboxInMarkdown's counting. Reset per render (rendering is
  // synchronous top-to-bottom, so the numbering is stable).
  let checkboxIndex = -1;

  if (!content || !content.trim()) {
    return <p className="text-ink-faint italic text-xs sm:text-sm">{language === 'en' ? 'No text yet.' : 'Kein Text vorhanden.'}</p>;
  }

  const allEntities = Object.values(entities) as LoreEntity[];
  const allLooseMedia = Object.values(looseMedia || {}) as LooseMediaAsset[];

  // Find entity by slug or exact title match
  const findEntity = (targetRaw: string): LoreEntity | undefined => {
    const rawTrimmed = targetRaw.trim();
    const slug = slugify(rawTrimmed);
    const lower = rawTrimmed.toLowerCase();

    // Direct key lookup
    if (entities[slug]) return entities[slug];
    if (entities[rawTrimmed]) return entities[rawTrimmed];

    // Search values by title or id
    return allEntities.find(
      (e) => e.id === slug || e.id === rawTrimmed || e.title.toLowerCase() === lower
    );
  };

  // Find image source across entities, looseMedia, or direct URL
  const findImageSrc = (targetRaw: string): string => {
    const rawTrimmed = targetRaw.trim();
    if (!rawTrimmed) return '';

    const slug = slugify(rawTrimmed);
    const lower = rawTrimmed.toLowerCase();

    // 1. Entity main image
    const targetEntity = findEntity(rawTrimmed);
    if (targetEntity?.imageUrl) return targetEntity.imageUrl;

    // 2. Loose Media lookup
    const looseMatch =
      looseMedia[slug] ||
      looseMedia[rawTrimmed] ||
      allLooseMedia.find(
        (m) => m.id === slug || m.id === rawTrimmed || m.title.toLowerCase() === lower
      );
    if (looseMatch?.imageUrl) return looseMatch.imageUrl;

    // 3. Direct URL / Base64
    if (rawTrimmed.startsWith('http') || rawTrimmed.startsWith('data:')) {
      return rawTrimmed;
    }

    return '';
  };

  // Inline token grammar. Named groups rather than numbered ones: the alternatives are
  // order-sensitive (![[ before ![ before [[ before [), and positional indices silently
  // shift whenever an alternative is added, which is how earlier edits broke.
  const INLINE_PATTERN = [
    /!\[\[(?<wikiImg>[^\]|]+)(?:\|(?<wikiImgOpt>[^\]]+))?\]\]/,   // ![[image|opt]]
    /!\[(?<imgAlt>[^\]]*)\]\((?<imgUrl>[^)]+)\)/,                 // ![alt](url)
    /\[\[(?<wikiTarget>[^\]|]+)(?:\|(?<wikiDisplay>[^\]]+))?\]\]/, // [[target|display]]
    /\[\^(?<fnRef>[^\]]+)\]/,                                     // [^1] footnote marker
    /\[(?<linkText>[^\]]+)\]\((?<linkUrl>[^)]+)\)/,               // [text](url)
    /==(?<highlight>[^=]+)==/,
    /~~(?<strike>[^~]+)~~/,
    /`(?<code>[^`]+)`/,
    /\*\*(?<bold>[^*]+)\*\*/,
    /\*(?<italic>[^*]+)\*/,
  ].map((r) => r.source).join('|');

  const renderInlineText = (text: string): React.ReactNode[] => {
    const inlineRegex = new RegExp(INLINE_PATTERN, 'g');

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = inlineRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.substring(lastIndex, match.index));
      }

      const g = (match.groups || {}) as Record<string, string | undefined>;
      const key = `${match.index}`;

      if (g.wikiImg !== undefined) {
        // WikiLink Image ![[ref|opt]]
        const refRaw = g.wikiImg.trim();
        const src = findImageSrc(refRaw);

        if (src) {
          nodes.push(
            <span key={`wiki-img-${key}`} className="my-3 flex justify-center w-full">
              <img
                src={src}
                alt={refRaw}
                className="rounded-xl max-h-80 object-contain border border-line shadow-xl"
                referrerPolicy="no-referrer"
              />
            </span>
          );
        } else {
          nodes.push(
            <span key={`wiki-img-ph-${key}`} className="inline-block my-1 px-2 py-1 bg-surface-control border border-dashed border-line rounded text-ink-muted font-mono text-xs">
              🖼️ [{refRaw}]
            </span>
          );
        }
      } else if (g.imgUrl !== undefined) {
        // Standard Image ![alt](url)
        const alt = g.imgAlt || '';
        const urlRaw = g.imgUrl.trim();
        const src = findImageSrc(urlRaw);

        if (src) {
          nodes.push(
            <span key={`img-${key}`} className="my-3 flex justify-center w-full">
              <img
                src={src}
                alt={alt || (language === 'en' ? 'Image' : 'Bild')}
                className="rounded-xl max-h-80 object-contain border border-line shadow-xl"
                referrerPolicy="no-referrer"
              />
            </span>
          );
        } else {
          nodes.push(
            <span key={`img-ph-${key}`} className="inline-block my-1 px-2 py-1 bg-surface-control border border-dashed border-line rounded text-ink-muted font-mono text-xs">
              🖼️ [{alt || urlRaw}]
            </span>
          );
        }
      } else if (g.wikiTarget !== undefined) {
        // WikiLink [[target|display]]
        const targetRaw = g.wikiTarget.trim();
        const displayRaw = g.wikiDisplay ? g.wikiDisplay.trim() : targetRaw;

        const targetEntity = findEntity(targetRaw);
        const exists = !!targetEntity;

        nodes.push(
          <button
            key={`wiki-${key}`}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (targetEntity && onSelectEntity) {
                onSelectEntity(targetEntity.id);
              } else if (!targetEntity && onAddEntity) {
                setPendingCreateTitle(targetRaw);
              }
            }}
            className={`inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 my-0.5 rounded cursor-pointer transition font-medium align-middle wikilink-btn ${
              exists
                ? 'wikilink-exists bg-indigo-950/70 text-indigo-300 border border-indigo-800/80 hover:bg-indigo-600 hover:text-white shadow-sm'
                : 'wikilink-missing bg-surface-control/90 text-ink-secondary border border-line hover:border-indigo-700 hover:text-indigo-300 border-dashed'
            }`}
            title={exists
              ? (language === 'en' ? `Open entry: "${targetEntity.title}"` : `Öffne Eintrag: "${targetEntity.title}"`)
              : (language === 'en' ? `Click to create "${targetRaw}"` : `Klicken um "${targetRaw}" neu zu erstellen`)}
          >
            <span>[[{displayRaw}]]</span>
          </button>
        );
      } else if (g.fnRef !== undefined) {
        // Footnote marker [^1] — links down to the matching definition block
        const ref = g.fnRef.trim();
        nodes.push(
          <sup key={`fn-${key}`} className="text-[9px] font-mono text-indigo-400 align-super ml-0.5">
            <a href={`#fn-${slugify(ref)}`} className="hover:underline cursor-pointer">[{ref}]</a>
          </sup>
        );
      } else if (g.linkUrl !== undefined) {
        // Standard link [text](url)
        const label = (g.linkText || '').trim();
        const url = g.linkUrl.trim();
        const isExternal = /^(https?:)?\/\//i.test(url) || url.startsWith('mailto:');
        nodes.push(
          <a
            key={`link-${key}`}
            href={url}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 decoration-indigo-700/70 break-words"
          >
            {label || url}
          </a>
        );
      } else if (g.highlight !== undefined) {
        nodes.push(
          <mark key={`hl-${key}`} className="bg-amber-500/30 text-amber-200 px-1 py-0.5 rounded border border-amber-500/40 font-mono text-xs font-medium">
            {g.highlight}
          </mark>
        );
      } else if (g.strike !== undefined) {
        nodes.push(
          <del key={`del-${key}`} className="line-through text-ink-muted font-mono text-xs">
            {g.strike}
          </del>
        );
      } else if (g.code !== undefined) {
        nodes.push(
          <code key={`code-${key}`} className="bg-surface-control text-ink-bright px-1.5 py-0.5 rounded border border-line font-mono text-xs">
            {g.code}
          </code>
        );
      } else if (g.bold !== undefined) {
        nodes.push(
          <strong key={`bold-${key}`} className="font-bold text-ink-heading">
            {g.bold}
          </strong>
        );
      } else if (g.italic !== undefined) {
        nodes.push(
          <em key={`italic-${key}`} className="italic text-ink">
            {g.italic}
          </em>
        );
      }

      lastIndex = inlineRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      nodes.push(text.substring(lastIndex));
    }

    return nodes;
  };

  // Split content by paragraphs
  const paragraphs = content.split(/\r?\n\r?\n/);

  return (
    <div className={`space-y-3 max-w-full break-words overflow-wrap-break-word ${className}`}>
      {paragraphs.map((paragraph, pIdx) => {
        const trimmed = paragraph.trim();
        if (!trimmed) return null;

        // Code block ```lang ... ```
        if (trimmed.startsWith('```')) {
          const lines = trimmed.split(/\r?\n/);
          const lang = lines[0].replace(/^```/, '').trim();
          const code = lines.slice(1, lines.length - (lines[lines.length - 1].startsWith('```') ? 1 : 0)).join('\n');
          return (
            <div key={pIdx} className="my-3 p-3 bg-surface-base border border-line rounded-xl overflow-x-auto text-xs font-mono text-emerald-400 leading-relaxed shadow-lg">
              {lang && <span className="block text-[9px] font-mono font-bold text-ink-muted uppercase mb-1 border-b border-line pb-1">{lang}</span>}
              <pre className="whitespace-pre"><code>{code}</code></pre>
            </div>
          );
        }

        // Headings # Heading
        if (/^#{1,6}\s+/.test(trimmed)) {
          const level = trimmed.match(/^#{1,6}/)![0].length;
          const text = trimmed.replace(/^#{1,6}\s+/, '');
          const nodeContent = renderInlineText(text);

          if (level === 1) {
            return (
              <h1 key={pIdx} className="text-xl sm:text-2xl font-bold text-heading-blue tracking-tight border-b border-line/80 pb-2 mt-4 mb-2">
                {nodeContent}
              </h1>
            );
          }
          if (level === 2) {
            return (
              <h2 key={pIdx} className="text-lg sm:text-xl font-bold text-heading-blue tracking-tight mt-4 mb-2">
                {nodeContent}
              </h2>
            );
          }
          if (level === 3) {
            return (
              <h3 key={pIdx} className="text-base sm:text-lg font-semibold text-heading-blue mt-3 mb-1">
                {nodeContent}
              </h3>
            );
          }
          if (level === 4) {
            return (
              <h4 key={pIdx} className="text-sm sm:text-base font-semibold text-heading-blue/90 mt-3 mb-1">
                {nodeContent}
              </h4>
            );
          }
          if (level === 5) {
            return (
              <h5 key={pIdx} className="text-xs sm:text-sm font-semibold text-ink uppercase tracking-wide mt-2 mb-1">
                {nodeContent}
              </h5>
            );
          }
          return (
            <h6 key={pIdx} className="text-[11px] sm:text-xs font-semibold text-ink-secondary uppercase tracking-wider mt-2 mb-1">
              {nodeContent}
            </h6>
          );
        }

        // Horizontal rule (---, ***, ___)
        if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
          return <hr key={pIdx} className="my-5 border-0 border-t border-line" />;
        }

        // Callout (> [!type] Title)
        if (trimmed.startsWith('>')) {
          const lines = trimmed.split(/\r?\n/);
          const firstLine = lines[0].replace(/^>\s*/, '');
          const bodyLines = lines.slice(1).map((l) => l.replace(/^>\s*/, '')).join('\n');

          const calloutMatch = firstLine.match(/^\[!(note|warning|tip|quote|danger|info|bug|example|question)\]\s*(.*)/i);
          let type = 'note';
          let title = '';
          // A plain "> quote" has no type marker, so its first line is body text, not a
          // heading. Previously it was used as BOTH title and body, printing it twice.
          let body = bodyLines;
          if (calloutMatch) {
            type = calloutMatch[1].toLowerCase();
            title = calloutMatch[2] || type.toUpperCase();
          } else {
            body = lines.map((l) => l.replace(/^>\s?/, '')).join('\n');
          }

          let style = 'bg-indigo-950/40 border-indigo-800/80 text-indigo-200';
          if (type === 'warning' || type === 'danger') style = 'bg-amber-950/40 border-amber-800/80 text-amber-200';
          if (type === 'tip') style = 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200';
          if (type === 'quote') style = 'bg-purple-950/40 border-purple-800/80 text-purple-200';
          if (type === 'bug') style = 'bg-rose-950/40 border-rose-800/80 text-rose-200';
          if (type === 'example') style = 'bg-cyan-950/40 border-cyan-800/80 text-cyan-200';

          return (
            <div key={pIdx} className={`p-3.5 rounded-xl border ${style} my-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words max-w-full shadow-md`}>
              {title && <div className="font-bold font-mono text-xs mb-1 uppercase tracking-wider">{title}</div>}
              <div>{renderInlineText(body)}</div>
            </div>
          );
        }

        const lines = trimmed.split(/\r?\n/);

        // Markdown table: a header row, a |---|---| separator, then data rows.
        const table = parseTable(lines);
        if (table) {
          return (
            <div key={pIdx} className="my-3 overflow-x-auto rounded-xl border border-line shadow-md">
              <table className="w-full border-collapse text-xs sm:text-sm font-sans">
                <thead>
                  <tr className="bg-surface-elevated">
                    {table.header.map((cell, cIdx) => (
                      <th
                        key={cIdx}
                        className={`px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-ink border-b border-line ${alignClass(table.align[cIdx])}`}
                      >
                        {renderInlineText(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="odd:bg-surface-card even:bg-surface-base hover:bg-indigo-950/20 transition">
                      {table.header.map((_, cIdx) => (
                        <td
                          key={cIdx}
                          className={`px-3 py-2 text-ink border-b border-line/60 align-top ${alignClass(table.align[cIdx])}`}
                        >
                          {renderInlineText(row[cIdx] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Footnote definitions ([^1]: explanation)
        if (lines.every((line) => /^\s*\[\^[^\]]+\]:/.test(line))) {
          return (
            <div key={pIdx} className="my-3 pt-2 border-t border-line/80 flex flex-col gap-1">
              {lines.map((line, lIdx) => {
                const m = line.match(/^\s*\[\^([^\]]+)\]:\s*(.*)$/);
                if (!m) return null;
                return (
                  <div key={lIdx} id={`fn-${slugify(m[1].trim())}`} className="text-[11px] font-sans text-ink-secondary leading-relaxed flex gap-2">
                    <span className="font-mono text-indigo-400 shrink-0">[{m[1].trim()}]</span>
                    <span>{renderInlineText(m[2])}</span>
                  </div>
                );
              })}
            </div>
          );
        }

        // Bullet lists, ordered lists or checkbox lists
        const isList = lines.every((line) => /^\s*(?:[-*]|\d+\.)\s+/.test(line));

        if (isList) {
          // Numbered only if every line is numbered — a mixed block stays a bullet list
          // rather than silently renumbering the dashes.
          const isOrdered = lines.every((line) => /^\s*\d+\.\s+/.test(line));
          const ListTag = isOrdered ? 'ol' : 'ul';
          return (
            <ListTag key={pIdx} className={`space-y-1.5 my-2 ${isOrdered ? 'list-decimal ml-6' : ''}`}>
              {lines.map((line, lIdx) => {
                const cbMatch = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
                if (cbMatch) {
                  const checked = cbMatch[1].toLowerCase() === 'x';
                  const label = cbMatch[2];
                  const myIndex = ++checkboxIndex;
                  const interactive = !!onContentChange;
                  return (
                    <li key={lIdx} className="flex items-center gap-2 text-xs sm:text-sm font-sans text-ink list-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly={!interactive}
                        onChange={
                          interactive
                            ? () => onContentChange(toggleCheckboxInMarkdown(content, myIndex, !checked))
                            : undefined
                        }
                        className={`rounded border-line-strong text-indigo-600 focus:ring-0 ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
                      />
                      <span className={checked ? 'line-through text-ink-muted' : 'text-ink-bright'}>{renderInlineText(label)}</span>
                    </li>
                  );
                }

                const bulletMatch = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
                const itemContent = bulletMatch ? bulletMatch[1] : line;
                return (
                  <li
                    key={lIdx}
                    className={`text-xs sm:text-sm font-sans text-ink my-0.5 leading-relaxed ${isOrdered ? '' : 'ml-4 list-disc'}`}
                  >
                    {renderInlineText(itemContent)}
                  </li>
                );
              })}
            </ListTag>
          );
        }

        // Standard Paragraph
        return (
          <p key={pIdx} className="whitespace-pre-wrap break-words max-w-full text-ink text-xs sm:text-sm leading-relaxed font-sans">
            {renderInlineText(trimmed)}
          </p>
        );
      })}

      {/* Category Picker Modal when clicking an unlinked WikiLink */}
      {pendingCreateTitle && (
        <BaseModal
          isOpen={!!pendingCreateTitle}
          onClose={() => setPendingCreateTitle(null)}
          icon={<Plus className="h-4 w-4" />}
          title={`${language === 'en' ? 'Create New Entity:' : 'Neuen Eintrag schmieden:'} "${pendingCreateTitle}"`}
          maxWidth="md"
        >
          <div className="flex flex-col gap-4 font-mono text-xs">
            <p className="text-ink-secondary">
              {language === 'en'
                ? 'Select category for this entry:'
                : 'Wähle die Kategorie, in der diese Datei erstellt werden soll:'}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
              {[
                { type: 'character' as EntityType, descDe: 'Personen & Helden', descEn: 'Characters, NPCs' },
                { type: 'place' as EntityType, descDe: 'Orte, Städte, Welten', descEn: 'Locations, cities' },
                { type: 'storyline' as EntityType, descDe: 'Handlungsstränge', descEn: 'Storylines' },
                { type: 'book' as EntityType, descDe: 'Bücher, Bände, Werke', descEn: 'Books, works' },
                { type: 'chapter' as EntityType, descDe: 'Kapitel', descEn: 'Chapters' },
                { type: 'scene' as EntityType, descDe: 'Szenen, Abschnitte', descEn: 'Scenes' },
                { type: 'lore' as EntityType, descDe: 'Mythos, Magie, Gesetze', descEn: 'Lore, magic, rules' },
                { type: 'item' as EntityType, descDe: 'Objekte & Artefakte', descEn: 'Items, artifacts' },
                { type: 'organization' as EntityType, descDe: 'Fraktionen, Bündnisse', descEn: 'Factions, guilds' },
                { type: 'power' as EntityType, descDe: 'Kräfte, Zauber, Skills', descEn: 'Spells, abilities' },
                { type: 'map' as EntityType, descDe: 'Karten, Regionen', descEn: 'Maps, regions' },
                { type: 'brainstorm' as EntityType, descDe: 'Ideen & Konzepte', descEn: 'Ideas & concepts' },
                { type: 'note' as EntityType, descDe: 'Notizen, Memos', descEn: 'Notes & memos' },
                { type: 'relationship' as EntityType, descDe: 'Beziehungen', descEn: 'Relationships' },
                { type: 'visual' as EntityType, descDe: 'Visuelles & Medien', descEn: 'Visuals & media' },
              ].map((cat) => {
                const colorClass = getTypeColor(cat.type);
                return (
                  <button
                    key={cat.type}
                    type="button"
                    onClick={() => {
                      if (onAddEntity && pendingCreateTitle) {
                        onAddEntity(cat.type, pendingCreateTitle);
                        const targetSlug = slugify(pendingCreateTitle);
                        if (onSelectEntity) {
                          setTimeout(() => onSelectEntity(targetSlug), 50);
                        }
                      }
                      setPendingCreateTitle(null);
                    }}
                    className="p-2.5 rounded-xl bg-surface-card hover:bg-indigo-950/80 border border-line/80 hover:border-indigo-600/80 text-left transition cursor-pointer flex items-center gap-2.5 group"
                  >
                    <span className={`p-1.5 rounded-lg border flex-shrink-0 ${colorClass}`}>
                      {getTypeIcon(cat.type, "h-4 w-4")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block text-xs font-mono font-bold text-ink-bright group-hover:text-indigo-300 truncate">
                        {getTypeTranslation(cat.type, (language as Language) || 'de')}
                      </span>
                      <span className="block text-[9px] font-mono text-ink-muted truncate">
                        {language === 'en' ? cat.descEn : cat.descDe}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </BaseModal>
      )}
    </div>
  );
};

export default WikiTextRenderer;
