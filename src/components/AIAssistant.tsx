/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState, useRef, useEffect } from 'react';
import { LoreEntity, Template } from '../types';
import { Sparkles, Send, Check, X, ListChecks, RotateCcw, Square } from 'lucide-react';
import { Language } from '../utils/i18n';
import { resolveTemplateForEntity, findDossierGaps, templateSectionHeaders } from '../utils/templateMatching';
import { parseMarkdownSections, extractMarkdownSection } from '../ai/engine/aiSectionExtractor';
import { RightPanelTabBar } from './RightPanelTabBar';
import { getStorage } from '../utils/storage';
import { IVaultStorage } from '../utils/storage/VaultStorage';
import { loadDossierDrafts, saveDossierDrafts, trimExchangesToBudget, StoredDossierDraft, ChatExchange } from '../utils/chatDraftStore';
import {
  resolveAgentsPrompt,
  resolveSoulPrompt,
  resolveProjectPrompt,
  DEFAULT_AGENTS_PROMPT,
  DEFAULT_SOUL_PROMPT,
  DEFAULT_PROJECT_PROMPT,
} from '../ai/engine/aiResolver';
import { composePrompt } from '../ai/engine/aiPromptComposer';
import { AIContextResolver } from '../ai/engine/aiContextResolver';
import { getContextBudget } from '../utils/aiSettings';
import { generateAiRequestId, cancelAiRequest, isAiRequestCancelled } from '../utils/aiCancellation';
import { useEntityTidyUp } from '../hooks/useEntityTidyUp';
import TidyUpProposalList from './ai/TidyUpProposalList';

interface AIAssistantProps {
  activeEntity?: LoreEntity;
  entities?: Record<string, LoreEntity>;
  templates: Template[];
  onApplySection: (sectionHeader: string, content: string, mode: 'replace' | 'append') => void;
  onApplyTidyUp: (newContent: string) => void;
  language: Language;
  rightPanelTab: 'ai' | 'media' | 'stats';
  onTabChange: (tab: 'ai' | 'media' | 'stats') => void;
  onToggleCollapse?: () => void;
}

/** Best-effort storage lookup: returns null instead of throwing outside Electron. */
function tryGetStorage(): IVaultStorage | null {
  try {
    return getStorage();
  } catch {
    return null;
  }
}

/**
 * In-progress freeform chat state for one entry: what's typed, which section it
 * targets, the AI's last reply, and whether a request is in flight for it. Kept
 * separate per entity ID (see `draftsByEntity` below) so glancing at another entry
 * and coming back doesn't lose an unsent message or an unapplied proposal — only
 * applying or discarding it does.
 *
 * `exchanges` is the live memory of the current section's back-and-forth — enough for
 * "change the first point" to have something concrete to work from. It is
 * deliberately *not* persisted to disk (only the latest chatPrompt/targetSection/
 * aiResponse are, via StoredDossierDraft) and resets whenever the target section
 * changes: the section is the topic, and moving to a different one is the natural
 * point to forget the old thread rather than carrying it along by accident.
 */
interface FreeformDraft {
  chatPrompt: string;
  targetSection: string;
  aiResponse: string;
  isGenerating: boolean;
  errorMsg: string;
  exchanges: ChatExchange[];
  /** Set only while a request is in flight — what cancelling aborts and what the typed
   *  message gets restored from. */
  activeRequestId: string | null;
  inFlightPrompt: string;
}

const EMPTY_DRAFT: FreeformDraft = {
  chatPrompt: '',
  targetSection: '',
  aiResponse: '',
  isGenerating: false,
  errorMsg: '',
  exchanges: [],
  activeRequestId: null,
  inFlightPrompt: '',
};

