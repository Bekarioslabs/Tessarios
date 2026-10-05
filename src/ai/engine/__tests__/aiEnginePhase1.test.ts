/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { parseAIMdSpec, parseYamlSimple, splitFrontmatterAndBody } from '../aiFrontmatterParser';
import { parseMarkdownSections, extractMarkdownSection, updateMarkdownSection, appendToSection, mergeIntoSection } from '../aiSectionExtractor';
import { resolveAgentsPrompt, resolveAIMdSpec } from '../aiResolver';

/**
 * Phase 1 Verification Test Runner
 */
export async function runPhase1Tests(): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = [];
  let passed = true;

  function assert(condition: unknown, message: string) {
    if (condition) {
      log.push(`✅ PASS: ${message}`);
    } else {
      log.push(`❌ FAIL: ${message}`);
      passed = false;
    }
  }

  try {
    // 1. Test splitFrontmatterAndBody
    const mdInput = `---\ntitle: Test\n---\n## Section 1\nContent`;
    const split = splitFrontmatterAndBody(mdInput);
    assert(split.rawFrontmatter.includes('title: Test'), 'splitFrontmatterAndBody extracts raw frontmatter');
    assert(split.body.includes('## Section 1'), 'splitFrontmatterAndBody extracts body');

    // 2. Test parseYamlSimple
    const yamlInput = `
aiSpecVersion: 1
templateId: character-hero
entityType: character
writePolicy:
  sectionUpdates: target-only
  preserveFrontmatter: true
sections:
  "Charakterkern":
    mode: collaborative
    creativity: medium
    context:
      - current-entity
      - relations:important
`;
    const parsedYaml = parseYamlSimple(yamlInput);
    assert(parsedYaml.aiSpecVersion === 1, 'parseYamlSimple handles numbers');
    assert(parsedYaml.writePolicy?.preserveFrontmatter === true, 'parseYamlSimple handles nested booleans');
    assert(Array.isArray(parsedYaml.sections?.Charakterkern?.context), 'parseYamlSimple handles nested arrays');

    // 3. Test parseAIMdSpec with Phase 0 Fallbacks
    const corruptAiMd = `---\naiSpecVersion: 99
sections:
  "TestSection":
    mode: INVALID_MODE
    creativity: INVALID_CREATIVITY
---\n# Instruction Prompt Body`;
    const aiSpec = parseAIMdSpec(corruptAiMd, 'test-template');
    assert(aiSpec.sections.TestSection.mode === 'collaborative', 'Phase 0 fallback for invalid mode works');
    assert(aiSpec.sections.TestSection.creativity === 'medium', 'Phase 0 fallback for invalid creativity works');
    assert(aiSpec.instructionsPrompt === '# Instruction Prompt Body', 'Instruction prompt extracted cleanly');

    // 4. Test parseMarkdownSections & extractMarkdownSection
    const fullMdDoc = `---
id: test-1
title: Test Entity
---

## Charakterkern
Er möchte bewundert werden.

### Unterthema
Weitere Details.

\`\`\`text
## No Header In Code Block
\`\`\`

<!-- ## No Header In Comment -->

## Alltag & Persönlichkeit
Er ist sehr aktiv im Unterricht.
`;

    const sections = parseMarkdownSections(fullMdDoc);
    assert(sections.length === 2, 'parseMarkdownSections correctly ignores headers in code blocks & comments');
    assert(sections[0].header === 'Charakterkern', 'First section header extracted');
    assert(sections[1].header === 'Alltag & Persönlichkeit', 'Second section header extracted');

    const coreContent = extractMarkdownSection(fullMdDoc, 'Charakterkern');
    assert(coreContent?.includes('Er möchte bewundert werden.'), 'extractMarkdownSection retrieves section content');
    assert(coreContent?.includes('### Unterthema'), 'extractMarkdownSection retains subheadings in section');

    // 5. Test updateMarkdownSection Operations (replace, append, merge)
    const updatedDoc = updateMarkdownSection(fullMdDoc, 'Charakterkern', 'Neuer aktualisierter Charakterkern.', 'replaceSection');
    assert(updatedDoc.includes('id: test-1'), 'updateMarkdownSection preserves YAML frontmatter');
    assert(updatedDoc.includes('Neuer aktualisierter Charakterkern.'), 'updateMarkdownSection updates target section content');
    assert(updatedDoc.includes('## Alltag & Persönlichkeit'), 'updateMarkdownSection preserves surrounding H2 sections');

    const appendedDoc = appendToSection(fullMdDoc, 'Charakterkern', 'Neue zusätzliche Eigenschaft.');
    assert(appendedDoc.includes('Er möchte bewundert werden.') && appendedDoc.includes('Neue zusätzliche Eigenschaft.'), 'appendToSection appends without erasing old content');

    const mergedDoc = mergeIntoSection(fullMdDoc, 'Charakterkern', '- Neues Wissen aus Canon Capture');
    assert(mergedDoc.includes('Er möchte bewundert werden.') && mergedDoc.includes('- Neues Wissen aus Canon Capture'), 'mergeIntoSection consolidates section content');

    // 6. Test Resolver Modules
    const agentsPrompt = await resolveAgentsPrompt(null, 'Tessarios AI Verfassung');
    assert(agentsPrompt.includes('Tessarios AI'), 'resolveAgentsPrompt loads AGENTS.md');

    const sampleAiMd = `---\ntemplateId: character-hero\nsections:\n  "Charakterkern":\n    mode: collaborative\n    creativity: medium\n---\n# Hero prompt`;
    const heroSpec = await resolveAIMdSpec('character-hero', 'de', null, sampleAiMd);
    assert(heroSpec !== null && heroSpec.templateId === 'character-hero', 'resolveAIMdSpec parses character-hero.ai.md');
    assert(heroSpec?.sections['Charakterkern'] !== undefined, 'heroSpec contains sections');

  } catch (err: any) {
    log.push(`❌ EXCEPTION: ${err.message || String(err)}`);
    passed = false;
  }

  return { success: passed, log };
}
