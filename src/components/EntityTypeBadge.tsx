/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React from 'react';
import { EntityType } from '../types';
import { Language, getTypeTranslation } from '../utils/i18n';
import {
  Book,
  BookOpen,
  User,
  Share2,
  Gem,
  Map,
  Zap,
  Scroll,
  Network,
  MapPin,
  FileText,
  Lightbulb,
  StickyNote,
  Palette,
  GitCommit
} from 'lucide-react';

/**
 * Single source of truth for "which color represents which entity type" — every other
 * representation (Tailwind badge classes, solid bar/dot color, canvas hex+glow for
 * GraphView) is derived from this one table. Change a type's color here and it updates
 * everywhere: badges, stat bars, and the relationship graph all read from this file.
 */
interface TypeVisual {
  text: string;   // Tailwind text-color class, e.g. 'text-amber-400'
  border: string; // Tailwind border-color class for badges
  bg: string;     // Tailwind background class for badges
  bar: string;    // solid Tailwind bg-color class for stat bars / legend dots
  hex: string;    // raw hex for canvas/SVG rendering (GraphView)
  glow: string;   // rgba glow matching `hex`, for canvas node highlight
}

const TYPE_VISUALS: Record<EntityType, TypeVisual> = {
  book: { text: 'text-amber-400', border: 'border-amber-900/50', bg: 'bg-amber-950/20', bar: 'bg-amber-500', hex: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' },
  chapter: { text: 'text-amber-500', border: 'border-amber-900/50', bg: 'bg-amber-950/20', bar: 'bg-amber-500', hex: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)' },
  character: { text: 'text-emerald-400', border: 'border-emerald-900/50', bg: 'bg-emerald-950/20', bar: 'bg-emerald-500', hex: '#10b981', glow: 'rgba(16, 185, 129, 0.4)' },
  relationship: { text: 'text-rose-400', border: 'border-rose-900/50', bg: 'bg-rose-950/20', bar: 'bg-rose-500', hex: '#f43f5e', glow: 'rgba(244, 63, 94, 0.4)' },
  item: { text: 'text-purple-400', border: 'border-purple-900/50', bg: 'bg-purple-950/20', bar: 'bg-purple-500', hex: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)' },
  map: { text: 'text-indigo-400', border: 'border-indigo-900/50', bg: 'bg-indigo-950/20', bar: 'bg-indigo-500', hex: '#6366f1', glow: 'rgba(99, 102, 241, 0.4)' },
  power: { text: 'text-yellow-400', border: 'border-yellow-900/50', bg: 'bg-yellow-950/20', bar: 'bg-yellow-500', hex: '#eab308', glow: 'rgba(234, 179, 8, 0.4)' },
  lore: { text: 'text-cyan-400', border: 'border-cyan-900/50', bg: 'bg-cyan-950/20', bar: 'bg-cyan-500', hex: '#06b6d4', glow: 'rgba(6, 182, 212, 0.4)' },
  organization: { text: 'text-teal-400', border: 'border-teal-900/50', bg: 'bg-teal-950/20', bar: 'bg-teal-500', hex: '#14b8a6', glow: 'rgba(20, 184, 166, 0.4)' },
  place: { text: 'text-blue-400', border: 'border-blue-900/50', bg: 'bg-blue-950/20', bar: 'bg-blue-500', hex: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)' },
  scene: { text: 'text-fuchsia-400', border: 'border-fuchsia-900/50', bg: 'bg-fuchsia-950/20', bar: 'bg-fuchsia-500', hex: '#d946ef', glow: 'rgba(217, 70, 239, 0.4)' },
  storyline: { text: 'text-violet-400', border: 'border-violet-900/50', bg: 'bg-violet-950/20', bar: 'bg-violet-500', hex: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.4)' },
  brainstorm: { text: 'text-pink-400', border: 'border-pink-900/50', bg: 'bg-pink-950/20', bar: 'bg-pink-500', hex: '#ec4899', glow: 'rgba(236, 72, 153, 0.4)' },
  note: { text: 'text-pink-400', border: 'border-pink-900/50', bg: 'bg-pink-950/20', bar: 'bg-pink-400', hex: '#f472b6', glow: 'rgba(244, 114, 182, 0.4)' },
  visual: { text: 'text-zinc-400', border: 'border-zinc-900', bg: 'bg-zinc-950/20', bar: 'bg-zinc-400', hex: '#a1a1aa', glow: 'rgba(161, 161, 170, 0.4)' },
};

const DEFAULT_VISUAL: TypeVisual = { text: 'text-indigo-400', border: 'border-indigo-900/50', bg: 'bg-indigo-950/20', bar: 'bg-indigo-500', hex: '#6366f1', glow: 'rgba(99, 102, 241, 0.4)' };

function getTypeVisual(type: EntityType): TypeVisual {
  return TYPE_VISUALS[type] || DEFAULT_VISUAL;
}

export const getTypeTextColor = (type: EntityType) => getTypeVisual(type).text;

/** Solid Tailwind bg-color class for stat bars / legend dots (e.g. VaultStatsView). */
export const getTypeBarColor = (type: EntityType) => getTypeVisual(type).bar;

/** Raw hex + glow for canvas/SVG rendering (GraphView nodes). */
export const getTypeHexColor = (type: EntityType): { main: string; glow: string } => {
  const v = getTypeVisual(type);
  return { main: v.hex, glow: v.glow };
};

export const getTypeIcon = (type: EntityType, className = "h-3.5 w-3.5") => {
  const hasTextColor = className.split(' ').some(cls => cls.startsWith('text-'));
  const finalClass = hasTextColor ? className : `${className} ${getTypeTextColor(type)}`;
  switch (type as any) {
    case 'book': return <Book className={finalClass} />;
    case 'chapter': return <BookOpen className={finalClass} />;
    case 'character': return <User className={finalClass} />;
    case 'relationship': return <Share2 className={finalClass} />;
    case 'item': return <Gem className={finalClass} />;
    case 'map': return <Map className={finalClass} />;
    case 'power': return <Zap className={finalClass} />;
    case 'lore': return <Scroll className={finalClass} />;
    case 'organization': return <Network className={finalClass} />;
    case 'place': return <MapPin className={finalClass} />;
    case 'scene': return <FileText className={finalClass} />;
    case 'storyline': return <GitCommit className={finalClass} />;
    case 'brainstorm': return <Lightbulb className={finalClass} />;
    case 'note': return <StickyNote className={finalClass} />;
    case 'visual': return <Palette className={finalClass} />;
    default: return <FileText className={finalClass} />;
  }
};

export const getTypeColor = (type: EntityType) => {
  const v = getTypeVisual(type);
  return `${v.text} ${v.border} ${v.bg}`;
};

interface EntityTypeBadgeProps {
  type: EntityType;
  language?: Language | string;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md';
  uppercase?: boolean;
  className?: string;
}

export const EntityTypeBadge: React.FC<EntityTypeBadgeProps> = ({
  type,
  language = 'de',
  showIcon = true,
  showLabel = true,
  size = 'sm',
  uppercase = false,
  className = ''
}) => {
  const safeLang: Language = language === 'en' ? 'en' : 'de';
  const colorClass = getTypeColor(type);
  const label = getTypeTranslation(type, safeLang);

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[9px] gap-1',
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5'
  }[size];

  const iconSizeClasses = {
    xs: 'h-3 w-3',
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4'
  }[size];

  return (
    <span
      className={`inline-flex items-center font-mono font-medium border rounded-md shrink-0 ${sizeClasses} ${colorClass} ${className}`}
    >
      {showIcon && getTypeIcon(type, iconSizeClasses)}
      {showLabel && <span>{uppercase ? label.toUpperCase() : label}</span>}
    </span>
  );
};

export default EntityTypeBadge;
