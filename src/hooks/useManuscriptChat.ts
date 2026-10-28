/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { LoreEntity } from '../types';
import { Language } from '../utils/i18n';
import { getStorage } from '../utils/storage';
import { IVaultStorage } from '../utils/storage/VaultStorage';
import { extractManuscriptText, getManuscriptHierarchy } from '../utils/manuscript';
import {
  loadManuscriptDrafts,
  saveManuscriptDrafts,
  trimExchangesToBudget,
  StoredManuscriptDraft,
  ChatExchange,
} from '../utils/chatDraftStore';
import { composePrompt } from '../ai/engine/aiPromptComposer';
import { AIContextResolver } from '../ai/engine/aiContextResolver';
import { getContextBudget } from '../utils/aiSettings';
import { generateAiRequestId, cancelAiRequest, isAiRequestCancelled } from '../utils/aiCancellation';
import {
  resolveAgentsPrompt,
  resolveSoulPrompt,
  resolveProjectPrompt,
  DEFAULT_AGENTS_PROMPT,
  DEFAULT_SOUL_PROMPT,
  DEFAULT_PROJECT_PROMPT,
} from '../ai/engine/aiResolver';

/**
 * The two hats the companion wears. They share every mechanism — same prompt layers,
 * same context, same call — and differ only in the working mode they ask for and in
 * whether the answer is something you can put into the scene.
 *
 * `writer` proposes prose. `editor` reads and comments; its replies are never applyable,
 * which is the whole point of having it as a separate role rather than a phrasing hint.
 */
export type ManuscriptRole = 'writer' | 'editor';

/** How much of the preceding scene travels along so a continuation can actually join on. */
const PRECEDING_SCENE_TAIL_CHARS = 1200;

/** Which linked dossiers the last request actually carried, and which the budget cut. */
export interface ContextReport {
  included: string[];
  omitted: string[];
}

interface ManuscriptDraft {
  chatPrompt: string;
  role: ManuscriptRole;
  aiResponse: string;
  isGenerating: boolean;
  errorMsg: string;
  exchanges: ChatExchange[];
  contextReport: ContextReport | null;
  /** Set only while a request is in flight — what `cancel()` aborts and what the typed
   *  message gets restored from, so stopping never just loses what was typed. */
  activeRequestId: string | null;
  inFlightPrompt: string;
}

const EMPTY_DRAFT: ManuscriptDraft = {
  chatPrompt: '',
  role: 'writer',
  aiResponse: '',
  isGenerating: false,
  errorMsg: '',
  exchanges: [],
  contextReport: null,
  activeRequestId: null,
  inFlightPrompt: '',
};

export interface ManuscriptChatApi {
  role: ManuscriptRole;
  setRole: (role: ManuscriptRole) => void;
  chatPrompt: string;
  setChatPrompt: (value: string) => void;
  aiResponse: string;
  clearResponse: () => void;
  isGenerating: boolean;
  errorMsg: string;
  hasDraft: boolean;
  /** Null until a request has run — what its context actually contained. */
  contextReport: ContextReport | null;
  /** Estimated size of the next request, measured on the real assembled messages. */
  promptChars: number;
  send: () => Promise<void>;
  /** Aborts the in-flight request, if any, and restores the typed message. */
  cancel: () => void;
  resetDraft: () => void;
}

export interface UseManuscriptChatParams {
  /** The scene currently open for writing, or null when a book/chapter view is shown. */
  activeScene: LoreEntity | null;
  entities: Record<string, LoreEntity>;
  language: Language;
  /** The passage the author has marked, if any — it becomes the subject of the turn. */
  selectedText?: string;
}

function tryGetStorage(): IVaultStorage | null {
  try {
    return getStorage();
  } catch {
    return null;
  }
}

/**
 * Where this scene sits in the book: which chapter it belongs to, its number, and the
 * tail of the scene before it. Without this a continuation has nothing to join onto —
 * it would restart the moment rather than continue it.
 */
