/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { LoreEntity, Template, EntityType } from '../../types';
import { IVaultStorage } from '../../utils/storage/VaultStorage';
import { extractMarkdownSection } from './aiSectionExtractor';

export interface StructuredContextRule {
  source: 'current-entity' | 'field' | 'relation' | 'storyline';
  field?: string;
  targetType?: string;
  includeFrontmatter?: boolean;
  sections?: string[];
}

export type ContextRule = string | StructuredContextRule;

export interface ContextResolverOptions {
  maxCharacterBudget?: number; // Default e.g. 12,000 chars (~3,000 tokens)
}

export interface ResolvedContextBlock {
  source: string;
  entityId: string;
  title: string;
  content: string;
  priority: number;
}

/**
 * Resolves the context rules a template declares in its `.ai.md`, or that a caller
 * passes directly. Enforces strict prioritization and context budgeting.
 */
export class AIContextResolver {
  private storage: IVaultStorage | null;
  private idToFilenameMap: Map<string, string>;
  private entities: Record<string, LoreEntity>;
  private templates: Template[];

  /**
   * `entities` and `templates` are the in-memory vault index and template list the app
   * already holds — passing them in lets relation ranking and type-filtered wikilink
   * lookups run without any file I/O. Both are optional so existing storage-only
   * callers (and the `field:` shorthand, which still reads through `storage`) keep
   * working unchanged.
   */
  constructor(
    storage?: IVaultStorage | null,
    idToFilenameMap?: Map<string, string>,
    entities?: Record<string, LoreEntity>,
    templates?: Template[]
  ) {
    this.storage = storage || null;
    this.idToFilenameMap = idToFilenameMap || new Map();
    this.entities = entities || {};
    this.templates = templates || [];
  }

  /**
   * Resolve context rules for a given entity and list of rules
   */
  async resolveContext(
    currentEntity: LoreEntity,
    currentMarkdown: string,
    rules: ContextRule[],
    options: ContextResolverOptions = {}
  ): Promise<string> {
    const { text } = await this.resolveContextDetailed(currentEntity, currentMarkdown, rules, options);
    return text;
  }

  /**
   * Same resolution, but also reports which entries made it into the budget and which
   * were left out. Dropping a linked dossier silently is the failure this exists to
   * prevent: an author writing an ensemble scene has no way to tell that the AI never
   * saw two of the five figures, and the answer just quietly gets those two wrong.
   */
  async resolveContextDetailed(
    currentEntity: LoreEntity,
    currentMarkdown: string,
    rules: ContextRule[],
    options: ContextResolverOptions = {}
  ): Promise<{ text: string; included: string[]; omitted: string[] }> {
    const budget = options.maxCharacterBudget || 12000;
    const blocks: ResolvedContextBlock[] = [];

    for (const rule of rules) {
      if (typeof rule === 'string') {
        await this.resolveShorthandRule(currentEntity, currentMarkdown, rule, blocks);
      } else {
        await this.resolveStructuredRule(currentEntity, currentMarkdown, rule, blocks);
      }
    }

    // Sort blocks by priority (1 = highest priority)
    blocks.sort((a, b) => a.priority - b.priority);

    // Apply character budget
    let currentLength = 0;
    const selectedBlocks: string[] = [];
    const included: string[] = [];
    const omitted: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (currentLength + block.content.length > budget) {
        // A high-priority block still goes in truncated — losing the entry the request
        // is about would be worse than sending part of it. Everything below that
        // priority is dropped, and every dropped entry is named to the caller.
        const remaining = budget - currentLength;
        if (remaining > 200 && block.priority <= 2) {
          selectedBlocks.push(`--- Kontext: ${block.title} (${block.source}) [Gekürzt] ---\n${block.content.slice(0, remaining)}...`);
          included.push(block.title);
          omitted.push(...blocks.slice(i + 1).map(b => b.title));
        } else {
          omitted.push(...blocks.slice(i).map(b => b.title));
        }
        break;
      }
      selectedBlocks.push(`--- Kontext: ${block.title} (${block.source}) ---\n${block.content}`);
      included.push(block.title);
      currentLength += block.content.length;
    }

