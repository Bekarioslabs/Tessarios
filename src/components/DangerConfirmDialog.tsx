/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DangerConfirmDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

/** Shared rose/amber "irreversible action" dialog — same visual weight as the field-delete
 *  confirmation in Editor.tsx, reused for every delete that skips straight to permanent removal. */
export const DangerConfirmDialog: React.FC<DangerConfirmDialogProps> = ({
  isOpen,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-overlay backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div
        className="bg-surface-card border border-rose-900/60 rounded-2xl max-w-md w-full p-5 shadow-2xl flex flex-col gap-4 text-ink-heading relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600" />

        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-400 shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-mono font-bold text-ink-heading flex items-center justify-between">
              <span>{title}</span>
              <button
                type="button"
                onClick={onCancel}
                className="text-ink-muted hover:text-ink p-1 rounded-lg transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </h3>
            <p className="text-xs font-mono text-ink mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/80">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-lg bg-surface-control hover:bg-surface-hover text-ink border border-line text-xs font-mono transition cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs font-mono transition cursor-pointer shadow-[0_0_12px_rgba(225,29,72,0.4)] flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DangerConfirmDialog;
