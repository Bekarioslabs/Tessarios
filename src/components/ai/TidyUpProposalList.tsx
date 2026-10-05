/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Check, X, ArrowRight, RotateCcw } from 'lucide-react';
import { Language } from '../../utils/i18n';
import { TidyUpApi } from '../../hooks/useEntityTidyUp';

interface TidyUpProposalListProps {
  api: TidyUpApi;
  language: Language;
}

/**
 * One row per point the model placed into a section — never a full before/after of each
 * target section (with several hits that would be a wall of text), just what leaves
 * "Offene Fragen" and where it goes. Every row starts checked; unchecking one leaves that
 * point exactly where it is.
 */
export default function TidyUpProposalList({ api, language }: TidyUpProposalListProps) {
  const { proposals, acceptedIndexes, toggleAccepted, apply, discard, errorMsg } = api;
  if (!proposals) return null;

  if (proposals.length === 0) {
    return (
      <div className="shrink-0 px-3 py-2.5 rounded-lg bg-surface-base border border-line text-[11px] text-ink-secondary">
        {language === 'en'
          ? 'Nothing here clearly belongs anywhere else — nothing to move.'
          : 'Nichts davon gehört eindeutig woanders hin — nichts zu verschieben.'}
        <button
          type="button"
          onClick={discard}
          className="ml-2 text-indigo-300 hover:text-indigo-200 underline cursor-pointer"
        >
          {language === 'en' ? 'OK' : 'OK'}
        </button>
      </div>
    );
  }

  const acceptedCount = proposals.filter(p => acceptedIndexes.has(p.pointIndex)).length;

  return (
    <div className="border border-indigo-700/70 bg-surface-elevated rounded-lg overflow-hidden shrink-0">
      <div className="px-3 py-1.5 bg-indigo-950/40 border-b border-indigo-800/50">
        <span className="text-[10px] font-mono text-indigo-300">
          {language === 'en' ? 'TIDY UP PROPOSAL' : 'VORSCHLAG ZUM AUFRÄUMEN'}
        </span>
      </div>

      <div className="px-3 py-2 flex flex-col gap-2 max-h-[320px] overflow-y-auto">
        {proposals.map(p => {
          const accepted = acceptedIndexes.has(p.pointIndex);
          return (
            <label
              key={p.pointIndex}
              className="flex items-start gap-2 text-[11px] leading-relaxed cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={accepted}
                onChange={() => toggleAccepted(p.pointIndex)}
                className="mt-0.5 shrink-0 cursor-pointer accent-indigo-500"
              />
              <span className={accepted ? 'text-ink' : 'text-ink-muted line-through decoration-ink-faint'}>
                {p.text}
              </span>
              <span className="flex items-center gap-1 text-indigo-300 shrink-0 ml-auto whitespace-nowrap">
                <ArrowRight className="h-3 w-3" />
                {p.targetSection}
              </span>
            </label>
          );
        })}
      </div>

      {errorMsg && (
        <div className="px-3 py-1.5 flex items-start gap-1.5 bg-amber-950/30 border-t border-amber-800/40">
          <p className="text-[10px] text-amber-200">{errorMsg}</p>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-line bg-surface-card">
        <button
          type="button"
          onClick={apply}
          disabled={acceptedCount === 0}
          className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-mono font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check className="h-3 w-3" />
          {language === 'en'
            ? `Apply (${acceptedCount})`
            : `Anwenden (${acceptedCount})`}
        </button>
        <button
          type="button"
          onClick={discard}
          className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-control hover:bg-surface-hover text-ink-secondary text-[10px] font-mono transition cursor-pointer ml-auto"
        >
          <X className="h-3 w-3" />
          {language === 'en' ? 'Discard' : 'Verwerfen'}
        </button>
      </div>
    </div>
  );
}