export default function AIAssistant({
  activeEntity,
  entities = {},
  templates,
  onApplySection,
  onApplyTidyUp,
  language,
  rightPanelTab,
  onTabChange,
  onToggleCollapse,
}: AIAssistantProps) {
  // One freeform draft per entity, so switching to another entry to check something
  // and coming back finds the message, chosen section, and any unapplied AI reply
  // exactly as they were. Persisted to `.tessarios/freeform-drafts.json` — see below —
  // so it also survives closing the app; only isGenerating/errorMsg are session-only.
  const [draftsByEntity, setDraftsByEntity] = useState<Record<string, FreeformDraft>>({});
  const entityId = activeEntity?.id || '';
  const draft = draftsByEntity[entityId] || EMPTY_DRAFT;

  /** Patches a specific entity's draft — always by explicit id, never "whichever
   *  entity happens to be active right now", so a reply that arrives after the user
   *  has already switched entries still lands on the one that asked for it. */
  const patchDraft = (id: string, patch: Partial<FreeformDraft>) => {
    if (!id) return;
    setDraftsByEntity(prev => ({ ...prev, [id]: { ...(prev[id] || EMPTY_DRAFT), ...patch } }));
  };

  const setChatPrompt = (v: string) => patchDraft(entityId, { chatPrompt: v });
  const setAiResponse = (v: string) => patchDraft(entityId, { aiResponse: v });

  /** Switching sections switches topics — the running exchange memory doesn't follow. */
  const setTargetSection = (v: string) =>
    patchDraft(entityId, { targetSection: v, aiResponse: '', exchanges: [] });

  const { chatPrompt, aiResponse, targetSection, isGenerating: isGeneratingText, errorMsg } = draft;
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Load once on mount: hydrate every entity's draft from disk before the user can
  // touch anything.
  const draftsLoadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadDossierDrafts(tryGetStorage());
      if (cancelled) return;
      setDraftsByEntity(prev => {
        const merged = { ...prev };
        for (const [id, saved] of Object.entries(stored)) {
          merged[id] = { ...EMPTY_DRAFT, ...saved, ...(merged[id] || {}) };
        }
        return merged;
      });
      draftsLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change, debounced: a draft is small and low-stakes compared to entity
  // content, so — unlike the entity backup throttle in useEntityCrud.ts — waiting for
  // a pause in typing (rather than checkpointing during it) is the better trade here.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draftsLoadedRef.current) return; // don't overwrite disk with the pre-load empty state
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const toPersist: Record<string, StoredDossierDraft> = {};
      for (const [id, d] of Object.entries(draftsByEntity)) {
        toPersist[id] = { chatPrompt: d.chatPrompt, targetSection: d.targetSection, aiResponse: d.aiResponse };
      }
      saveDossierDrafts(tryGetStorage(), toPersist);
    }, 1200);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [draftsByEntity]);

  /** Clears this entity's draft immediately — in memory and on disk, no debounce. */
  const handleResetDraft = () => {
    if (!entityId) return;
    setDraftsByEntity(prev => {
      const next = { ...prev };
      delete next[entityId];
      const toPersist: Record<string, StoredDossierDraft> = {};
      for (const [id, d] of Object.entries(next)) {
        toPersist[id] = { chatPrompt: d.chatPrompt, targetSection: d.targetSection, aiResponse: d.aiResponse };
      }
      saveDossierDrafts(tryGetStorage(), toPersist);
      return next;
    });
  };

  // What is still missing in this dossier — computed once here so both the gap
  // summary and the section dropdown below can use it.
  const activeTemplate = activeEntity ? resolveTemplateForEntity(activeEntity, templates) : undefined;
  const gaps = activeEntity && activeTemplate ? findDossierGaps(activeEntity, activeTemplate) : null;

  // Every section the freeform chat could target: the template's own list where one
  // resolves, otherwise whatever `##` headings the entry actually has. Freeform chat
  // always writes into exactly one of these — never the whole document — so this list
  // is never empty in practice (every template ships at least a few sections).
  const sectionOptions = activeEntity
    ? activeTemplate
      ? templateSectionHeaders(activeTemplate)
      : parseMarkdownSections(activeEntity.content).map(s => s.header)
    : [];

  useEffect(() => {
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
      const scrollH = chatTextareaRef.current.scrollHeight;
      chatTextareaRef.current.style.height = `${Math.min(Math.max(scrollH, 40), 220)}px`;
    }
  }, [chatPrompt]);

  const handleAskAI = async (customPrompt?: string) => {
    const promptToSend = customPrompt || chatPrompt;
    if (!promptToSend.trim()) return;
    // A message about a dossier always has a named destination — otherwise there is
    // nothing sensible to apply once the model answers.
    if (sectionOptions.length > 0 && !targetSection) return;

    // Captured once, up front: if the user switches to another entry while this
    // request is in flight, the reply must still land on the entry that asked for
    // it, not on whatever happens to be on screen when the response arrives.
    const requestEntityId = entityId;
    const requestEntity = activeEntity;
    const requestTargetSection = targetSection;
    const requestExchanges = draft.exchanges;
    const requestId = generateAiRequestId();

    patchDraft(requestEntityId, {
      isGenerating: true,
      aiResponse: '',
      errorMsg: '',
      chatPrompt: '',
      activeRequestId: requestId,
      inFlightPrompt: promptToSend,
    });

    try {
      const storage = tryGetStorage();

      // Layers 1–3: constitution, conversational style, project orientation. Each
      // prefers a per-vault override (.tessarios/*.md) over the built-in fallback —
      // see aiResolver.ts. This replaces the old hardcoded, genre-fixed prompt that
      // told every chat it was writing a children's superhero book regardless of the
      // actual project.
      const [agentsPrompt, soulPrompt, projectPrompt] = await Promise.all([
        resolveAgentsPrompt(storage, DEFAULT_AGENTS_PROMPT),
        resolveSoulPrompt(storage, DEFAULT_SOUL_PROMPT),
        resolveProjectPrompt(storage, DEFAULT_PROJECT_PROMPT),
      ]);

      // Bounded context for the active entity instead of a full vault dump: the entry
      // itself plus what it links to, capped by a character budget.
      let resolvedContext = '';
      if (requestEntity) {
        const contextResolver = new AIContextResolver(storage, undefined, entities);
        resolvedContext = await contextResolver.resolveContext(
          requestEntity,
          requestEntity.content,
          ['current-entity', 'relations'],
          { maxCharacterBudget: getContextBudget() }
        );
      }

      const composed = composePrompt({
        agentsPrompt,
        soulPrompt,
        projectPrompt,
        resolvedContext,
        userMessage: promptToSend,
        targetSectionHeader: requestTargetSection || undefined,
      });

      const provider = localStorage.getItem('aiProvider') || 'lmstudio';
      const baseUrl = localStorage.getItem('aiBaseUrl') || 'http://127.0.0.1:1234/v1';
      const model = localStorage.getItem('aiModel') || 'local-model';

      // The current section's prior rounds go along, so "change the first point" has
      // something to point at — trimmed to a character budget, oldest first.
      const priorTurns = trimExchangesToBudget(requestExchanges).flatMap(ex => [
        { role: 'user', content: ex.prompt },
        { role: 'assistant', content: ex.reply },
      ]);

      const messages = [
        { role: 'system', content: composed.systemPrompt },
        ...priorTurns,
        { role: 'user', content: composed.userPrompt },
      ];

      if (typeof (window as any).vault?.aiChat !== 'function') {
        throw new Error(language === 'en'
          ? 'AI functionality is currently unavailable in this environment.'
          : 'Die KI-Funktion ist in dieser Umgebung derzeit nicht verfügbar.');
      }

      // The target section's `.ai.md` mode decides the temperature — a canon-sensitive
      // section should not be answered as loosely as a muse-mode one.
      const responseText = await (window as any).vault.aiChat(
        provider, baseUrl, model, messages, composed.recommendedTemperature, requestId
      );

      if (!responseText) {
        throw new Error(language === 'en'
          ? 'Empty response from AI server'
          : 'Leere Antwort vom KI-Server erhalten');
      }

      // Functional update: reads the freshest exchanges for this entity rather than a
      // closure snapshot, in case something else patched the draft while this request
      // was in flight.
      setDraftsByEntity(prev => {
        const existing = prev[requestEntityId] || EMPTY_DRAFT;
        return {
          ...prev,
          [requestEntityId]: {
            ...existing,
            aiResponse: responseText,
            isGenerating: false,
            activeRequestId: null,
            inFlightPrompt: '',
            exchanges: trimExchangesToBudget([...existing.exchanges, { prompt: promptToSend, reply: responseText }]),
          },
        };
      });
    } catch (err: any) {
      // A deliberate Stop click: handleCancelAsk already reset isGenerating and restored
      // the typed message, so there is nothing left to do here except not overwrite that
      // with an error banner.
      if (isAiRequestCancelled(err)) return;

      console.error(err);
      patchDraft(requestEntityId, {
        errorMsg: err.message || (language === 'en' ? 'Communication with the AI server failed.' : 'Kommunikation mit dem KI-Server fehlgeschlagen.'),
        isGenerating: false,
        activeRequestId: null,
        inFlightPrompt: '',
      });
    }
  };

  const handleCancelAsk = () => {
    if (!draft.activeRequestId) return;
    cancelAiRequest(draft.activeRequestId);
    patchDraft(entityId, {
      isGenerating: false,
      activeRequestId: null,
      chatPrompt: draft.chatPrompt || draft.inFlightPrompt,
      inFlightPrompt: '',
    });
  };

  /** Writes the AI's answer into exactly the section the conversation targeted. */
  const handleApplyToSection = (mode: 'replace' | 'append') => {
    if (!aiResponse || !targetSection) return;
    onApplySection(targetSection, aiResponse, mode);
    setAiResponse('');
  };

  const existingSectionContent =
    activeEntity && targetSection ? extractMarkdownSection(activeEntity.content, targetSection) : null;

  const gapSummary = gaps
    ? [
        gaps.emptyFields.length > 0
          ? `${gaps.emptyFields.length} ${
              language === 'en'
                ? gaps.emptyFields.length === 1 ? 'field open' : 'fields open'
                : gaps.emptyFields.length === 1 ? 'Feld offen' : 'Felder offen'
            }`
          : null,
        gaps.emptySections.length > 0
          ? `${gaps.emptySections.length} ${
              language === 'en'
                ? gaps.emptySections.length === 1 ? 'section empty' : 'sections empty'
                : gaps.emptySections.length === 1 ? 'Abschnitt leer' : 'Abschnitte leer'
            }`
          : null,
      ].filter(Boolean).join(' · ')
    : '';

  const tidyUp = useEntityTidyUp({ activeEntity, language, onApply: onApplyTidyUp });

  return (
    <div className="flex flex-col h-full bg-surface-card border border-line rounded-xl overflow-hidden" id="ai-assistant-container">
      <RightPanelTabBar
        rightPanelTab={rightPanelTab}
        onTabChange={onTabChange}
        language={language}
        onToggleCollapse={onToggleCollapse}
      />

      {/* Main Panel Body - Scrollable message & suggestion content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Error notice */}
        {errorMsg && (
          <div className="p-3 bg-danger-surface border border-rose-900/60 text-rose-300 text-xs font-mono rounded-lg shrink-0">
            {errorMsg}
          </div>
        )}

        {/* What the template still expects — information only, nothing to start here.
            Fields and links are quicker to fill in by hand than to talk through. */}
        {gapSummary && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface-base border border-line">
            <ListChecks className="h-4 w-4 text-ink-muted shrink-0" />
            <span className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-ink-heading">
                {language === 'en' ? 'Still missing here' : 'Hier fehlt noch'}
              </span>
              <span className="text-[10px] font-mono text-ink-muted truncate">{gapSummary}</span>
            </span>
          </div>
        )}

        {/* "Tidy up this entry" — a separate, explicitly triggered step, not something the
            free chat does on its own: the destination a reply writes to is always the
            dropdown below, never a guess. This only sorts what already piled up under
            Offene Fragen, after review. */}
        {tidyUp.isAvailable && !tidyUp.proposals && !tidyUp.isGenerating && (
          <button
            type="button"
            onClick={tidyUp.generate}
            className="shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface-base border border-line hover:border-indigo-500 transition cursor-pointer text-left"
          >
            <Sparkles className="h-4 w-4 text-indigo-400 shrink-0" />
            <span className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-ink-heading">
                {language === 'en' ? 'Tidy up entry' : 'Eintrag aufräumen'}
              </span>
              <span className="text-[10px] font-mono text-ink-muted truncate">
                {language === 'en'
                  ? 'Sort Open Questions into better-fitting sections'
                  : 'Offene Fragen in besser passende Abschnitte einsortieren'}
              </span>
            </span>
          </button>
        )}

        {tidyUp.isGenerating && (
          <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-surface-base border border-line text-[11px] font-mono text-ink-muted">
            <span className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
              {language === 'en' ? 'Sorting…' : 'Sortiert…'}
            </span>
            <button
              type="button"
              onClick={tidyUp.cancel}
              className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-control hover:bg-rose-950/40 hover:border-rose-800/60 hover:text-rose-300 text-ink-secondary transition cursor-pointer"
            >
              <Square className="h-3 w-3" />
              {language === 'en' ? 'Stop' : 'Abbrechen'}
            </button>
          </div>
        )}

        {tidyUp.errorMsg && !tidyUp.proposals && (
          <div className="p-3 bg-danger-surface border border-rose-900/60 text-rose-300 text-xs font-mono rounded-lg shrink-0">
            {tidyUp.errorMsg}
          </div>
        )}

        {tidyUp.proposals && (
          <TidyUpProposalList api={tidyUp} language={language} />
        )}

        {/* AI proposal — a specific section, shown against what's there today.
            Nothing reaches the file until Übernehmen/Anhängen is clicked. */}
        {aiResponse && targetSection && (
          <div className="border border-indigo-700/70 bg-surface-elevated rounded-lg overflow-hidden shrink-0">
            <div className="px-3 py-1.5 bg-indigo-950/40 border-b border-indigo-800/50">
              <span className="text-[10px] font-mono text-indigo-300">
                {language === 'en' ? 'SECTION' : 'ABSCHNITT'} · ## {targetSection}
              </span>
            </div>

            {existingSectionContent && existingSectionContent.trim() && (
              <div className="px-3 py-2 border-b border-line bg-surface-base">
                <span className="block text-[9px] font-mono text-ink-muted mb-1 tracking-wider">
                  {language === 'en' ? 'CURRENTLY' : 'BISHER'}
                </span>
                <p className="text-[11px] text-ink-muted whitespace-pre-wrap line-clamp-4">
                  {existingSectionContent}
                </p>
              </div>
            )}

            <div className="px-3 py-2">
              <span className="block text-[9px] font-mono text-ink-muted mb-1 tracking-wider">
                {language === 'en' ? 'PROPOSED' : 'VORSCHLAG'}
              </span>
              <p className="text-[11px] text-ink-bright whitespace-pre-wrap select-text">
                {aiResponse}
              </p>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-2 border-t border-line bg-surface-card">
              <button
                onClick={() => handleApplyToSection('replace')}
                className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-mono font-semibold transition cursor-pointer"
              >
                <Check className="h-3 w-3" />
                {existingSectionContent && existingSectionContent.trim()
                  ? (language === 'en' ? 'Replace' : 'Ersetzen')
                  : (language === 'en' ? 'Apply' : 'Übernehmen')}
              </button>
              {existingSectionContent && existingSectionContent.trim() && (
                <button
                  onClick={() => handleApplyToSection('append')}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-control hover:bg-surface-hover text-ink text-[10px] font-mono transition cursor-pointer"
                >
                  {language === 'en' ? 'Append' : 'Anhängen'}
                </button>
              )}
              <button
                onClick={() => setAiResponse('')}
                className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-control hover:bg-surface-hover text-ink-secondary text-[10px] font-mono transition cursor-pointer ml-auto"
              >
                <X className="h-3 w-3" />
                {language === 'en' ? 'Discard' : 'Verwerfen'}
              </button>
            </div>
          </div>
        )}

        {/* Loading status for text generation */}
        {isGeneratingText && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-surface-base/50 border border-dashed border-line/80 rounded-lg min-h-[150px]">
            <Sparkles className="h-6 w-6 text-indigo-400 animate-pulse mb-3" />
            <p className="text-xs font-mono text-ink">
              {language === 'en' ? 'Analyzing Lore Vault & Index...' : 'Durchsuche Lore-Tresor & Index...'}
            </p>
            <p className="text-[10px] font-mono text-ink-muted mt-1.5 max-w-[250px]">
              {language === 'en'
                ? '"The Chronicler links characters, factions, headquarters, and incident logs into a cohesive saga."'
                : '"Der KI-Chronist analysiert Personen, Organisationen, Hauptquartiere und Einsatzberichte..."'}
            </p>
            <button
              type="button"
              onClick={handleCancelAsk}
              className="mt-3 flex items-center gap-1 px-2.5 py-1 rounded border border-line bg-surface-control hover:bg-rose-950/40 hover:border-rose-800/60 hover:text-rose-300 text-ink-secondary text-[10px] font-mono transition cursor-pointer"
              title={language === 'en' ? 'Stop — keeps your message to try again' : 'Abbrechen — deine Nachricht bleibt zum erneuten Versuch erhalten'}
            >
              <Square className="h-3 w-3" />
              {language === 'en' ? 'Stop' : 'Abbrechen'}
            </button>
          </div>
        )}
      </div>

      {/* Fixed Conversational input bar at bottom */}
      <div className="p-3 bg-surface-base border-t border-line shrink-0 mt-auto">
        <div className="flex flex-col gap-1.5 bg-surface-base border border-line/80 rounded-lg p-2">
          {sectionOptions.length > 0 && (
            <select
              value={targetSection}
              onChange={(e) => setTargetSection(e.target.value)}
              className="w-full bg-surface-control border border-line rounded px-2 py-1.5 text-[11px] font-mono text-ink-bright outline-none focus:border-indigo-600 transition cursor-pointer"
            >
              <option value="">
                {language === 'en' ? '— choose a section to work on —' : '— Abschnitt wählen, an dem gearbeitet wird —'}
              </option>
              {sectionOptions.map(header => (
                <option key={header} value={header}>
                  {header}
                  {gaps?.emptySections.includes(header)
                    ? ` (${language === 'en' ? 'empty' : 'leer'})`
                    : ''}
                </option>
              ))}
            </select>
          )}
          <textarea
            ref={chatTextareaRef}
            value={chatPrompt}
            onChange={(e) => setChatPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleAskAI();
              }
            }}
            placeholder={
              sectionOptions.length > 0 && !targetSection
                ? (language === 'en' ? 'Choose a section above first…' : 'Erst oben einen Abschnitt wählen…')
                : (language === 'en'
                    ? 'Discuss or draft this section... (Ctrl + Enter to send)'
                    : 'Diesen Abschnitt besprechen oder entwerfen... (Strg + Enter zum Senden)')
            }
            rows={1}
            style={{ minHeight: '40px' }}
            className="w-full bg-transparent border-none text-xs text-ink-bright outline-none px-1 font-mono resize-none overflow-y-auto max-h-[220px]"
            disabled={isGeneratingText || (sectionOptions.length > 0 && !targetSection)}
          />
          <div className="flex items-center justify-between text-[10px] font-mono text-ink-muted pt-1 border-t border-line-subtle">
            {chatPrompt || targetSection || aiResponse ? (
              <button
                onClick={handleResetDraft}
                disabled={isGeneratingText}
                title={language === 'en' ? 'Clear message, section and reply for this entry' : 'Nachricht, Abschnitt und Antwort für diesen Eintrag löschen'}
                className="flex items-center gap-1 text-[10px] font-mono text-ink-muted hover:text-rose-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                {language === 'en' ? 'Reset' : 'Zurücksetzen'}
              </button>
            ) : (
              <span>{language === 'en' ? 'Press Ctrl + Enter to send' : 'Strg + Enter zum Abschicken'}</span>
            )}
            <button
              onClick={() => handleAskAI()}
              disabled={isGeneratingText || !chatPrompt.trim() || (sectionOptions.length > 0 && !targetSection)}
              className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-surface-control disabled:text-ink-disabled shadow-[0_0_10px_rgba(0,96,229,0.3)] transition cursor-pointer font-semibold flex items-center gap-1"
            >
              <Send className="h-3 w-3" />
              <span>{language === 'en' ? 'Send' : 'Senden'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
