/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { parseMarkdownSections, extractMarkdownSection, updateMarkdownSection, appendToSection } from './aiSectionExtractor';

/**
 * Matches only a standalone "Offene Fragen" / "Open Questions" heading, never a combined
 * one like "Geheimnisse & offene Fragen" — splitting a combined section would mean
 * guessing which lines are secrets and which are open questions, which nothing here can
 * tell apart. character-hero and organization were split into two headings specifically
 * so this still works for them; a template that keeps a combined heading just never shows
 * the tidy-up entry point, rather than mis-sorting it.
 */
const OPEN_QUESTIONS_HEADER = /^(offene fragen|open questions)$/i;

/** The real header text as written in this entity, or null if it has no section that
 *  matches exactly — derived from the entity's actual content, not the template, so it
 *  still works if a section was renamed or the template has since changed. */
export function findOpenQuestionsHeader(entityContent: string): string | null {
  const section = parseMarkdownSections(entityContent).find(s => OPEN_QUESTIONS_HEADER.test(s.header.trim()));
  return section ? section.header : null;
}

/** Every other `##` section header in this entity — the destinations a point could move
 *  to. Also derived from the entity's actual content, in its actual current wording. */
export function otherSectionHeaders(entityContent: string, openQuestionsHeader: string): string[] {
  return parseMarkdownSections(entityContent)
    .map(s => s.header)
    .filter(h => h.trim().toLowerCase() !== openQuestionsHeader.trim().toLowerCase());
}

const BULLET_LINE = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/;

/**
 * Splits an "Offene Fragen" section's text into individual points to classify.
 *
 * Bullet lines are the expected shape and are split one point per bullet, with any
 * unindented continuation lines folded into the point above it. Without any bullet
 * markers at all, falls back to blank-line-separated paragraphs — still one request per
 * logical point rather than treating the whole section as a single blob.
 *
 * Every point keeps its original wording verbatim; nothing here rewrites text, only
 * decides where it belongs.
 */
export function splitIntoPoints(sectionContent: string): string[] {
  const text = (sectionContent || '').trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const hasBullets = lines.some(l => BULLET_LINE.test(l));

  if (hasBullets) {
    const points: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
      const bulletMatch = line.match(BULLET_LINE);
      if (bulletMatch) {
        if (current.length) points.push(current.join(' ').trim());
        current = [bulletMatch[1].trim()];
      } else if (line.trim() && current.length) {
        current.push(line.trim());
      }
    }
    if (current.length) points.push(current.join(' ').trim());
    return points.filter(Boolean);
  }

  return text
    .split(/\n\s*\n/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** One point the model placed into an existing section, validated against the real
 *  section list — never the model's raw, unverified answer. */
export interface TidyUpProposal {
  pointIndex: number;
  text: string;
  targetSection: string;
}

const RESPONSE_LINE = /^\s*(\d+)\s*[:.)]\s*(.+?)\s*$/;

/**
 * Turns the model's numbered-line reply into validated proposals.
 *
 * Strict on purpose: a line that doesn't parse, references a point number out of range,
 * or names anything other than one of `knownSections` (case-insensitively, but otherwise
 * exact — no partial matches) produces no proposal for that point. That point simply isn't
 * shown as something to move, the same outcome as the model saying "stays" — there is no
 * "best guess" fallback, because a wrong guess here means content lands in the wrong
 * section with no visible sign that anything was uncertain.
 */
export function parseTidyUpResponse(
  raw: string,
  points: string[],
  knownSections: string[]
): TidyUpProposal[] {
  const sectionByLower = new Map(knownSections.map(s => [s.trim().toLowerCase(), s]));
  const seen = new Set<number>();
  const proposals: TidyUpProposal[] = [];

  for (const line of (raw || '').split(/\r?\n/)) {
    const match = line.match(RESPONSE_LINE);
    if (!match) continue;

    const pointIndex = Number(match[1]) - 1;
    if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= points.length) continue;
    if (seen.has(pointIndex)) continue;

    const targetSection = sectionByLower.get(match[2].trim().toLowerCase());
    if (!targetSection) continue; // "bleibt", gibberish, or anything unrecognized — no proposal

    seen.add(pointIndex);
    proposals.push({ pointIndex, text: points[pointIndex], targetSection });
  }

  return proposals;
}

/**
 * Applies accepted proposals: removes them from "Offene Fragen", appends each to its
 * target section, via the same `updateMarkdownSection`/`appendToSection` every other write
 * in the app uses — this is not a special write path.
 *
 * Returns null if `originalOpenQuestionsText` no longer matches what's actually in
 * `fullContent` right now — the author changed the section while the proposals were being
 * reviewed. Rather than merging two diverging versions, nothing is written; the caller
 * asks for fresh proposals instead.
 */
export function applyTidyUp(
  fullContent: string,
  openQuestionsHeader: string,
  originalOpenQuestionsText: string,
  accepted: TidyUpProposal[]
): string | null {
  const currentText = (extractMarkdownSection(fullContent, openQuestionsHeader) || '').trim();
  if (currentText !== originalOpenQuestionsText.trim()) return null;

  const originalPoints = splitIntoPoints(originalOpenQuestionsText);
  const acceptedIndexes = new Set(accepted.map(a => a.pointIndex));
  const remainingPoints = originalPoints.filter((_, idx) => !acceptedIndexes.has(idx));
  const remainingContent = remainingPoints.map(p => `- ${p}`).join('\n');

  let content = updateMarkdownSection(fullContent, openQuestionsHeader, remainingContent, 'replaceSection');
  for (const proposal of accepted) {
    content = appendToSection(content, proposal.targetSection, proposal.text);
  }
  return content;
}
