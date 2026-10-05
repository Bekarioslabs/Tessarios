/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { LoreEntity } from '../../../types';
import { AIContextResolver } from '../aiContextResolver';
import { composePrompt } from '../aiPromptComposer';
import { parseAIMdSpec } from '../aiFrontmatterParser';
import { resolveTemplateForEntity, templateSectionHeaders, findDossierGaps } from '../../../utils/templateMatching';
import { trimExchangesToBudget, ChatExchange } from '../../../utils/chatDraftStore';
import { findFieldContradiction, findSceneContradictions } from '../aiContradictionDetector';
import { buildNarrativePosition } from '../../../hooks/useManuscriptChat';
import { extractMarkdownSection } from '../aiSectionExtractor';
import {
  setGeneratedTextLanguage,
  serializeToMarkdown,
  parseFromMarkdown,
  generateMapMarkersTable,
  updateMapContentWithMarkers,
} from '../../../utils/markdown';
import {
  normalizeStatus,
  statusValueFor,
  parseIndexesFromTitle,
  formatSceneTitle,
  formatChapterTitle,
  getManuscriptHierarchy,
  reorderScenesAndRename,
} from '../../../utils/manuscript';
import {
  findOpenQuestionsHeader,
  otherSectionHeaders,
  splitIntoPoints,
  parseTidyUpResponse,
  applyTidyUp,
} from '../aiTidyUp';
import { contextLoad, estimateTokens } from '../../../utils/aiSettings';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runPhase2Tests(): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = [];
  let passed = true;

  function assert(condition: boolean, message: string) {
    if (condition) {
      log.push(`✅ PASS: ${message}`);
    } else {
      log.push(`❌ FAIL: ${message}`);
      passed = false;
    }
  }

  try {
    // 1. Test AIContextResolver with Structured Context & Budgeting
    const resolver = new AIContextResolver();
    const mockEntity: LoreEntity = {
      id: 'jonas-1',
      title: 'Jonas Berger',
      type: 'character',
      content: '## Charakterkern\nEr ist hilfsbereit.',
      lastModified: Date.now(),
      tags: [],
      relations: [],
      customFields: { Kraftsystem: '[[Jonas – Kräfte]]' },
    };
    const mockMd = `---\nid: jonas-1\n---\n## Charakterkern\nEr ist hilfsbereit.`;

    const resolvedContext = await resolver.resolveContext(mockEntity, mockMd, [
      { source: 'current-entity' },
      { source: 'field', field: 'Kraftsystem' }
    ], { maxCharacterBudget: 500 });

    assert(resolvedContext.includes('Jonas Berger'), 'ContextResolver resolves current entity');

    // 2. Test AIPromptComposer layering

    const composed = composePrompt({
      agentsPrompt: 'Tessarios Verfassung',
      soulPrompt: 'Ruhiger Sparringspartner',
      projectPrompt: 'Beispiel Projektbibel',
      resolvedContext: 'Jonas Kontext',
      userMessage: 'Schreibe den Charakterkern',
      targetSectionHeader: 'Charakterkern',
    });

    assert(composed.systemPrompt.includes('Tessarios Verfassung'), 'Prompt composer includes Layer 1 AGENTS.md');
    assert(composed.systemPrompt.includes('Ruhiger Sparringspartner'), 'Prompt composer includes Layer 2 SOUL.md');
    assert(composed.systemPrompt.includes('Beispiel Projektbibel'), 'Prompt composer includes Layer 3 PROJECT.md');
    assert(composed.systemPrompt.includes('Jonas Kontext'), 'Prompt composer includes the resolved context layer');

    // 3. Test AIContextResolver's closed rule set. A rule that isn't part of it must
    // fail loudly instead of silently resolving to nothing — that silent-nothing is
    // exactly what let 4 of the 8 rules in character-hero.ai.md do nothing for months.
    const fullResolver = new AIContextResolver();

    const heldEntity: LoreEntity = {
      id: 'tilda',
      title: 'Tilda',
      type: 'character',
      content: 'Tilda kämpft an der Seite von [[Emil]] und [[Emil]] gegen [[Nebelbund]]. Auch [[Ursprung des Nebels]] wird erwähnt.',
      lastModified: Date.now(),
      tags: [],
      relations: [
        { targetId: 'emil', type: 'Verbündeter' },
        { targetId: 'leuchtturm-club', type: 'Mitglied' },
        { targetId: 'nebelbund', type: 'Gegner' },
      ],
      customFields: { Gruppe: '[[Leuchtturm-Club]]' },
    };

    const emil: LoreEntity = {
      id: 'emil', title: 'Emil', type: 'character', content: '', lastModified: Date.now(),
      tags: [], relations: [], customFields: {},
    };
    const leuchtturmClub: LoreEntity = {
      id: 'leuchtturm-club', title: 'Leuchtturm-Club', type: 'organization', content: '', lastModified: Date.now(),
      tags: [], relations: [], customFields: {},
    };
    const nebelbund: LoreEntity = {
      id: 'nebelbund', title: 'Nebelbund', type: 'organization', content: '', lastModified: Date.now(),
      tags: [], relations: [], customFields: {},
    };
    const ursprungLore: LoreEntity = {
      id: 'ursprung-des-nebels', title: 'Ursprung des Nebels', type: 'lore', content: '', lastModified: Date.now(),
      tags: [], relations: [], customFields: {},
    };

    const entityIndex: Record<string, LoreEntity> = {
      tilda: heldEntity, emil, 'leuchtturm-club': leuchtturmClub, nebelbund, 'ursprung-des-nebels': ursprungLore,
    };
    const heroTemplate = {
      id: 'character-hero', name: 'Held', type: 'character' as const, description: '',
      defaultContent: '', defaultFields: {}, defaultTags: [],
      contextFields: ['Gruppe', 'Kraftsystem', 'Kostüm'],
    };
    const wiredResolver = new AIContextResolver(null, undefined, entityIndex, [heroTemplate]);

    const relationsOnly = await wiredResolver.resolveContext(heldEntity, '', ['relations']);
    assert(relationsOnly.includes('Emil') && !relationsOnly.includes('Leuchtturm-Club (verknüpft)'), 'relations lists all targets by title without loading dossiers');

    const important = await wiredResolver.resolveContext(heldEntity, '', ['relations:important']);
    assert(important.indexOf('Leuchtturm-Club (verknüpft)') < important.indexOf('Emil (verknüpft)'), 'relations:important ranks a contextFields-referenced target above a merely-mentioned one');

    const groupRelevant = await wiredResolver.resolveContext(heldEntity, '', ['relations:group-relevant']);
    assert(groupRelevant.includes('Leuchtturm-Club (verknüpft)') && groupRelevant.includes('Nebelbund (verknüpft)') && !groupRelevant.includes('Emil (verknüpft)'), 'relations:group-relevant selects the Gruppe field target and organization-type relations, not the character relation');

    const loreRelevant = await wiredResolver.resolveContext(heldEntity, '', ['lore:relevant']);
    assert(loreRelevant.includes('Ursprung des Nebels') && !loreRelevant.includes('Emil'), 'lore:relevant resolves wikilinked entries filtered to type lore');

    let threwForUnknownRule = false;
    try {
      await wiredResolver.resolveContext(heldEntity, '', ['storylines:relationship']);
    } catch {
      threwForUnknownRule = true;
    }
    assert(threwForUnknownRule, 'resolveContext throws on an unrecognized rule instead of silently resolving to nothing');

    // 4. Regression guard on the real template file: this is what would have caught
    // "storylines:relationship" and "scenes:origin-relevant" before they shipped.
    const realAiMdPath = path.join(__dirname, '../../../templates/de/character-hero.ai.md');
    const realAiMdContent = fs.readFileSync(realAiMdPath, 'utf8');
    let realTemplateParsed = false;
    try {
      const realSpec = parseAIMdSpec(realAiMdContent, 'character-hero');
      realTemplateParsed = Object.keys(realSpec.sections).length === 9;
    } catch (e: any) {
      log.push(`   (character-hero.ai.md parse error: ${e.message})`);
    }
    assert(realTemplateParsed, 'the real character-hero.ai.md parses without an unknown-context-rule error');

    // 5. Template matching recovers the template from the tags it stamped on the entity.
    const heroTpl = {
      id: 'character-hero', name: 'Held', type: 'character' as const, description: '',
      defaultContent: '## Charakterkern\n\n## Rolle in der Gruppe', defaultFields: {},
      defaultTags: ['character', 'hero'],
    };
    const antagonistTpl = {
      id: 'character-antagonist', name: 'Antagonist', type: 'character' as const, description: '',
      defaultContent: '## Character Core', defaultFields: {}, defaultTags: ['character', 'antagonist'],
    };

    assert(
      resolveTemplateForEntity({ type: 'character', tags: ['character', 'hero'] }, [heroTpl, antagonistTpl])?.id === 'character-hero',
      'resolveTemplateForEntity picks the template whose defaultTags the entity carries'
    );
    assert(
      resolveTemplateForEntity({ type: 'character', tags: ['character', 'antagonist'] }, [heroTpl, antagonistTpl])?.id === 'character-antagonist',
      'resolveTemplateForEntity distinguishes two templates of the same entity type'
    );
    assert(
      resolveTemplateForEntity({ type: 'character', tags: [] }, [heroTpl, antagonistTpl])?.id === 'character-hero',
      'resolveTemplateForEntity falls back to the first template of the type when tags were edited away'
    );
    assert(
      JSON.stringify(templateSectionHeaders(heroTpl)) === '["Charakterkern","Rolle in der Gruppe"]',
      'templateSectionHeaders reads the section list a default AI spec is built from'
    );

    // 6. "What's still missing" is a calculation over the template, not a prompt.
    const gapTemplate = {
      id: 'gap-tpl', name: 'Test', type: 'character' as const, description: '',
      defaultContent: '## Charakterkern\n\n## Alltag\n\n## Geheimnisse',
      defaultFields: { created: '', lastModified: '', Alter: '', Rolle: '', Heldenname: '' },
      fieldConfig: {
        created: { type: 'date' as const, readonly: true },
        lastModified: { type: 'date' as const, readonly: true },
      },
      defaultTags: ['character'],
    };

    const halfFilled = {
      content: '## Charakterkern\nSie will bewundert werden.\n\n## Alltag\n\n## Geheimnisse\n   \n',
      customFields: { Alter: '8', Rolle: '', Heldenname: '  ', created: '2026-01-01' },
    };
    const gapResult = findDossierGaps(halfFilled, gapTemplate);

    assert(
      JSON.stringify(gapResult.emptyFields) === '["Rolle","Heldenname"]',
      'findDossierGaps reports empty and whitespace-only fields, ignoring app-managed ones'
    );
    assert(
      !gapResult.emptyFields.includes('created') && !gapResult.emptyFields.includes('lastModified'),
      'findDossierGaps never asks the author to fill in created/lastModified'
    );
    assert(
      JSON.stringify(gapResult.emptySections) === '["Alltag","Geheimnisse"]',
      'findDossierGaps counts a section with only whitespace as empty but a written one as done'
    );

    const missingSection = findDossierGaps(
      { content: '## Charakterkern\nText.', customFields: { Alter: '8', Rolle: 'Hauptheld', Heldenname: 'Star' } },
      gapTemplate
    );
    assert(
      JSON.stringify(missingSection.emptySections) === '["Alltag","Geheimnisse"]',
      'A section deleted from the dossier counts as missing, same as an empty one'
    );
    assert(
      missingSection.emptyFields.length === 0,
      'A dossier with every author-facing field filled reports no open fields'
    );

    // 7. trimExchangesToBudget: the freeform chat's safety valve against an
    //    unbounded conversation history.
    const manyExchanges: ChatExchange[] = Array.from({ length: 8 }, (_, i) => ({
      prompt: `Frage ${i}`,
      reply: 'y'.repeat(1000),
    }));
    const trimmedExchanges = trimExchangesToBudget(manyExchanges);
    assert(
      trimmedExchanges.length > 0 && trimmedExchanges.length < manyExchanges.length,
      'trimExchangesToBudget drops the oldest exchanges once the character budget is exceeded'
    );
    assert(
      trimmedExchanges[trimmedExchanges.length - 1].prompt === 'Frage 7',
      'trimExchangesToBudget always keeps the most recent exchange'
    );
    const oneHugeExchange: ChatExchange[] = [{ prompt: 'x', reply: 'z'.repeat(50000) }];
    assert(
      trimExchangesToBudget(oneHugeExchange).length === 1,
      'trimExchangesToBudget keeps at least the single latest exchange even if it alone exceeds the budget'
    );

    // 8. findFieldContradiction — deterministic, no model call.
    const ilkaForContradiction: LoreEntity = {
      id: 'ilka', title: 'Ilka', type: 'character', content: '', lastModified: Date.now(),
      tags: [], relations: [], customFields: { Heldenname: 'Nachtfalke', Rolle: 'Protagonist' },
    };
    const roleField = { type: 'select' as const, options: ['Protagonist', 'Hauptheld', 'Nebenheld'] };

    const sceneWithConflictingRole: LoreEntity = {
      id: 'kapitel-4', title: 'Kapitel 4', type: 'chapter', content:
        'Ilka wusste es: Als bloßer [[Ilka]] Nebenheld würde sie nie ernst genommen werden.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const sceneWithoutMention: LoreEntity = {
      id: 'kapitel-1', title: 'Kapitel 1', type: 'chapter', content: 'Jonas saß still auf seinem Platz.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const loreWithConflictingWord: LoreEntity = {
      id: 'lore-eintrag', title: 'Hintergrund', type: 'lore', content: '[[Ilka]] wird oft als Nebenheld beschrieben.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };

    const roleContradiction = findFieldContradiction(
      ilkaForContradiction, 'Rolle', 'Hauptheld', roleField,
      { 'kapitel-4': sceneWithConflictingRole, 'kapitel-1': sceneWithoutMention }
    );
    assert(
      roleContradiction?.conflictingValue === 'Nebenheld' && roleContradiction.sourceTitle === 'Kapitel 4',
      'findFieldContradiction flags a competing select option mentioned near the character in a chapter'
    );

    const noContradictionElsewhere = findFieldContradiction(
      ilkaForContradiction, 'Rolle', 'Hauptheld', roleField,
      { 'lore-eintrag': loreWithConflictingWord }
    );
    assert(
      noContradictionElsewhere === null,
      'findFieldContradiction only searches manuscript entities (scene/chapter), not lore or other dossiers'
    );

    const sameValueNoCandidates = findFieldContradiction(
      ilkaForContradiction, 'Heldenname', 'Nachtfalke', undefined,
      { 'kapitel-4': sceneWithConflictingRole }
    );
    assert(
      sameValueNoCandidates === null,
      'findFieldContradiction finds nothing when a text field\'s proposed value matches its current one — nothing competes with itself'
    );

    const sceneWithOldHeroName: LoreEntity = {
      id: 'kapitel-7', title: 'Kapitel 7', type: 'scene', content:
        '„Ich bin Nachtfalke!", rief [[Ilka]] und hob ab vom Boden.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const heldennameContradiction = findFieldContradiction(
      ilkaForContradiction, 'Heldenname', 'Funkenflug', undefined,
      { 'kapitel-7': sceneWithOldHeroName }
    );
    assert(
      heldennameContradiction?.conflictingValue === 'Nachtfalke',
      'findFieldContradiction also checks a free-text field\'s own previous value against the manuscript, not just select options'
    );

    const noMentionNoContradiction = findFieldContradiction(
      ilkaForContradiction, 'Rolle', 'Hauptheld', roleField,
      { 'kapitel-1': sceneWithoutMention }
    );
    assert(
      noMentionNoContradiction === null,
      'findFieldContradiction finds nothing in a chapter that never mentions the character at all'
    );

    const wordBoundaryScene: LoreEntity = {
      id: 'kapitel-9', title: 'Kapitel 9', type: 'chapter', content:
        '[[Ilka]] übte ihren Heldennamen laut vor dem Spiegel.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const heldFieldNoOverlap = { type: 'select' as const, options: ['Protagonist', 'Held'] };
    const noPartialWordMatch = findFieldContradiction(
      ilkaForContradiction, 'Rolle', 'Protagonist', heldFieldNoOverlap,
      { 'kapitel-9': wordBoundaryScene }
    );
    assert(
      noPartialWordMatch === null,
      'findFieldContradiction does not treat "Held" as found merely because it is a substring of "Heldennamen"'
    );

    // 9. mentioned:dossiers — what the manuscript companion sees. A scene links whoever
    //    is in it; those dossiers must resolve without relations being wired up first,
    //    and neighbouring manuscript entries must stay out of the budget.
    const ilkaDossier: LoreEntity = {
      id: 'ilka-d', title: 'Ilka', type: 'character', content: 'Sie ist zwölf.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const leuchtturm: LoreEntity = {
      id: 'leuchtturm-d', title: 'Leuchtturm', type: 'place', content: 'Drei Meter über dem Boden.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const nachbarSzene: LoreEntity = {
      id: 'szene-2', title: 'Szene 2', type: 'scene', content: '## Manuskript\nEin sehr langer Text.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const szeneMitLinks: LoreEntity = {
      id: 'szene-1',
      title: 'Szene 1',
      type: 'scene',
      // No relations at all — the wikilinks in the prose are the only signal.
      content: '## Manuskript\n[[Ilka]] klettert ins [[Leuchtturm]]. Vgl. [[Szene 2]].',
      lastModified: Date.now(),
      tags: [],
      relations: [],
      customFields: {},
    };
    const sceneResolver = new AIContextResolver(null, undefined, {
      'ilka-d': ilkaDossier, 'leuchtturm-d': leuchtturm, 'szene-1': szeneMitLinks, 'szene-2': nachbarSzene,
    });

    const sceneContext = await sceneResolver.resolveContext(
      szeneMitLinks, szeneMitLinks.content, ['mentioned:dossiers']
    );
    assert(
      sceneContext.includes('Sie ist zwölf.') && sceneContext.includes('Drei Meter über dem Boden.'),
      'mentioned:dossiers resolves every wikilinked dossier regardless of category, without relations being set'
    );
    assert(
      !sceneContext.includes('Ein sehr langer Text.'),
      'mentioned:dossiers leaves linked scenes out — a neighbouring scene would eat the whole budget'
    );

    // 9b. A dossier dropped for budget must be named, not silently missing. An author
    //     cannot tell "the AI ignored this figure" from "the AI never saw her".
    const fetter = (n: number) => 'w'.repeat(n);
    const grossA: LoreEntity = {
      id: 'gross-a', title: 'Gross A', type: 'character', content: fetter(3000),
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const grossB: LoreEntity = {
      id: 'gross-b', title: 'Gross B', type: 'character', content: fetter(3000),
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const engeSzene: LoreEntity = {
      id: 'szene-eng', title: 'Enge Szene', type: 'scene',
      content: '## Manuskript\n[[Gross A]] trifft [[Gross B]].',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const tightResolver = new AIContextResolver(null, undefined, {
      'gross-a': grossA, 'gross-b': grossB, 'szene-eng': engeSzene,
    });
    const tight = await tightResolver.resolveContextDetailed(
      engeSzene, engeSzene.content, ['mentioned:dossiers'], { maxCharacterBudget: 3500 }
    );
    assert(
      tight.included.length === 1 && tight.omitted.length === 1,
      'resolveContextDetailed reports the dossier it had to leave out instead of dropping it silently'
    );
    assert(
      tight.omitted[0] === 'Gross B' && !tight.text.includes('Gross B'),
      'the entry named as omitted is genuinely the one missing from the context text'
    );

    const roomy = await tightResolver.resolveContextDetailed(
      engeSzene, engeSzene.content, ['mentioned:dossiers'], { maxCharacterBudget: 20000 }
    );
    assert(
      roomy.omitted.length === 0 && roomy.included.length === 2,
      'a budget with room for both reports nothing omitted'
    );

    // 9c. The context gauge's bands. 'over' has to fire well before 100%: the answer
    //     needs room in the same window, and a server that runs out drops the front of
    //     the prompt — the constitution — without saying so.
    assert(
      contextLoad(2000, 8192).level === 'ok',
      'contextLoad reports ok while there is plenty of room'
    );
    assert(
      contextLoad(6000, 8192).level === 'tight',
      'contextLoad warns at around three quarters full, before the window is actually exhausted'
    );
    assert(
      contextLoad(7800, 8192).level === 'over',
      'contextLoad reports over below 100%, because the reply still has to fit'
    );
    assert(
      estimateTokens(3000) === 1000,
      'estimateTokens converts characters at the German ~3:1 ratio'
    );

    // 10. buildNarrativePosition — where a scene sits, so a continuation can join on.
    const kapitel: LoreEntity = {
      id: 'kap-1', title: 'Kapitel 1', type: 'chapter', content: '',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const ersteSzene: LoreEntity = {
      id: 'sz-a', title: 'Szene 1', type: 'scene',
      content: '## Manuskript\nSie stand vor der Tür und atmete durch.',
      lastModified: Date.now(), tags: [], relations: [{ targetId: 'kap-1', type: 'Kapitel' }], customFields: {},
    };
    const zweiteSzene: LoreEntity = {
      id: 'sz-b', title: 'Szene 2', type: 'scene', content: '## Manuskript\n',
      lastModified: Date.now(), tags: [], relations: [{ targetId: 'kap-1', type: 'Kapitel' }], customFields: {},
    };
    const buch: LoreEntity = {
      id: 'buch-1', title: 'Beispielbuch', type: 'book', content: '',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const manuscriptEntities = {
      'buch-1': buch, 'kap-1': kapitel, 'sz-a': ersteSzene, 'sz-b': zweiteSzene,
    };

    const secondPosition = buildNarrativePosition(zweiteSzene, manuscriptEntities, 'de');
    assert(
      secondPosition.includes('Sie stand vor der Tür und atmete durch.'),
      'buildNarrativePosition carries the end of the preceding scene, so a continuation has something to join onto'
    );
    assert(
      secondPosition.includes('Beispielbuch') && secondPosition.includes('Kapitel 1'),
      'buildNarrativePosition names the book and chapter the scene belongs to'
    );

    const firstPosition = buildNarrativePosition(ersteSzene, manuscriptEntities, 'de');
    assert(
      !firstPosition.includes('vorherige Szene'),
      'buildNarrativePosition offers no preceding scene for the first scene of a chapter'
    );

    // 11. findSceneContradictions — the editor role's check, the reverse direction of
    //     findFieldContradiction: one scene, checked against the dossiers it links to.
    const heroTemplateWithRole = {
      id: 'character-hero', name: 'Held', type: 'character' as const, description: '',
      defaultContent: '', defaultFields: {}, defaultTags: ['character', 'hero'],
      fieldConfig: {
        Rolle: { type: 'select' as const, options: ['Protagonist', 'Nebenheld', 'Antagonist'] },
        Alter: { type: 'text' as const },
      },
    };
    const mira: LoreEntity = {
      id: 'mira-d', title: 'Mira', type: 'character',
      content: '', lastModified: Date.now(), tags: ['character', 'hero'], relations: [],
      customFields: { Rolle: 'Protagonist', Alter: '9' },
    };

    const contradictingScene: LoreEntity = {
      id: 'sz-c', title: 'Szene 3', type: 'scene',
      content: '## Manuskript\n[[Mira]] blieb im Hintergrund. Sie ist hier klar der Antagonist.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const sceneFindings = findSceneContradictions(
      contradictingScene, { 'mira-d': mira, 'sz-c': contradictingScene }, [heroTemplateWithRole]
    );
    assert(
      sceneFindings.length === 1 &&
        sceneFindings[0].field === 'Rolle' &&
        sceneFindings[0].dossierValue === 'Protagonist' &&
        sceneFindings[0].conflictingValue === 'Antagonist',
      'findSceneContradictions flags a scene using a competing select option of a dossier it links to'
    );

    const agreeingScene: LoreEntity = {
      id: 'sz-d', title: 'Szene 4', type: 'scene',
      content: '## Manuskript\n[[Mira]] ist der Protagonist dieser Geschichte.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    assert(
      findSceneContradictions(agreeingScene, { 'mira-d': mira, 'sz-d': agreeingScene }, [heroTemplateWithRole]).length === 0,
      'findSceneContradictions stays quiet when the scene states the dossier\'s own value'
    );

    const unlinkedScene: LoreEntity = {
      id: 'sz-e', title: 'Szene 5', type: 'scene',
      content: '## Manuskript\nIrgendwer ist hier der Antagonist.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    assert(
      findSceneContradictions(unlinkedScene, { 'mira-d': mira, 'sz-e': unlinkedScene }, [heroTemplateWithRole]).length === 0,
      'findSceneContradictions only checks dossiers the scene actually links to'
    );

    // 11a. The manuscript workspace in an English vault. Everything here used to be read
    //      or written in German only: status values, the chapter field, "Chapter"/"Scene"
    //      titles, and the renaming that happens when scenes are reordered.
    assert(
      normalizeStatus('Completed') === 'Fertig' && normalizeStatus('Fertig') === 'Fertig' &&
        normalizeStatus('In Progress') === 'In Bearbeitung' && normalizeStatus('Revising') === 'In Überarbeitung',
      'normalizeStatus accepts the English and German spelling of each state'
    );
    assert(
      normalizeStatus('Planning') === 'Entwurf' && normalizeStatus('Planung') === 'Entwurf' && normalizeStatus('') === 'Entwurf' && normalizeStatus('something odd') === 'Entwurf',
      'normalizeStatus treats a template default, an empty value and an unknown value as a draft rather than as a half-finished state'
    );
    assert(
      statusValueFor('Fertig', 'en', '') === 'Completed' && statusValueFor('Fertig', 'de', '') === 'Fertig',
      'statusValueFor writes the interface language when the entry has no status yet'
    );
    assert(
      statusValueFor('Fertig', 'en', 'In Bearbeitung') === 'Fertig' && statusValueFor('Fertig', 'de', 'In Progress') === 'Completed',
      'statusValueFor keeps the language an entry already uses, so a German vault opened in the English UI is not filled with English values'
    );
    assert(
      parseIndexesFromTitle('Chapter 03 – The Pier').kIndex === 3 && parseIndexesFromTitle('Scene_K02_S05 – Low Tide').sIndex === 5 && parseIndexesFromTitle('Scene 4').sIndex === 4,
      'parseIndexesFromTitle reads Chapter and Scene numbers as well as Kapitel and Szene'
    );
    assert(
      formatSceneTitle(1, 2, undefined, 'en') === 'Scene_K01_S02' && formatChapterTitle(3, undefined, 'en') === 'Chapter 03' &&
        formatSceneTitle(1, 2) === 'Szene_K01_S02' && formatChapterTitle(3) === 'Kapitel 03',
      'format helpers name new chapters and scenes in the interface language and default to German'
    );
    assert(
      formatSceneTitle(2, 1, 'Scene_K01_S01 – Low Tide', 'en') === 'Scene_K02_S01 – Low Tide' &&
        formatChapterTitle(2, 'K01 – The Pier', 'en') === 'Chapter 02 – The Pier' &&
        formatChapterTitle(2, 'Kapitel 01 – Der Pier') === 'Kapitel 02 – Der Pier',
      'renumbering strips an existing prefix in either language instead of stacking a second one in front'
    );

    const enBook: LoreEntity = { id: 'bk', title: 'The Book', type: 'book', content: '', lastModified: 0, tags: [], relations: [], customFields: {} };
    const enChapter: LoreEntity = { id: 'ch-1', title: 'Chapter 01 – The Pier', type: 'chapter', content: '', lastModified: 0, tags: [], relations: [], customFields: { Status: 'In Progress' } };
    const enSceneA: LoreEntity = {
      id: 'sc-a', title: 'Scene_K01_S01 – Low Tide', type: 'scene', content: '## Manuscript\nOne two three.', lastModified: 0, tags: [], relations: [],
      customFields: { Chapter: '[[Chapter 01 – The Pier]]', Status: 'Completed' },
    };
    const enSceneB: LoreEntity = {
      id: 'sc-b', title: 'Scene_K01_S02 – Glow', type: 'scene', content: '## Manuscript\nFour five.', lastModified: 0, tags: [], relations: [],
      customFields: { Chapter: '[[Chapter 01 – The Pier]]', Status: 'Draft' },
    };
    const enVault = { bk: enBook, 'ch-1': enChapter, 'sc-a': enSceneA, 'sc-b': enSceneB };
    const enHierarchy = getManuscriptHierarchy(enVault);
    assert(
      enHierarchy[0].chapters[0].scenes.length === 2 && enHierarchy[0].chapters[0].scenes[0].status === 'Fertig',
      'an English vault resolves chapter links written as [[wikilinks]] and reads "Completed" as finished'
    );
    assert(
      enHierarchy[0].chapters[0].status === 'In Bearbeitung',
      'a chapter with one finished and one draft scene is in progress'
    );

    const reordered = reorderScenesAndRename(enVault, 'ch-1', ['sc-b', 'sc-a'], 'en');
    assert(
      reordered['sc-b'].title === 'Scene_K01_S01 – Glow' && reordered['sc-a'].title === 'Scene_K01_S02 – Low Tide',
      'reordering scenes in an English vault renumbers them without stacking a second prefix'
    );
    assert(
      reordered['sc-a'].customFields['Chapter'] === 'Chapter 01 – The Pier' && !('Kapitel' in reordered['sc-a'].customFields),
      'reordering keeps the English field name instead of adding a German "Kapitel" next to it'
    );

    // 11c. Text the app writes into files itself. An English vault used to get a German
    //      "### Galerie" heading and a German map legend. New headings follow the interface
    //      language; an existing one keeps its spelling; reading accepts both.
    const galleryEntity: LoreEntity = {
      id: 'gal', title: 'Gal', type: 'place', content: '## Overview\nText.', lastModified: Date.UTC(2026, 0, 1),
      tags: [], relations: [], customFields: {}, galleryImageUrls: ['vault://assets/a.png'],
    };
    setGeneratedTextLanguage('en');
    const englishGallery = serializeToMarkdown(galleryEntity);
    assert(
      englishGallery.includes('### Gallery') && !englishGallery.includes('Galerie'),
      'a new gallery is headed "Gallery" when the interface is English'
    );
    assert(
      (parseFromMarkdown(englishGallery).galleryImageUrls || []).length === 1,
      'a gallery written with the English heading is read back'
    );
    const germanBody: LoreEntity = {
      ...galleryEntity,
      content: '### Galerie\n\n![[assets/a.png|200]]\n\n<!-- GALLERY_DATA: ["vault://assets/a.png"] -->\n\n## Overview\nText.',
    };
    assert(
      serializeToMarkdown(germanBody).includes('### Galerie') && !serializeToMarkdown(germanBody).includes('### Gallery'),
      'an existing German "Galerie" heading is kept even when the interface is English, so switching language does not rewrite old notes'
    );
    assert(
      generateMapMarkersTable([], undefined, 'en') === '*(No markers placed on this map yet)*' &&
        generateMapMarkersTable([], undefined, 'de') === '*(Keine Markierungen auf dieser Karte gesetzt)*',
      'the map marker table is written in the requested language'
    );
    const oneMarker = [{ id: 'm1', x: 10, y: 20, label: 'Pier', description: 'Where it starts' }];
    const englishLegend = updateMapContentWithMarkers('## Overview\nx', oneMarker as any);
    assert(
      englishLegend.includes('## Legend & Markers') && englishLegend.includes('Linked entry') && !englishLegend.includes('Legende'),
      'a new map legend is written in English when the interface is English'
    );
    const germanLegendDoc = '## Overview\nx\n\n## Legende & Marker\n\n*(Keine Markierungen auf dieser Karte gesetzt)*';
    const keptGerman = updateMapContentWithMarkers(germanLegendDoc, oneMarker as any);
    assert(
      keptGerman.includes('## Legende & Marker') && keptGerman.includes('Verknüpfter Eintrag') && !keptGerman.includes('Legend & Markers'),
      'an existing German map legend keeps its heading and table language'
    );
    assert(
      updateMapContentWithMarkers(englishLegend, [] as any).split('Legend & Markers').length === 2,
      'updating an English legend replaces it rather than adding a second section'
    );
    setGeneratedTextLanguage('de');

    // 11b. False positives found while building the demo vault: option words that are
    //      ordinary prose ("No.") and options far from any mention of the figure.
    const heroTemplateWithYesNo = {
      ...heroTemplateWithRole,
      fieldConfig: {
        ...heroTemplateWithRole.fieldConfig,
        SecretIdentity: { type: 'select' as const, options: ['yes', 'no', 'undecided'] },
      },
    };
    const miraYes: LoreEntity = { ...mira, customFields: { ...mira.customFields, SecretIdentity: 'yes' } };

    const dialogueScene: LoreEntity = {
      id: 'sz-f', title: 'Szene 6', type: 'scene',
      content: '## Manuskript\n[[Mira]] hielt den Atem an.\n\n"No."\n\n"Mira said no," murmured Jonas.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    assert(
      findSceneContradictions(dialogueScene, { 'mira-d': miraYes, 'sz-f': dialogueScene }, [heroTemplateWithYesNo]).length === 0,
      'findSceneContradictions never treats a bare "no" as a claim about a yes/no dossier field, even right next to the name'
    );

    const farAwayScene: LoreEntity = {
      id: 'sz-g', title: 'Szene 7', type: 'scene',
      content: '## Manuskript\n[[Mira]] ging nach Hause. ' + 'Der Abend zog sich hin. '.repeat(20) + 'Irgendwo anders war jemand der Antagonist.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    assert(
      findSceneContradictions(farAwayScene, { 'mira-d': mira, 'sz-g': farAwayScene }, [heroTemplateWithRole]).length === 0,
      'findSceneContradictions ignores an option that appears far from any mention of the figure'
    );

    const firstNameScene: LoreEntity = {
      id: 'sz-h', title: 'Szene 8', type: 'scene',
      content: '## Manuskript\n[[Mira Okafor]] kam an. Mira war hier klar die Antagonist.',
      lastModified: Date.now(), tags: [], relations: [], customFields: {},
    };
    const miraFull: LoreEntity = { ...mira, title: 'Mira Okafor' };
    assert(
      findSceneContradictions(firstNameScene, { 'mira-d': miraFull, 'sz-h': firstNameScene }, [heroTemplateWithRole]).length === 1,
      'findSceneContradictions still catches a real conflict when the scene uses only the first name'
    );

    // 12. aiTidyUp — sorting "Offene Fragen" into other sections, never guessing.
    const bulletDoc =
      '---\nid: "mira"\n---\n## Charakterkern\nSie ist mutig.\n\n## Beziehungen\n\n' +
      '## Geheimnisse\n\n## Offene Fragen\n- Wer ist ihr Vater?\n- Woher kommt die Narbe,\n  und warum spricht niemand darüber?\n- Mag sie Jonas wirklich?\n';

    assert(
      findOpenQuestionsHeader(bulletDoc) === 'Offene Fragen',
      'findOpenQuestionsHeader finds the real header text of a standalone section'
    );
    assert(
      findOpenQuestionsHeader('## Geheimnisse & offene Fragen\nx') === null,
      'findOpenQuestionsHeader does not match a combined heading — nothing here can tell secrets from questions apart'
    );
    assert(
      JSON.stringify(otherSectionHeaders(bulletDoc, 'Offene Fragen')) ===
        JSON.stringify(['Charakterkern', 'Beziehungen', 'Geheimnisse']),
      'otherSectionHeaders lists every other section, excluding Offene Fragen itself'
    );

    const openQuestionsText = extractMarkdownSection(bulletDoc, 'Offene Fragen') || '';
    const points = splitIntoPoints(openQuestionsText);
    assert(
      points.length === 3 && points[1].includes('Narbe') && points[1].includes('warum spricht niemand darüber'),
      'splitIntoPoints keeps one bullet as one point and folds an unindented continuation line into it'
    );

    const paragraphPoints = splitIntoPoints('Wer ist ihr Vater?\n\nMag sie Jonas wirklich?');
    assert(
      paragraphPoints.length === 2,
      'splitIntoPoints falls back to blank-line-separated paragraphs when there are no bullets'
    );
    assert(splitIntoPoints('   \n  ').length === 0, 'splitIntoPoints returns nothing for a blank section');

    const knownSections = otherSectionHeaders(bulletDoc, 'Offene Fragen');
    const goodResponse = '1: Charakterkern\n2: bleibt\n3: Beziehungen';
    const proposals = parseTidyUpResponse(goodResponse, points, knownSections);
    assert(
      proposals.length === 2 &&
        proposals[0].targetSection === 'Charakterkern' && proposals[0].pointIndex === 0 &&
        proposals[1].targetSection === 'Beziehungen' && proposals[1].pointIndex === 2,
      'parseTidyUpResponse resolves valid lines and produces no proposal for an explicit "bleibt"'
    );

    const messyResponse = '1: Charakterkern\nnot a line at all\n2: Nirgendwo\n3: charakterkern\n99: Beziehungen';
    const messyProposals = parseTidyUpResponse(messyResponse, points, knownSections);
    assert(
      messyProposals.length === 2 &&
        messyProposals.every(p => p.targetSection === 'Charakterkern') &&
        messyProposals.some(p => p.pointIndex === 0) && messyProposals.some(p => p.pointIndex === 2),
      'parseTidyUpResponse drops an unparsable line, an unknown section name, and an out-of-range point number, and matches case-insensitively'
    );

    const applied = applyTidyUp(bulletDoc, 'Offene Fragen', openQuestionsText, [proposals[0]]);
    assert(
      applied !== null &&
        applied.includes('## Charakterkern\nSie ist mutig.\n- Wer ist ihr Vater?') &&
        !/## Offene Fragen\n[\s\S]*Wer ist ihr Vater\?/.test(applied),
      'applyTidyUp appends the accepted point to its target section and removes it from Offene Fragen'
    );
    assert(
      applied !== null && applied.includes('Woher kommt die Narbe') && applied.includes('Mag sie Jonas wirklich?'),
      'applyTidyUp leaves every point that was not accepted exactly where it was'
    );

    const staleResult = applyTidyUp(bulletDoc.replace('Mag sie Jonas wirklich?', 'Mag sie Jonas?'), 'Offene Fragen', openQuestionsText, [proposals[0]]);
    assert(
      staleResult === null,
      'applyTidyUp refuses to write when Offene Fragen changed since the proposals were generated, rather than silently merging two diverging versions'
    );

  } catch (err: any) {
    log.push(`❌ EXCEPTION: ${err.message || String(err)}`);
    passed = false;
  }

  return { success: passed, log };
}