export function buildNarrativePosition(
  scene: LoreEntity,
  entities: Record<string, LoreEntity>,
  language: Language
): string {
  const hierarchy = getManuscriptHierarchy(entities);

  for (const book of hierarchy) {
    for (const chapter of book.chapters) {
      const index = chapter.scenes.findIndex(s => s.id === scene.id);
      if (index === -1) continue;

      const lines =
        language === 'en'
          ? [
              `Book: ${book.title}`,
              `Chapter: ${chapter.title}`,
              `Scene ${index + 1} of ${chapter.scenes.length}: ${scene.title}`,
            ]
          : [
              `Buch: ${book.title}`,
              `Kapitel: ${chapter.title}`,
              `Szene ${index + 1} von ${chapter.scenes.length}: ${scene.title}`,
            ];

      if (index > 0) {
        const previous = chapter.scenes[index - 1];
        const text = extractManuscriptText(previous.entity.content).trim();
        if (text) {
          const tail = text.length > PRECEDING_SCENE_TAIL_CHARS
            ? `…${text.slice(-PRECEDING_SCENE_TAIL_CHARS)}`
            : text;
          lines.push(
            language === 'en'
              ? `\nHow the preceding scene ("${previous.title}") ends:\n${tail}`
              : `\nWie die vorherige Szene („${previous.title}") endet:\n${tail}`
          );
        }
      }

      return lines.join('\n');
    }
  }

  return language === 'en'
    ? `Scene: ${scene.title} (not yet assigned to a chapter)`
    : `Szene: ${scene.title} (noch keinem Kapitel zugeordnet)`;
}

/**
 * The role's standing instruction. Deliberately spelled out per role rather than left to
 * the mode name alone: a local model follows a concrete sentence about what to produce
 * far more reliably than an abstract mode label.
 */
function roleInstruction(role: ManuscriptRole, language: Language): string {
  if (role === 'writer') {
    return language === 'en'
      ? 'You are writing alongside the author on this scene. Answer with prose that could go straight into the manuscript — no headings, no bullet points, no commentary about your own answer. Match the voice of what is already there. If the request is unclear, ask one short question instead of guessing.'
      : 'Du schreibst gemeinsam mit dem Autor an dieser Szene. Antworte mit Fließtext, der so ins Manuskript könnte — keine Überschriften, keine Aufzählungen, keine Bemerkungen über deine eigene Antwort. Triff den Ton dessen, was schon dasteht. Ist die Anfrage unklar, stelle eine kurze Rückfrage, statt zu raten.';
  }
  return language === 'en'
    ? 'You are reading this scene as an editor. Comment — do not rewrite it. Name concrete places in the text: what is unclear, what contradicts the dossiers, where the pacing sags, what repeats. Be specific and brief; a short list of real observations beats a long appreciation. Never deliver replacement prose.'
    : 'Du liest diese Szene als Lektor. Kommentiere — schreibe sie nicht um. Benenne konkrete Stellen im Text: was unklar ist, was den Dossiers widerspricht, wo das Tempo durchhängt, was sich wiederholt. Sei konkret und knapp; eine kurze Liste echter Beobachtungen ist mehr wert als eine lange Würdigung. Liefere niemals Ersatztext.';
}

export interface AssembleRequestParams {
  scene: LoreEntity;
  role: ManuscriptRole;
  userText: string;
  selection: string;
  exchanges: ChatExchange[];
  entities: Record<string, LoreEntity>;
  language: Language;
}

/**
 * Builds the exact message array a request would send.
 *
 * Extracted so `send` and the context gauge share one implementation: a gauge computed
 * from a second, parallel assembly would drift from what actually goes over the wire the
 * moment either side changed, and a wrong gauge is worse than none — it would be trusted.
 */
export async function assembleRequest({
  scene,
  role,
  userText,
  selection,
  exchanges,
  entities,
  language,
}: AssembleRequestParams): Promise<{
  messages: { role: string; content: string }[];
  resolved: { text: string; included: string[]; omitted: string[] };
  temperature: number;
}> {
  const storage = tryGetStorage();

  const [agentsPrompt, soulPrompt, projectPrompt] = await Promise.all([
    resolveAgentsPrompt(storage, DEFAULT_AGENTS_PROMPT),
    resolveSoulPrompt(storage, DEFAULT_SOUL_PROMPT),
    resolveProjectPrompt(storage, DEFAULT_PROJECT_PROMPT),
  ]);

  // Every dossier the scene links to, so the companion knows who is in the room
  // without the author wiring up relations first.
  const contextResolver = new AIContextResolver(storage, undefined, entities);
  const resolved = await contextResolver.resolveContextDetailed(
    scene,
    scene.content,
    ['mentioned:dossiers'],
    { maxCharacterBudget: getContextBudget() }
  );

  const sceneText = extractManuscriptText(scene.content).trim();
  const position = buildNarrativePosition(scene, entities, language);

  const contextParts = [position];
  if (resolved.text.trim()) {
    contextParts.push(
      language === 'en'
        ? `Dossiers this scene links to:\n${resolved.text.trim()}`
        : `Dossiers, die diese Szene verlinkt:\n${resolved.text.trim()}`
    );
  }
  contextParts.push(
    sceneText
      ? (language === 'en' ? `The scene so far:\n${sceneText}` : `Die Szene bisher:\n${sceneText}`)
      : (language === 'en' ? 'The scene is still empty.' : 'Die Szene ist noch leer.')
  );
  if (selection) {
    contextParts.push(
      language === 'en'
        ? `The author has marked this passage — it is what the request is about:\n${selection}`
        : `Der Autor hat diese Stelle markiert — um sie geht es:\n${selection}`
    );
  }

  const composed = composePrompt({
    agentsPrompt,
    soulPrompt,
    projectPrompt,
    resolvedContext: contextParts.join('\n\n'),
    userMessage: `${roleInstruction(role, language)}\n\n${userText}`,
    mode: role === 'writer' ? 'muse' : 'analytical',
    replyLanguage: language,
  });

  const priorTurns = trimExchangesToBudget(exchanges).flatMap(ex => [
    { role: 'user', content: ex.prompt },
    { role: 'assistant', content: ex.reply },
  ]);

  return {
    messages: [
      { role: 'system', content: composed.systemPrompt },
      ...priorTurns,
      { role: 'user', content: composed.userPrompt },
    ],
    resolved,
    temperature: composed.recommendedTemperature,
  };
}

