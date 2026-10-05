/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState, useCallback } from 'react';
import { LoreEntity } from '../types';
import { Language } from '../utils/i18n';
import { getStorage } from '../utils/storage';
import { IVaultStorage } from '../utils/storage/VaultStorage';
import {
  findOpenQuestionsHeader,
  otherSectionHeaders,
  splitIntoPoints,
  parseTidyUpResponse,
  applyTidyUp,
  TidyUpProposal,
} from '../ai/engine/aiTidyUp';
import { extractMarkdownSection } from '../ai/engine/aiSectionExtractor';
import { composePrompt } from '../ai/engine/aiPromptComposer';
import { AIContextResolver } from '../ai/engine/aiContextResolver';
import {
  resolveAgentsPrompt,
  resolveSoulPrompt,
  resolveProjectPrompt,
  DEFAULT_AGENTS_PROMPT,
  DEFAULT_SOUL_PROMPT,
  DEFAULT_PROJECT_PROMPT,
} from '../ai/engine/aiResolver';
import { getContextBudget } from '../utils/aiSettings';
import { generateAiRequestId, cancelAiRequest, isAiRequestCancelled } from '../utils/aiCancellation';

function tryGetStorage(): IVaultStorage | null {
  try {
    return getStorage();
  } catch {
    return null;
  }
}

export interface TidyUpApi {
  /** Whether this entity even has a standalone "Offene Fragen"/"Open Questions" section
   *  to work on — the trigger button only shows when this is true. */
  isAvailable: boolean;
  isGenerating: boolean;
  errorMsg: string;
  /** Null until a proposal run has completed. */
  proposals: TidyUpProposal[] | null;
  /** Which proposals are currently checked for the next "Anwenden". Keyed by pointIndex. */
  acceptedIndexes: Set<number>;
  toggleAccepted: (pointIndex: number) => void;
  generate: () => Promise<void>;
  cancel: () => void;
  /** Writes the accepted proposals, or false if the section changed since they were
   *  generated — the caller should show that as "please regenerate", not as an error. */
  apply: () => boolean;
  discard: () => void;
}

export interface UseEntityTidyUpParams {
  activeEntity?: LoreEntity;
  language: Language;
  onApply: (newContent: string) => void;
}

/**
 * Orchestrates the "tidy up this entry" action: one model call that classifies each point
 * under "Offene Fragen" against the entity's own other sections, strictly validated
 * (`parseTidyUpResponse`), reviewed by the author, and written in one go (`applyTidyUp`).
 *
 * Deliberately a single round trip, not one call per point — a local model answering many
 * small requests in sequence is exactly what made the manuscript companion "ewig rattern"
 * in testing; cancellable for the same reason.
 */
