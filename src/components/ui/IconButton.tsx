/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React from 'react';

export type IconButtonVariant = 'boxed' | 'ghost' | 'rail';
export type IconButtonSize = 'sm' | 'md';

interface IconButtonProps {
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  active?: boolean;
  className?: string;
  id?: string;
}

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'w-[26px] h-[26px]',
  md: 'w-[30px] h-[30px]',
};

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  // Fixed-box button with visible border — the default for panel headers and toolbars.
  boxed: 'bg-surface-elevated hover:bg-indigo-950/60 text-ink hover:text-ink-heading border border-line hover:border-indigo-700/80 rounded-md shadow-sm',
  // No border/background until hovered, content-hugging size — for dense lists (tree
  // rows, inline chevrons) where a fixed 26-30px box would be too heavy.
  ghost: 'p-0.5 text-ink-secondary hover:text-ink-bright hover:bg-surface-hover rounded-lg',
  // Rounded pill used inside vertical icon rails (collapsed sidebars/panels).
  rail: 'p-2 rounded-xl border bg-surface-hover/60 text-ink-secondary hover:text-ink-heading border-line hover:bg-surface-hover',
};

const ACTIVE_RAIL_CLASSES = 'bg-indigo-600/30 text-indigo-300 border-indigo-500/80 shadow-[0_0_10px_rgba(0,96,229,0.3)]';

/**
 * Shared icon-only button. Consolidates what used to be ~13 independently hand-typed
 * button className strings across the app (collapse toggles, header actions, rail tabs).
 */
export default function IconButton({
  icon,
  onClick,
  title,
  variant = 'boxed',
  size = 'md',
  active = false,
  className = '',
  id,
}: IconButtonProps) {
  const sizeClass = variant === 'boxed' ? SIZE_CLASSES[size] : '';
  const variantClass = active && variant === 'rail' ? ACTIVE_RAIL_CLASSES : VARIANT_CLASSES[variant];

  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex items-center justify-center shrink-0 font-mono text-[11px] transition cursor-pointer ${sizeClass} ${variantClass} ${className}`}
    >
      {icon}
    </button>
  );
}