/** Total characters a message array will occupy. */
export function measureMessages(messages: { content: string }[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0);
}

/**
 * The manuscript companion's conversation, one draft per scene. Mirrors the dossier
 * chat in AIAssistant.tsx: compose the prompt layers, call the local model, get prose
 * back. There is no action contract to satisfy and nothing to validate — an answer is
 * text, and what happens to it is the author's decision.
 */
export function useManuscriptChat({
  activeScene,
  entities,
  language,
  selectedText,
}: UseManuscriptChatParams): ManuscriptChatApi {
  const [draftsByScene, setDraftsByScene] = useState<Record<string, ManuscriptDraft>>({});
  const sceneId = activeScene?.id || '';
  const draft = draftsByScene[sceneId] || EMPTY_DRAFT;

  /** Always patches by explicit id: a reply arriving after the author moved to another
   *  scene still belongs to the scene that asked for it. */
  const patchDraft = useCallback((id: string, patch: Partial<ManuscriptDraft>) => {
    if (!id) return;
    setDraftsByScene(prev => ({ ...prev, [id]: { ...(prev[id] || EMPTY_DRAFT), ...patch } }));
  }, []);

  const draftsLoadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadManuscriptDrafts(tryGetStorage());
      if (cancelled) return;
      setDraftsByScene(prev => {
        const merged = { ...prev };
        for (const [id, saved] of Object.entries(stored)) {
          // Disk is the base, anything already in memory wins: the author may have
          // started typing before this read came back.
          const fromDisk: Partial<ManuscriptDraft> = {
            chatPrompt: saved.chatPrompt,
            role: saved.role === 'editor' ? 'editor' : 'writer',
            aiResponse: saved.aiResponse,
          };
          merged[id] = { ...EMPTY_DRAFT, ...fromDisk, ...(merged[id] || {}) };
        }
        return merged;
      });
      draftsLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced, same trade as the dossier chat: a draft is small and low-stakes, so
  // waiting for a pause in typing beats checkpointing during it.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draftsLoadedRef.current) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const toPersist: Record<string, StoredManuscriptDraft> = {};
      for (const [id, d] of Object.entries(draftsByScene)) {
        toPersist[id] = { chatPrompt: d.chatPrompt, role: d.role, aiResponse: d.aiResponse };
      }
      saveManuscriptDrafts(tryGetStorage(), toPersist);
    }, 1200);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [draftsByScene]);

  const resetDraft = useCallback(() => {
    if (!sceneId) return;
    setDraftsByScene(prev => {
      const next = { ...prev };
      delete next[sceneId];
      const toPersist: Record<string, StoredManuscriptDraft> = {};
      for (const [id, d] of Object.entries(next)) {
        toPersist[id] = { chatPrompt: d.chatPrompt, role: d.role, aiResponse: d.aiResponse };
      }
      saveManuscriptDrafts(tryGetStorage(), toPersist);
      return next;
    });
  }, [sceneId]);

  /** Switching roles switches the job — the running exchange memory doesn't follow. */
  const setRole = useCallback(
    (role: ManuscriptRole) => patchDraft(sceneId, { role, aiResponse: '', exchanges: [] }),
    [patchDraft, sceneId]
  );

  // Live estimate of what the next request would cost, so the author sees the price
  // *before* waiting for it rather than after. Debounced because it re-reads the prompt
  // files and re-resolves dossiers; it must never run per keystroke.
  const [promptChars, setPromptChars] = useState(0);
  useEffect(() => {
    if (!activeScene) {
      setPromptChars(0);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { messages } = await assembleRequest({
          scene: activeScene,
          role: draft.role,
          // The typed message counts even before it is sent — it is part of the cost.
          userText: draft.chatPrompt,
          selection: (selectedText || '').trim(),
          exchanges: draft.exchanges,
          entities,
          language,
        });
        if (!cancelled) setPromptChars(measureMessages(messages));
      } catch {
        // An estimate is a convenience; failing to produce one must not disturb anything.
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeScene?.id,
    activeScene?.content,
    draft.role,
    draft.chatPrompt,
    draft.exchanges,
    selectedText,
    entities,
    language,
  ]);

  const send = useCallback(async () => {
    const promptToSend = draft.chatPrompt.trim();
    if (!promptToSend || !activeScene || draft.isGenerating) return;

    // Captured up front so a reply that arrives after the author moved on still lands
    // on the scene, role, and selection that asked for it.
    const requestSceneId = sceneId;
    const requestId = generateAiRequestId();

    patchDraft(requestSceneId, {
      isGenerating: true,
      aiResponse: '',
      errorMsg: '',
      chatPrompt: '',
      activeRequestId: requestId,
      inFlightPrompt: promptToSend,
    });

    try {
      const { messages, resolved, temperature } = await assembleRequest({
        scene: activeScene,
        role: draft.role,
        userText: promptToSend,
        selection: (selectedText || '').trim(),
        exchanges: draft.exchanges,
        entities,
        language,
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

      // The mode's temperature, not a fixed one: the writing partner needs room to
      // invent (muse ~0.9), the editor needs to stay close to the text (analytical 0.2).
      const responseText = await (window as any).vault.aiChat(
        provider, baseUrl, model, messages, temperature, requestId
      );
      if (!responseText) {
        throw new Error(
          language === 'en'
            ? 'Empty response from AI server'
            : 'Leere Antwort vom KI-Server erhalten'
        );
      }

      setDraftsByScene(prev => {
        const existing = prev[requestSceneId] || EMPTY_DRAFT;
        return {
          ...prev,
          [requestSceneId]: {
            ...existing,
            aiResponse: responseText,
            isGenerating: false,
            activeRequestId: null,
            inFlightPrompt: '',
            contextReport: { included: resolved.included, omitted: resolved.omitted },
            exchanges: trimExchangesToBudget([
              ...existing.exchanges,
              { prompt: promptToSend, reply: responseText },
            ]),
          },
        };
      });
    } catch (err: any) {
      // A deliberate Stop click, not a failure: the cancel() call below already reset
      // isGenerating and restored the typed message, so there is nothing left to do here
      // except make sure this doesn't overwrite that with an error banner.
      if (isAiRequestCancelled(err)) return;

      console.error(err);
      patchDraft(requestSceneId, {
        errorMsg:
          err.message ||
          (language === 'en'
            ? 'Communication with the AI server failed.'
            : 'Kommunikation mit dem KI-Server fehlgeschlagen.'),
        isGenerating: false,
        activeRequestId: null,
        inFlightPrompt: '',
      });
    }
  }, [draft, activeScene, sceneId, selectedText, entities, language, patchDraft]);

  const cancel = useCallback(() => {
    if (!draft.activeRequestId) return;
    cancelAiRequest(draft.activeRequestId);
    // Reset immediately rather than waiting for the aborted fetch to reject — the
    // author clicked Stop to get their input bar back right away, not after a round trip.
    patchDraft(sceneId, {
      isGenerating: false,
      activeRequestId: null,
      // Only hand the typed message back if nothing has been typed since — otherwise a
      // message the author already started for the *next* turn would be overwritten.
      chatPrompt: draft.chatPrompt || draft.inFlightPrompt,
      inFlightPrompt: '',
    });
  }, [draft.activeRequestId, draft.chatPrompt, draft.inFlightPrompt, sceneId, patchDraft]);

  return {
    role: draft.role,
    setRole,
    chatPrompt: draft.chatPrompt,
    setChatPrompt: (value: string) => patchDraft(sceneId, { chatPrompt: value }),
    aiResponse: draft.aiResponse,
    clearResponse: () => patchDraft(sceneId, { aiResponse: '' }),
    isGenerating: draft.isGenerating,
    errorMsg: draft.errorMsg,
    hasDraft: Boolean(draft.chatPrompt.trim() || draft.aiResponse.trim()),
    contextReport: draft.contextReport,
    promptChars,
    send,
    cancel,
    resetDraft,
  };
}
