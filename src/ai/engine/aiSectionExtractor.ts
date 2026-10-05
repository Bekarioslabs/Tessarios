/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export interface ParsedSection {
  header: string;          // Heading text e.g. "Charakterkern"
  level: number;           // Heading level (e.g. 2 for ##)
  startLine: number;       // Line index where the header starts
  contentStartLine: number;// Line index where content starts
  endLine: number;         // Line index where section ends (exclusive)
  content: string;         // Plain text content inside the section
}

export type SectionUpdateOperation = 'replaceSection' | 'appendToSection' | 'mergeIntoSection';

/**
 * Line-by-line AST/Heading parser for markdown documents.
 * Correctly handles code blocks (```), HTML comments, and nested subheadings.
 */
export function parseMarkdownSections(markdown: string): ParsedSection[] {
  if (!markdown) return [];

  const lines = markdown.split(/\r?\n/);
  const sections: ParsedSection[] = [];

  let inCodeBlock = false;
  let inHtmlComment = false;

  let currentSection: ParsedSection | null = null;
  let sectionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track HTML comment blocks
    if (trimmed.includes('<!--') && !trimmed.includes('-->')) {
      inHtmlComment = true;
    } else if (inHtmlComment && trimmed.includes('-->')) {
      inHtmlComment = false;
    }

    // Track fenced code blocks (``` or ~~~)
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
    }

    // A real section header must NOT be inside a code block or HTML comment
    const isHeading = !inCodeBlock && !inHtmlComment && line.startsWith('## ');

    if (isHeading) {
      // Close previous section if active
      if (currentSection) {
        currentSection.endLine = i;
        currentSection.content = sectionLines.join('\n').trim();
        sections.push(currentSection);
        sectionLines = [];
      }

      const headerText = line.substring(3).trim();
      currentSection = {
        header: headerText,
        level: 2,
        startLine: i,
        contentStartLine: i + 1,
        endLine: lines.length,
        content: '',
      };
    } else if (currentSection) {
      sectionLines.push(line);
    }
  }

  // Close final section
  if (currentSection) {
    currentSection.endLine = lines.length;
    currentSection.content = sectionLines.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Extract content of a specific `## <sectionHeader>` safely
 */
export function extractMarkdownSection(markdown: string, sectionHeader: string): string | null {
  const sections = parseMarkdownSections(markdown);
  const target = sections.find(s => s.header.toLowerCase().trim() === sectionHeader.toLowerCase().trim());
  return target ? target.content : null;
}

/**
 * Surgically update ONLY the content of `## <sectionHeader>`.
 * Supports operation types: 'replaceSection' | 'appendToSection' | 'mergeIntoSection'.
 * Preserves YAML frontmatter, all surrounding sections, code blocks, and comments 100%.
 * If the section does not exist yet, appends it safely at the end of the document.
 */
export function updateMarkdownSection(
  fullMarkdown: string,
  sectionHeader: string,
  newContent: string,
  operation: SectionUpdateOperation = 'replaceSection'
): string {
  const existingContent = extractMarkdownSection(fullMarkdown, sectionHeader);

  let finalSectionContent = newContent.trim();

  if (existingContent && existingContent.trim()) {
    if (operation === 'appendToSection') {
      finalSectionContent = `${existingContent.trim()}\n- ${newContent.trim().replace(/^-\s*/, '')}`;
    } else if (operation === 'mergeIntoSection') {
      // If content is already present in existing text, don't duplicate it
      if (existingContent.includes(newContent.trim())) {
        finalSectionContent = existingContent.trim();
      } else {
        finalSectionContent = `${existingContent.trim()}\n${newContent.trim()}`;
      }
    }
  }

  const lines = fullMarkdown.split(/\r?\n/);
  const sections = parseMarkdownSections(fullMarkdown);
  const target = sections.find(s => s.header.toLowerCase().trim() === sectionHeader.toLowerCase().trim());

  if (target) {
    const beforeLines = lines.slice(0, target.contentStartLine);
    const afterLines = lines.slice(target.endLine);

    const resultLines = [
      ...beforeLines,
      finalSectionContent,
      ...afterLines
    ];

    return resultLines.join('\n');
  }

  // Section not found: append new section safely at the bottom
  const cleanMarkdown = fullMarkdown.trimEnd();
  const separator = cleanMarkdown.endsWith('\n') ? '\n' : '\n\n';
  return `${cleanMarkdown}${separator}## ${sectionHeader}\n\n${finalSectionContent}\n`;
}

/**
 * Explicit helper for appending content to an existing section
 */
export function appendToSection(fullMarkdown: string, sectionHeader: string, textToAppend: string): string {
  return updateMarkdownSection(fullMarkdown, sectionHeader, textToAppend, 'appendToSection');
}

/**
 * Explicit helper for merging consolidated content into an existing section
 */
export function mergeIntoSection(fullMarkdown: string, sectionHeader: string, mergedContent: string): string {
  return updateMarkdownSection(fullMarkdown, sectionHeader, mergedContent, 'mergeIntoSection');
}
