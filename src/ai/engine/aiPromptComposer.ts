/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { AIMdSpec } from './aiFrontmatterParser';

export interface ComposePromptParams {
  agentsPrompt: string;
  soulPrompt?: string;
  projectPrompt?: string;
  aiMdSpec?: AIMdSpec | null;
  resolvedContext: string;
  userMessage?: string;
  /**
   * The `##` section a dossier answer is destined for. Also selects the working mode
   * when `mode` is not given, since `.ai.md` configures mode per section.
   */
  targetSectionHeader?: string;
  /**
   * Working mode chosen by the caller — the manuscript companion picks one per role
   * (`muse` to write along, `analytical` to critique) rather than per section.
   * Overrides whatever the target section's `.ai.md` entry would have selected.
   */
  mode?: string;
  /** Overrides the creativity level that would otherwise come from `.ai.md`. */
  creativity?: 'low' | 'medium' | 'high';
}

export interface ComposedPromptResult {
  systemPrompt: string;
  userPrompt: string;
  recommendedMode: string;
  recommendedTemperature: number;
}

/**
 * Maps AI Modes to semantic prompt instructions and recommended local LLM temperatures.
 */
export function getModeSemanticConfig(mode: string, creativity: string = 'medium'): { instruction: string; temperature: number } {
  let temp = 0.7;
  if (creativity === 'low') temp = 0.3;
  if (creativity === 'high') temp = 0.9;

  switch (mode) {
    case 'collaborative':
      return {
        instruction: 'Arbeite als einfühlsamer Sparringspartner. Stelle Fragen, mache konkrete Vorschläge und erstelle strukturierte Entwürfe.',
        temperature: temp,
      };
    case 'muse':
      return {
        instruction: 'Sei eine inspirierende kreative Quelle. Biete unerwartete Ideen, bildhafte Metaphern und tiefere emotionale Perspektiven.',
        temperature: Math.max(temp, 0.8),
      };
    case 'canon-sensitive':
      return {
        instruction: 'Achte streng auf Konsistenz mit dem bestehenden Projektkanon. Identifiziere Widersprüche und halte dich exakt an gesetzte Regeln.',
        temperature: 0.2,
      };
    case 'structured':
      return {
        instruction: 'Fokussiere dich auf klare Gliederungen, präzise Aufzählungspunkte und wohlgeordnete Markdown-Strukturen.',
        temperature: 0.3,
      };
    case 'analytical':
      return {
        instruction: 'Analysiere den Text kritisch auf Plot-Lücken, Charakter-Motivationen, Logik und Schreibstil.',
        temperature: 0.2,
      };
    default:
      return {
        instruction: 'Unterstütze den Autor präzise und partnerschaftlich.',
        temperature: temp,
      };
  }
}

/**
 * Composes the layered system prompt sent to LM Studio / Ollama. Each layer is
 * optional except the constitution, and the layers stack from most general to most
 * specific: constitution, conversational style, project orientation, template
 * instructions, working mode, resolved context.
 *
 * The reply is expected to be ordinary prose. There is deliberately no structured
 * action contract here: forcing a local model into a strict JSON shape and rejecting
 * whatever missed it is what made the removed guided mode read as if it were
 * rejecting the *user's* input, when it was really rejecting the *model's* format.
 */
export function composePrompt(params: ComposePromptParams): ComposedPromptResult {
  const {
    agentsPrompt,
    soulPrompt,
    projectPrompt,
    aiMdSpec,
    resolvedContext,
    userMessage,
    targetSectionHeader,
    mode: explicitMode,
    creativity: explicitCreativity,
  } = params;

  const sectionSpec = targetSectionHeader ? aiMdSpec?.sections[targetSectionHeader] : undefined;
  const mode = explicitMode || sectionSpec?.mode || 'collaborative';
  const creativity = explicitCreativity || sectionSpec?.creativity || 'medium';
  const modeConfig = getModeSemanticConfig(mode, creativity);

  const parts: string[] = [];

  // Layer 1: Globale Verfassung (AGENTS.md)
  parts.push(`=== VERFASSUNG (AGENTS.md) ===
${agentsPrompt.trim()}`);

  // Layer 2: Persönlichkeit & Gesprächsstil (SOUL.md)
  if (soulPrompt && soulPrompt.trim()) {
    parts.push(`=== GESPRÄCHSSTIL (SOUL.md) ===
${soulPrompt.trim()}`);
  }

  // Layer 3: Vault-Orientierung (PROJECT.md)
  if (projectPrompt && projectPrompt.trim()) {
    parts.push(`=== PROJEKT-ORIENTIERUNG (PROJECT.md) ===
${projectPrompt.trim()}`);
  }

  // Layer 4: Template KI-Anweisungen (.ai.md)
  if (aiMdSpec && aiMdSpec.instructionsPrompt) {
    parts.push(`=== TEMPLATE KI-ANWEISUNG (${aiMdSpec.templateId}) ===
${aiMdSpec.instructionsPrompt.trim()}`);
  }

  // Layer 5: Aktiver Arbeitsmodus
  parts.push(`=== ARBEITSMODUS (${mode.toUpperCase()}) ===
${modeConfig.instruction}`);

  // Layer 6: Aufgelöster Projekt-Kontext
  if (resolvedContext && resolvedContext.trim()) {
    parts.push(`=== PROJEKT-KONTEXT ===
${resolvedContext.trim()}`);
  }

  let finalUserMessage = userMessage || '';
  if (targetSectionHeader) {
    finalUserMessage = `[Zielabschnitt: ## ${targetSectionHeader}]
${finalUserMessage}`;
  }

  return {
    systemPrompt: parts.join('\n\n'),
    userPrompt: finalUserMessage.trim(),
    recommendedMode: mode,
    recommendedTemperature: modeConfig.temperature,
  };
}