export function useEntityTidyUp({ activeEntity, language, onApply }: UseEntityTidyUpParams): TidyUpApi {
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [proposals, setProposals] = useState<TidyUpProposal[] | null>(null);
  const [acceptedIndexes, setAcceptedIndexes] = useState<Set<number>>(new Set());
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  // Captured at generation time so `apply()` can detect whether the section moved on
  // since — see aiTidyUp.ts's applyTidyUp for why that blocks the write rather than
  // merging two diverging versions.
  const [capturedOpenQuestionsText, setCapturedOpenQuestionsText] = useState<string | null>(null);
  const [capturedHeader, setCapturedHeader] = useState<string | null>(null);

  const openQuestionsHeader = activeEntity ? findOpenQuestionsHeader(activeEntity.content) : null;
  const isAvailable = Boolean(
    openQuestionsHeader && (extractMarkdownSection(activeEntity!.content, openQuestionsHeader) || '').trim()
  );

  const discard = useCallback(() => {
    setProposals(null);
    setAcceptedIndexes(new Set());
    setCapturedOpenQuestionsText(null);
    setCapturedHeader(null);
    setErrorMsg('');
  }, []);

  const toggleAccepted = useCallback((pointIndex: number) => {
    setAcceptedIndexes(prev => {
      const next = new Set(prev);
      if (next.has(pointIndex)) next.delete(pointIndex);
      else next.add(pointIndex);
      return next;
    });
  }, []);

  const generate = useCallback(async () => {
    if (!activeEntity || !openQuestionsHeader || isGenerating) return;
    const header = openQuestionsHeader;
    const sectionText = (extractMarkdownSection(activeEntity.content, header) || '').trim();
    const points = splitIntoPoints(sectionText);
    if (points.length === 0) return;

    const knownSections = otherSectionHeaders(activeEntity.content, header);
    const requestId = generateAiRequestId();
    setIsGenerating(true);
    setErrorMsg('');
    setActiveRequestId(requestId);

    try {
      const storage = tryGetStorage();
      const [agentsPrompt, soulPrompt, projectPrompt] = await Promise.all([
        resolveAgentsPrompt(storage, DEFAULT_AGENTS_PROMPT),
        resolveSoulPrompt(storage, DEFAULT_SOUL_PROMPT),
        resolveProjectPrompt(storage, DEFAULT_PROJECT_PROMPT),
      ]);

      const contextResolver = new AIContextResolver(storage, undefined, {});
      const resolvedContext = await contextResolver.resolveContext(
        activeEntity,
        activeEntity.content,
        ['current-entity'],
        { maxCharacterBudget: getContextBudget() }
      );

      const instruction =
        language === 'en'
          ? [
              `The following points are currently under "## ${header}" in this entry.`,
              `Assign each point to exactly one of the existing sections below, but only if it clearly belongs there — otherwise it stays.`,
              ``,
              `Existing sections: ${knownSections.join(', ')}`,
              ``,
              `Points:`,
              ...points.map((p, i) => `${i + 1}. ${p}`),
              ``,
              `Answer with exactly one line per point, in the form "<number>: <section name>" or "<number>: stays". Use section names exactly as listed above, nothing else. No other text.`,
            ].join('\n')
          : [
              `Die folgenden Punkte stehen aktuell unter „## ${header}" in diesem Eintrag.`,
              `Ordne jeden Punkt genau einem der vorhandenen Abschnitte zu, aber nur wenn er eindeutig dorthin gehört — sonst bleibt er, wo er ist.`,
              ``,
              `Vorhandene Abschnitte: ${knownSections.join(', ')}`,
              ``,
              `Punkte:`,
              ...points.map((p, i) => `${i + 1}. ${p}`),
              ``,
              `Antworte mit genau einer Zeile pro Punkt, im Format "<Nummer>: <Abschnittsname>" oder "<Nummer>: bleibt". Nenne nur Abschnittsnamen genau wie oben aufgeführt, sonst nichts.`,
            ].join('\n');

      const composed = composePrompt({
        agentsPrompt,
        soulPrompt,
        projectPrompt,
        resolvedContext,
        userMessage: instruction,
        mode: 'structured',
      });

      const provider = localStorage.getItem('aiProvider') || 'lmstudio';
      const baseUrl = localStorage.getItem('aiBaseUrl') || 'http://127.0.0.1:1234/v1';
      const model = localStorage.getItem('aiModel') || 'local-model';

      if (typeof (window as any).vault?.aiChat !== 'function') {
        throw new Error(
          language === 'en'
            ? 'AI functionality is currently unavailable in this environment.'
            : 'Die KI-Funktion ist in dieser Umgebung derzeit nicht verfügbar.'
        );
      }

      const messages = [
        { role: 'system', content: composed.systemPrompt },
        { role: 'user', content: composed.userPrompt },
      ];

      const raw = await (window as any).vault.aiChat(
        provider, baseUrl, model, messages, composed.recommendedTemperature, requestId
      );
      if (!raw) {
        throw new Error(
          language === 'en' ? 'Empty response from AI server' : 'Leere Antwort vom KI-Server erhalten'
        );
      }

      const parsed = parseTidyUpResponse(raw, points, knownSections);
      setProposals(parsed);
      setAcceptedIndexes(new Set(parsed.map(p => p.pointIndex)));
      setCapturedOpenQuestionsText(sectionText);
      setCapturedHeader(header);
    } catch (err: any) {
      if (isAiRequestCancelled(err)) {
        // Deliberate Stop — nothing to show, just stop waiting.
      } else {
        console.error(err);
        setErrorMsg(
          err.message ||
            (language === 'en'
              ? 'Communication with the AI server failed.'
              : 'Kommunikation mit dem KI-Server fehlgeschlagen.')
        );
      }
    } finally {
      setIsGenerating(false);
      setActiveRequestId(null);
    }
  }, [activeEntity, openQuestionsHeader, isGenerating, language]);

  const cancel = useCallback(() => {
    if (!activeRequestId) return;
    cancelAiRequest(activeRequestId);
    setIsGenerating(false);
    setActiveRequestId(null);
  }, [activeRequestId]);

  const apply = useCallback((): boolean => {
    if (!activeEntity || !proposals || !capturedHeader || capturedOpenQuestionsText === null) return false;
    const accepted = proposals.filter(p => acceptedIndexes.has(p.pointIndex));
    if (accepted.length === 0) {
      discard();
      return true;
    }

    const newContent = applyTidyUp(activeEntity.content, capturedHeader, capturedOpenQuestionsText, accepted);
    if (newContent === null) {
      // The section changed since these proposals were generated — never silently merge
      // two diverging versions. Proposals stay on screen so "generate" can be run again
      // against the current text instead of discarding the review outright.
      setErrorMsg(
        language === 'en'
          ? 'Offene Fragen changed since these proposals were made. Generate again to refresh them.'
          : 'Offene Fragen hat sich seit diesen Vorschlägen geändert. Neu vorschlagen, um sie zu aktualisieren.'
      );
      return false;
    }

    onApply(newContent);
    discard();
    return true;
  }, [activeEntity, proposals, capturedHeader, capturedOpenQuestionsText, acceptedIndexes, onApply, discard, language]);

  return {
    isAvailable,
    isGenerating,
    errorMsg,
    proposals,
    acceptedIndexes,
    toggleAccepted,
    generate,
    cancel,
    apply,
    discard,
  };
}