    return { text: selectedBlocks.join('\n\n'), included, omitted };
  }

  private async resolveShorthandRule(
    currentEntity: LoreEntity,
    currentMarkdown: string,
    ruleStr: string,
    blocks: ResolvedContextBlock[]
  ): Promise<void> {
    const trimmed = ruleStr.trim();

    if (trimmed === 'current-entity') {
      blocks.push({
        source: 'current-entity',
        entityId: currentEntity.id,
        title: currentEntity.title,
        content: currentMarkdown,
        priority: 1,
      });
      return;
    }

    if (trimmed.startsWith('section:')) {
      const sectionName = trimmed.substring(8).trim();
      const extracted = extractMarkdownSection(currentMarkdown, sectionName);
      if (extracted) {
        blocks.push({
          source: `section:${sectionName}`,
          entityId: currentEntity.id,
          title: `${currentEntity.title} -> ## ${sectionName}`,
          content: `## ${sectionName}\n${extracted}`,
          priority: 2,
        });
      }
      return;
    }

    if (trimmed.startsWith('field:')) {
      const fieldName = trimmed.substring(6).trim();
      const targetVal = currentEntity.customFields?.[fieldName];
      if (targetVal) {
        await this.resolveLinkedEntityByValue(targetVal, fieldName, undefined, blocks, 3);
      }
      return;
    }

    if (trimmed === 'relations') {
      this.pushRelationsList(currentEntity, blocks);
      return;
    }

    if (trimmed === 'relations:important') {
      this.pushRelationsList(currentEntity, blocks);
      this.pushRankedRelationDossiers(currentEntity, blocks, 'important');
      return;
    }

    if (trimmed === 'relations:group-relevant') {
      this.pushRelationsList(currentEntity, blocks);
      this.pushRankedRelationDossiers(currentEntity, blocks, 'group-relevant');
      return;
    }

    if (trimmed === 'lore:relevant') {
      this.pushWikilinked(currentEntity, t => t === 'lore', 'lore:relevant', blocks);
      return;
    }

    if (trimmed === 'storylines:relevant') {
      this.pushWikilinked(currentEntity, t => t === 'storyline', 'storylines:relevant', blocks);
      return;
    }

    if (trimmed === 'books:relevant') {
      this.pushWikilinked(currentEntity, t => t === 'book', 'books:relevant', blocks);
      return;
    }

    // Every dossier the text links to, whatever its category. This is what prose needs:
    // a scene mentions whoever is in it, and the manuscript companion has to know those
    // figures and places without the author wiring up relations first. Manuscript
    // entries are excluded — a linked scene or chapter would blow the budget on its own,
    // and neighbouring scenes are supplied separately as narrative position.
    if (trimmed === 'mentioned:dossiers') {
      this.pushWikilinked(
        currentEntity,
        t => t !== 'scene' && t !== 'chapter' && t !== 'book',
        'mentioned:dossiers',
        blocks
      );
      return;
    }

    // Unreachable through a `.ai.md`-sourced rule: parseAIMdSpec rejects unknown rules
    // at load time already. Kept as a hard failure (not a silent no-op) so a rule
    // built programmatically, bypassing that loader, can't fail invisibly either —
    // exactly the class of bug this file used to have (see AGENTS.md).
    throw new Error(`Unbekannte Kontextregel "${ruleStr}".`);
  }

  /** Appends the compact list of all relations — cheap, so it's never filtered. */
  private pushRelationsList(currentEntity: LoreEntity, blocks: ResolvedContextBlock[]): void {
    if (!currentEntity.relations || currentEntity.relations.length === 0) return;
    const relSummary = currentEntity.relations
      .map(r => `- [[${this.titleFor(r.targetId)}]] (${r.type})`)
      .join('\n');
    blocks.push({
      source: 'relations',
      entityId: currentEntity.id,
      title: `${currentEntity.title} -> Beziehungen`,
      content: `Beziehungen:\n${relSummary}`,
      priority: 4,
    });
  }

  /**
   * Loads the full dossier of a bounded selection of related entities — this is the
   * expensive part, so it's the part the `important`/`group-relevant` suffix actually
   * controls. Requires `entities` to have been passed to the constructor; without it,
   * this degrades to "list only" rather than guessing.
   */
  private pushRankedRelationDossiers(
    currentEntity: LoreEntity,
    blocks: ResolvedContextBlock[],
    strategy: 'important' | 'group-relevant'
  ): void {
    if (!currentEntity.relations || currentEntity.relations.length === 0) return;

    const candidates = currentEntity.relations
      .map(r => this.entities[r.targetId])
      .filter((e): e is LoreEntity => Boolean(e));
    if (candidates.length === 0) return;

    const selected =
      strategy === 'group-relevant'
        ? this.selectGroupRelevant(currentEntity, candidates)
        : this.rankByImportance(currentEntity, candidates).slice(0, 3);

    for (const target of selected) {
      blocks.push({
        source: `relations:${strategy}`,
        entityId: target.id,
        title: `${target.title} (verknüpft)`,
        content: target.content,
        priority: 3,
      });
    }
  }

  private selectGroupRelevant(currentEntity: LoreEntity, candidates: LoreEntity[]): LoreEntity[] {
    const groupRefs = this.extractContextFieldRefs(currentEntity, ['Gruppe', 'Group']);
    return candidates.filter(
      e => e.type === 'organization' || groupRefs.has(e.id) || groupRefs.has(e.title.trim().toLowerCase())
    );
  }

  /**
   * Ranks candidates without any field the app would have to maintain by hand:
   * 1. named in one of the template's own `contextFields` (the author already marked
   *    this as significant when the template was written)
   * 2. mentioned by wikilink in the current entity's own text, most-mentioned first
   * 3. links back to the current entity
   * 4. everything else, in original relation order (Array.sort is stable)
   */
  private rankByImportance(currentEntity: LoreEntity, candidates: LoreEntity[]): LoreEntity[] {
    const contextFieldRefs = this.extractContextFieldRefs(currentEntity, this.contextFieldNames(currentEntity));
    const mentionCounts = this.countWikilinkMentions(currentEntity.content);

    const tierOf = (e: LoreEntity): { tier: number; mentions: number } => {
      if (contextFieldRefs.has(e.id) || contextFieldRefs.has(e.title.trim().toLowerCase())) {
        return { tier: 0, mentions: 0 };
      }
      const mentions = mentionCounts.get(e.title.trim().toLowerCase()) || 0;
      if (mentions > 0) return { tier: 1, mentions };
      if ((e.relations || []).some(r => r.targetId === currentEntity.id)) return { tier: 2, mentions: 0 };
      return { tier: 3, mentions: 0 };
    };

    return candidates
      .map(e => ({ e, ...tierOf(e) }))
      .sort((a, b) => a.tier - b.tier || b.mentions - a.mentions)
      .map(x => x.e);
  }

  /** Resolves wikilinked entities in the current entity's own body, filtered by type. */
  private pushWikilinked(
    currentEntity: LoreEntity,
    accepts: (type: EntityType) => boolean,
    source: string,
    blocks: ResolvedContextBlock[]
  ): void {
    const matches = currentEntity.content.match(/\[\[(.*?)\]\]/g) || [];
    const seen = new Set<string>();
    for (const m of matches) {
      const ref = m.slice(2, -2).split('|')[0].trim();
      if (!ref) continue;
      const target = this.findEntityByTitleOrId(ref);
      if (!target || !accepts(target.type) || seen.has(target.id)) continue;
      seen.add(target.id);
      blocks.push({
        source,
        entityId: target.id,
        title: target.title,
        content: target.content,
        priority: 3,
      });
    }
  }

  private contextFieldNames(entity: LoreEntity): string[] {
    const template = this.templates.find(t => t.type === entity.type);
    return template?.contextFields || [];
  }

  /** Values of the named custom fields, resolved to both their raw ref and entity ID. */
  private extractContextFieldRefs(entity: LoreEntity, fieldNames: string[]): Set<string> {
    const refs = new Set<string>();
    for (const name of fieldNames) {
      const raw = entity.customFields?.[name];
      if (!raw) continue;
      const match = raw.match(/\[\[(.*?)\]\]/);
      const ref = (match ? match[1] : raw).trim().toLowerCase();
      if (!ref) continue;
      refs.add(ref);
      const resolved = this.findEntityByTitleOrId(ref);
      if (resolved) refs.add(resolved.id);
    }
    return refs;
  }

  private countWikilinkMentions(content: string): Map<string, number> {
    const counts = new Map<string, number>();
    const matches = content.match(/\[\[(.*?)\]\]/g) || [];
    for (const m of matches) {
      const target = m.slice(2, -2).split('|')[0].trim().toLowerCase();
      if (!target) continue;
      counts.set(target, (counts.get(target) || 0) + 1);
    }
    return counts;
  }

  private findEntityByTitleOrId(ref: string): LoreEntity | undefined {
    const key = ref.trim();
    if (!key) return undefined;
    if (this.entities[key]) return this.entities[key];
    const lowerKey = key.toLowerCase();
    return Object.values(this.entities).find(
      e => e.title.trim().toLowerCase() === lowerKey || e.id.toLowerCase() === lowerKey
    );
  }

  private titleFor(id: string): string {
    return this.entities[id]?.title || id;
  }

  private async resolveStructuredRule(
    currentEntity: LoreEntity,
    currentMarkdown: string,
    rule: StructuredContextRule,
    blocks: ResolvedContextBlock[]
  ): Promise<void> {
    if (rule.source === 'current-entity') {
      if (rule.sections && rule.sections.length > 0) {
        const extractedSections: string[] = [];
        for (const sec of rule.sections) {
          const content = extractMarkdownSection(currentMarkdown, sec);
          if (content) {
            extractedSections.push(`## ${sec}\n${content}`);
          }
        }
        if (extractedSections.length > 0) {
          blocks.push({
            source: 'current-entity:sections',
            entityId: currentEntity.id,
            title: `${currentEntity.title} (${rule.sections.join(', ')})`,
            content: extractedSections.join('\n\n'),
            priority: 1,
          });
        }
      } else {
        blocks.push({
          source: 'current-entity',
          entityId: currentEntity.id,
          title: currentEntity.title,
          content: currentMarkdown,
          priority: 1,
        });
      }
      return;
    }

    if (rule.source === 'field' && rule.field) {
      const targetVal = currentEntity.customFields?.[rule.field];
      if (targetVal) {
        await this.resolveLinkedEntityByValue(targetVal, rule.field, rule.sections, blocks, 3);
      }
    }
  }

  private async resolveLinkedEntityByValue(
    valueStr: string,
    fieldName: string,
    filterSections: string[] | undefined,
    blocks: ResolvedContextBlock[],
    priority: number
  ): Promise<void> {
    // Extract target ID from WikiLink syntax e.g. [[Ilka - Kräfte]] or plain title
    const match = valueStr.match(/\[\[(.*?)\]\]/) || [null, valueStr];
    const targetRef = match[1]?.trim();
    if (!targetRef) return;

    if (this.storage) {
      // Find filename from in-memory index or try targetRef.md
      const filename = this.idToFilenameMap.get(targetRef) || `${targetRef}.md`;
      try {
        const content = await this.storage.readFile(filename);
        if (content) {
          if (filterSections && filterSections.length > 0) {
            const extractedSections: string[] = [];
            for (const sec of filterSections) {
              const secContent = extractMarkdownSection(content, sec);
              if (secContent) {
                extractedSections.push(`## ${sec}\n${secContent}`);
              }
            }
            if (extractedSections.length > 0) {
              blocks.push({
                source: `field:${fieldName}`,
                entityId: targetRef,
                title: `${targetRef} (Feld ${fieldName})`,
                content: extractedSections.join('\n\n'),
                priority,
              });
            }
          } else {
            blocks.push({
              source: `field:${fieldName}`,
              entityId: targetRef,
              title: `${targetRef} (Feld ${fieldName})`,
              content,
              priority,
            });
          }
        }
      } catch {
        // Linked file not found on disk, skip silently
      }
    }
  }
}
