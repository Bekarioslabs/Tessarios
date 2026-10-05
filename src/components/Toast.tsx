/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  icon?: React.ReactNode;
  message: React.ReactNode;
  action?: ToastAction;
  onDismiss?: () => void;
  /** Positioning is contextual (viewport-fixed corner toast vs. a panel-local banner), so
   *  the caller supplies it here rather than the component hardcoding one placement. */
  className?: string;
}

/** Shared visual language for the app's three passing notifications — previously each had
 *  its own background, border, animation and dismiss timing, which read as three unrelated
 *  systems rather than one. */
export const Toast: React.FC<ToastProps> = ({ icon, message, action, onDismiss, className = '' }) => {
  return (
    <div
      className={`z-[10000] bg-surface-elevated border border-indigo-500/50 shadow-2xl shadow-indigo-950/50 rounded-xl px-3.5 py-2.5 flex items-center gap-3 text-xs font-mono text-ink-bright max-w-md animate-fade-in ${className}`}
    >
      {icon && <div className="flex-shrink-0">{icon}</div>}
      <div className="flex-1 truncate">{message}</div>
      {action && (
        <button
          onClick={action.onClick}
          className="px-2.5 py-1 bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 hover:bg-indigo-600 hover:text-white rounded transition font-bold text-[11px] cursor-pointer shrink-0"
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-ink-muted hover:text-ink cursor-pointer text-xs shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default Toast;
