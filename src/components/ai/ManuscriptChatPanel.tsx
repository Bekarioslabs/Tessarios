/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useRef, useEffect } from 'react';
import { Send, Sparkles, PenLine, Eye, RotateCcw, X, CornerDownLeft, Replace, AlertTriangle, Square } from 'lucide-react';
import { Language } from '../../utils/i18n';
import { ManuscriptChatApi } from '../../hooks/useManuscriptChat';
import { SceneContradiction } from '../../ai/engine/aiContradictionDetector';
import { estimateTokens, getModelContextTokens, contextLoad } from '../../utils/aiSettings';

interface ManuscriptChatPanelProps {
  api: ManuscriptChatApi;
  language: Language;
  /** False while a book or chapter view is open — the companion works on one scene. */
  hasActiveScene: boolean;
  /** The passage marked in the editor right now, '' when nothing is selected. */
  selectedText: string;
  /** Found by text search, not by the model — shown in the editor role. */
  contradictions: SceneContradiction[];
  /** Appends the reply to the end of the scene. */
  onAppend: (text: string) => void;
  /** Writes the reply over exactly the marked passage. */
  onReplaceSelection: (text: string) => void;
}

export default function ManuscriptChatPanel({
  api,
  language,
  hasActiveScene,
  selectedText,
  contradictions,
  onAppend,
  onReplaceSelection,
}: ManuscriptChatPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    role, setRole, chatPrompt, setChatPrompt, aiResponse, clearResponse,
    isGenerating, errorMsg, hasDraft, contextReport, promptChars, send, cancel, resetDraft,
  } = api;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 44), 200)}px`;
    }
  }, [chatPrompt]);

  if (!hasActiveScene) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
        <Sparkles className="h-5 w-5 text-ink-muted" />
        <p className="text-xs text-ink-secondary max-w-[240px]">
          {language === 'en'
            ? 'Open a scene to write with the AI. It works on one scene at a time, never on a whole chapter.'
            : 'Öffne eine Szene, um mit der KI zu schreiben. Sie arbeitet immer an genau einer Szene, nie an einem ganzen Kapitel.'}
        </p>
      </div>
    );
  }

  const hasSelection = selectedText.trim().length > 0;
  const isWriter = role === 'writer';

  const promptTokens = estimateTokens(promptChars);
  const contextTokens = getModelContextTokens();
  const load = contextLoad(promptTokens, contextTokens);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Role switch — the editor never gets apply buttons, by design */}
      <div className="shrink-0 px-3 py-2.5 border-b border-line flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setRole('writer')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold border transition cursor-pointer ${
            isWriter
              ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/80'
              : 'bg-surface-control/60 text-ink-secondary border-line hover:text-ink-heading hover:bg-surface-hover'
          }`}
          title={language === 'en' ? 'Proposes prose you can put into the scene' : 'Schlägt Text vor, den du in die Szene übernehmen kannst'}
        >
          <PenLine className="h-3.5 w-3.5" />
          {language === 'en' ? 'Writing partner' : 'Schreibpartner'}
        </button>
        <button
          type="button"
          onClick={() => setRole('editor')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold border transition cursor-pointer ${
            !isWriter
              ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/80'
              : 'bg-surface-control/60 text-ink-secondary border-line hover:text-ink-heading hover:bg-surface-hover'
          }`}
          title={language === 'en' ? 'Comments only — never writes into the scene' : 'Kommentiert nur — schreibt nie in die Szene'}
        >
          <Eye className="h-3.5 w-3.5" />
          {language === 'en' ? 'Editor' : 'Lektor'}
        </button>

        {hasDraft && (
          <button
            type="button"
            onClick={resetDraft}
            className="ml-auto flex items-center gap-1 text-[10px] font-mono text-ink-muted hover:text-ink-heading transition cursor-pointer"
            title={language === 'en' ? 'Clear this scene\'s draft' : 'Entwurf dieser Szene verwerfen'}
          >
            <RotateCcw className="h-3 w-3" />
            {language === 'en' ? 'Reset' : 'Zurücksetzen'}
          </button>
        )}
      </div>

      {/* Conversation area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
        {errorMsg && (
          <div className="p-3 bg-danger-surface border border-rose-900/60 text-rose-300 text-xs font-mono rounded-lg">
            {errorMsg}
          </div>
        )}

        {/* Found by text search over the dossiers this scene links to — no model
            involved, so it stands whether or not you have asked anything yet. */}
        {!isWriter && contradictions.length > 0 && (
          <div className="rounded-lg bg-amber-950/30 border border-amber-800/50 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-amber-800/40 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="text-[10px] font-mono text-amber-300 tracking-wider">
                {language === 'en' ? 'AGAINST THE DOSSIERS' : 'GEGEN DIE DOSSIERS'}
              </span>
            </div>
            <ul className="px-3 py-2 flex flex-col gap-1.5">
              {contradictions.map((c, i) => (
                <li key={`${c.entityId}-${c.field}-${i}`} className="text-[11px] text-amber-200 leading-relaxed">
                  {language === 'en' ? (
                    <><strong>{c.entityTitle}</strong> — the dossier's „{c.field}" says „{c.dossierValue}",
                      but this scene uses „{c.conflictingValue}".</>
                  ) : (
                    <><strong>{c.entityTitle}</strong> — im Dossier steht „{c.field}: {c.dossierValue}",
                      diese Szene benutzt aber „{c.conflictingValue}".</>
                  )}
                </li>
              ))}
            </ul>
            <p className="px-3 pb-2 text-[10px] font-mono text-amber-400/70">
              {language === 'en'
                ? 'Found by text search. Possibly deliberate — nothing is changed.'
                : 'Per Textsuche gefunden. Kann Absicht sein — es wird nichts geändert.'}
            </p>
          </div>
        )}

        {hasSelection && (
          <div className="px-3 py-2 rounded-lg bg-surface-base border border-line">
            <span className="block text-[9px] font-mono text-ink-muted mb-1 tracking-wider">
              {language === 'en' ? 'MARKED PASSAGE' : 'MARKIERTE STELLE'}
            </span>
            <p className="text-[11px] text-ink-secondary line-clamp-3 whitespace-pre-wrap">
              {selectedText.trim()}
            </p>
          </div>
        )}

        {isGenerating && (
          <div className="flex items-center justify-between gap-2 px-1 py-2 text-[11px] font-mono text-ink-muted">
            <span className="flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-indigo-400 animate-pulse" />
              {language === 'en' ? 'Thinking…' : 'Denkt nach…'}
            </span>
            <button
              type="button"
              onClick={cancel}
              className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-control hover:bg-rose-950/40 hover:border-rose-800/60 hover:text-rose-300 text-ink-secondary transition cursor-pointer"
              title={language === 'en' ? 'Stop — keeps your message to try again' : 'Abbrechen — deine Nachricht bleibt zum erneuten Versuch erhalten'}
            >
              <Square className="h-3 w-3" />
              {language === 'en' ? 'Stop' : 'Abbrechen'}
            </button>
          </div>
        )}

        {aiResponse && !isGenerating && (
          <div className="border border-indigo-700/70 bg-surface-elevated rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-indigo-950/40 border-b border-indigo-800/50">
              <span className="text-[10px] font-mono text-indigo-300">
                {isWriter
                  ? (language === 'en' ? 'PROPOSED TEXT' : 'TEXTVORSCHLAG')
                  : (language === 'en' ? 'EDITORIAL NOTES' : 'LEKTORAT')}
              </span>
            </div>

            <div className="px-3 py-2 max-h-[420px] overflow-y-auto">
              <p className="text-[12px] leading-relaxed text-ink-bright whitespace-pre-wrap">
                {aiResponse}
              </p>
            </div>

            {/* What the model actually had in front of it. Named explicitly because a
                dossier dropped for budget looks exactly like a dossier the AI ignored. */}
            {contextReport && (contextReport.included.length > 0 || contextReport.omitted.length > 0) && (
              <div className="px-3 py-1.5 border-t border-line bg-surface-base flex flex-col gap-0.5">
                {contextReport.included.length > 0 && (
                  <span className="text-[10px] font-mono text-ink-muted">
                    {language === 'en' ? 'Knew about: ' : 'Kannte: '}
                    {contextReport.included.join(', ')}
                  </span>
                )}
                {contextReport.omitted.length > 0 && (
                  <span className="text-[10px] font-mono text-amber-300/90">
                    {language === 'en'
                      ? `Left out, context budget reached: ${contextReport.omitted.join(', ')}`
                      : `Weggelassen, Kontext-Budget erreicht: ${contextReport.omitted.join(', ')}`}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5 px-3 py-2 border-t border-line bg-surface-card">
              {isWriter ? (
                <>
                  <button
                    type="button"
                    onClick={() => onAppend(aiResponse)}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-mono font-semibold transition cursor-pointer"
                    title={language === 'en' ? 'Add to the end of the scene' : 'An das Ende der Szene anhängen'}
                  >
                    <CornerDownLeft className="h-3 w-3" />
                    {language === 'en' ? 'Append' : 'Anhängen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReplaceSelection(aiResponse)}
                    disabled={!hasSelection}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-control hover:bg-surface-hover text-ink text-[10px] font-mono transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      hasSelection
                        ? (language === 'en' ? 'Write over exactly the marked passage' : 'Genau die markierte Stelle überschreiben')
                        : (language === 'en' ? 'Mark a passage in the scene first' : 'Markiere zuerst eine Stelle in der Szene')
                    }
                  >
                    <Replace className="h-3 w-3" />
                    {language === 'en' ? 'Replace selection' : 'Auswahl ersetzen'}
                  </button>
                </>
              ) : (
                <span className="text-[10px] font-mono text-ink-muted">
                  {language === 'en'
                    ? 'The editor never writes into the scene.'
                    : 'Der Lektor schreibt nie in die Szene.'}
                </span>
              )}

              <button
                type="button"
                onClick={clearResponse}
                className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-control hover:bg-surface-hover text-ink-secondary text-[10px] font-mono transition cursor-pointer ml-auto"
              >
                <X className="h-3 w-3" />
                {language === 'en' ? 'Discard' : 'Verwerfen'}
              </button>
            </div>
          </div>
        )}

        {!aiResponse && !isGenerating && !errorMsg && (
          <p className="text-[11px] text-ink-muted leading-relaxed px-1">
            {isWriter
              ? (language === 'en'
                  ? 'Ask it to carry the scene on, or mark a passage and ask for it to be reworked. Nothing is written until you click.'
                  : 'Bitte sie, die Szene weiterzuführen — oder markiere eine Stelle und lass sie überarbeiten. Bis du klickst, wird nichts geschrieben.')
              : (language === 'en'
                  ? 'Ask what does not work yet: pacing, repetition, whether a figure acts against their dossier.'
                  : 'Frag, was noch nicht trägt: Tempo, Wiederholungen, ob eine Figur gegen ihr Dossier handelt.')}
          </p>
        )}
      </div>

      {/* Context gauge — measured on the messages a request would actually send, not on
          a parallel estimate that could drift from it. */}
      <div className="shrink-0 px-3 pt-2 pb-1 border-t border-line bg-surface-base">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-mono text-ink-muted">
            {language === 'en' ? 'Context' : 'Kontext'}
          </span>
          <span
            className={`text-[10px] font-mono ${
              load.level === 'over'
                ? 'text-rose-300'
                : load.level === 'tight'
                  ? 'text-amber-300'
                  : 'text-ink-muted'
            }`}
          >
            ~{promptTokens.toLocaleString()} / {contextTokens.toLocaleString()} {language === 'en' ? 'tokens' : 'Token'}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-control overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              load.level === 'over'
                ? 'bg-rose-500'
                : load.level === 'tight'
                  ? 'bg-amber-500'
                  : 'bg-indigo-500'
            }`}
            style={{ width: `${Math.min(100, Math.round(load.ratio * 100))}%` }}
          />
        </div>
        {load.level !== 'ok' && (
          <p
            className={`text-[10px] font-mono mt-1 leading-relaxed ${
              load.level === 'over' ? 'text-rose-300' : 'text-amber-300'
            }`}
          >
            {load.level === 'over'
              ? (language === 'en'
                  ? 'Too little room left for an answer. The server drops the front of the prompt — the constitution and project brief go first. Lower the context budget or raise the model\'s context length.'
                  : 'Zu wenig Platz für eine Antwort. Der Server wirft den Anfang des Prompts weg — zuerst Verfassung und Projektbibel. Senke das Kontext-Budget oder erhöhe die Kontextlänge des Modells.')
              : (language === 'en'
                  ? 'Getting full. The answer needs room in the same window.'
                  : 'Wird eng. Die Antwort braucht Platz im selben Fenster.')}
          </p>
        )}
        <p className="text-[9px] font-mono text-ink-faint mt-0.5">
          {language === 'en'
            ? 'Estimated. The exact count is only known to your server.'
            : 'Geschätzt. Die genaue Zahl kennt nur dein Server.'}
        </p>
      </div>

      {/* Input */}
      <div className="shrink-0 p-2.5 bg-surface-base">
        <div className="flex flex-col gap-1.5 border border-line/80 rounded-lg p-2">
          <textarea
            ref={textareaRef}
            value={chatPrompt}
            onChange={e => setChatPrompt(e.target.value)}
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            disabled={isGenerating}
            placeholder={
              isWriter
                ? (language === 'en' ? 'e.g. "carry on from here, she hesitates"… (Ctrl + Enter)' : 'z. B. „schreib hier weiter, sie zögert"… (Strg + Enter)')
                : (language === 'en' ? 'e.g. "does this scene drag?"… (Ctrl + Enter)' : 'z. B. „zieht sich diese Szene?"… (Strg + Enter)')
            }
            className="w-full bg-transparent border-none text-xs text-ink-bright outline-none px-1 font-mono resize-none overflow-y-auto max-h-[200px]"
          />
          <div className="flex items-center justify-end pt-1 border-t border-line-subtle">
            <button
              type="button"
              onClick={send}
              disabled={isGenerating || !chatPrompt.trim()}
              className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-mono font-semibold disabled:bg-surface-control disabled:text-ink-disabled transition cursor-pointer flex items-center gap-1"
            >
              <Send className="h-3 w-3" />
              {language === 'en' ? 'Send' : 'Senden'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
