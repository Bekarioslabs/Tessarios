/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import IconButton, { IconButtonVariant, IconButtonSize } from './IconButton';

/**
 * - 'horizontal-left': panel sits on the LEFT edge (e.g. sidebar). Collapsed -> points
 *   right (expand rightward). Expanded -> points left (collapse leftward).
 * - 'horizontal-right': panel sits on the RIGHT edge. Mirrored: collapsed -> points left,
 *   expanded -> points right.
 * - 'vertical': stacked content that grows downward below the toggle (e.g. an accordion
 *   section). Collapsed -> points down (expand downward). Expanded -> points up (collapse).
 * - 'vertical-inverted': panel grows upward above a slim bottom bar (e.g. a bottom panel
 *   that expands to reveal more content above it). Collapsed -> points up (expand
 *   upward). Expanded -> points down (collapse/minimize downward).
 * - 'disclosure': classic tree/list-row expand triangle (e.g. a chapter row revealing
 *   its scenes). Collapsed -> points right. Expanded -> points down.
 */
export type CollapseDirection = 'horizontal-left' | 'horizontal-right' | 'vertical' | 'vertical-inverted' | 'disclosure';

interface CollapseToggleProps {
  collapsed: boolean;
  onToggle: (e: React.MouseEvent) => void;
  direction: CollapseDirection;
  /** Tooltip shown while collapsed — i.e. describes the "expand" action. */
  titleExpand: string;
  /** Tooltip shown while expanded — i.e. describes the "collapse" action. */
  titleCollapse: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  className?: string;
  id?: string;
}

const ICONS: Record<CollapseDirection, { collapsed: React.ComponentType<{ className?: string }>; expanded: React.ComponentType<{ className?: string }> }> = {
  'horizontal-left': { collapsed: ChevronRight, expanded: ChevronLeft },
  'horizontal-right': { collapsed: ChevronLeft, expanded: ChevronRight },
  vertical: { collapsed: ChevronDown, expanded: ChevronUp },
  'vertical-inverted': { collapsed: ChevronUp, expanded: ChevronDown },
  disclosure: { collapsed: ChevronRight, expanded: ChevronDown },
};

/**
 * Shared collapse/expand chevron button. Consolidates 13 independently hand-rolled
 * implementations that had drifted into 6-7 visually different variants (including a
 * left/right sidebar pair that didn't even share border radius or icon color).
 */
export default function CollapseToggle({
  collapsed,
  onToggle,
  direction,
  titleExpand,
  titleCollapse,
  variant = 'boxed',
  size = 'md',
  className,
  id,
}: CollapseToggleProps) {
  const Icon = collapsed ? ICONS[direction].collapsed : ICONS[direction].expanded;
  const sizeClass = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  // Only the "boxed" variant gets the indigo accent (matches the app's existing
  // convention for standalone panel-toggle buttons). "ghost"/"rail" icons inherit the
  // button's own muted text color instead, so a dense tree row doesn't suddenly light
  // up in brand color just because its expand triangle became a shared component.
  const iconClass = variant === 'boxed' ? `${sizeClass} text-indigo-400` : sizeClass;

  return (
    <IconButton
      id={id}
      onClick={onToggle}
      title={collapsed ? titleExpand : titleCollapse}
      variant={variant}
      size={size}
      className={className}
      icon={<Icon className={iconClass} />}
    />
  );
}
