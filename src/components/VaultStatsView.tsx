/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useMemo } from 'react';
import { LoreEntity, EntityType, LooseMediaAsset } from '../types';
import { getTypeTranslation, Language } from '../utils/i18n';
import { countWords } from '../utils/manuscript';
import { getTypeIcon, getTypeColor, getTypeBarColor } from './EntityTypeBadge';
import { RightPanelTabBar } from './RightPanelTabBar';
import {
  Image as ImageIcon,
  FileText,
  Unlink,
  Link2,
  Users,
  Box,
  Compass,
  Sparkles,
  ArrowUpRight,
  PieChart,
  HardDrive,
} from 'lucide-react';

interface VaultStatsViewProps {
  entities: Record<string, LoreEntity>;
  looseMedia?: Record<string, LooseMediaAsset>;
  activeEntity?: LoreEntity | null;
  onSelectEntity: (id: string) => void;
  language: Language;
  rightPanelTab: 'ai' | 'media' | 'stats';
  onTabChange: (tab: 'ai' | 'media' | 'stats') => void;
  onToggleCollapse?: () => void;
}

export default function VaultStatsView({
  entities,
  looseMedia = {},
  activeEntity,
  onSelectEntity,
  language,
  rightPanelTab,
  onTabChange,
  onToggleCollapse,
}: VaultStatsViewProps) {
  // Compute Vault Statistics
  const stats = useMemo(() => {
    const entityList = Object.values(entities);
    const totalEntries = entityList.length;

    // Word count calculation
    let totalWordCount = 0;
    let totalCharCount = 0;

    // Category counts
    const categoryCounts: Record<string, number> = {
      character: 0,
      place: 0,
      item: 0,
      map: 0,
      lore: 0,
      storyline: 0,
    };

    // Images count
    let totalImagesInEntities = 0;
    Object.values(looseMedia || {}).forEach(() => {});

    // Node mapping for Wikilink scanning
    const entityByTitleLower = new Map<string, string>();
    const entityById = new Map<string, LoreEntity>();

    entityList.forEach((e) => {
      entityById.set(e.id, e);
      if (e.title) {
        entityByTitleLower.set(e.title.toLowerCase().trim(), e.id);
      }
      if (e.imageUrl && e.imageUrl.trim()) {
        totalImagesInEntities++;
      }

      // Word count
      const text = e.content || '';
      totalCharCount += text.length;
      totalWordCount += countWords(text);

      // Category counts
      const type = e.type || 'lore';
      categoryCounts[type] = (categoryCounts[type] || 0) + 1;
    });

    // WikiLink graph connections
    const incomingLinksMap = new Map<string, Set<string>>();
    const outgoingLinksMap = new Map<string, Set<string>>();

    entityList.forEach((e) => {
      incomingLinksMap.set(e.id, new Set());
      outgoingLinksMap.set(e.id, new Set());
    });

    const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

    entityList.forEach((sourceEntity) => {
      const sourceId = sourceEntity.id;

      // 1. Explicit relations
      sourceEntity.relations.forEach((rel) => {
        if (entities[rel.targetId] && rel.targetId !== sourceId) {
          outgoingLinksMap.get(sourceId)?.add(rel.targetId);
          incomingLinksMap.get(rel.targetId)?.add(sourceId);
        }
      });

      // 2. Content & custom fields [[WikiLinks]]
      const searchTexts = [
        sourceEntity.content || '',
        ...Object.values(sourceEntity.customFields || {}),
      ];

      searchTexts.forEach((txt) => {
        let match: RegExpExecArray | null;
        WIKILINK_REGEX.lastIndex = 0;
        while ((match = WIKILINK_REGEX.exec(txt)) !== null) {
          const rawTarget = match[1].trim();
          const targetTitleLower = rawTarget.toLowerCase();
          const targetIdFromSlug = targetTitleLower.replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');

          let targetId = entityByTitleLower.get(targetTitleLower) || targetIdFromSlug;

          if (entities[targetId] && targetId !== sourceId) {
            outgoingLinksMap.get(sourceId)?.add(targetId);
            incomingLinksMap.get(targetId)?.add(sourceId);
          }
        }
      });
    });

    // Determine orphaned & connected entries
    const orphanedEntries: LoreEntity[] = [];
    const connectedScores: { entity: LoreEntity; incoming: number; outgoing: number; total: number }[] = [];

    entityList.forEach((e) => {
      const inCount = incomingLinksMap.get(e.id)?.size || 0;
      const outCount = outgoingLinksMap.get(e.id)?.size || 0;
      const total = inCount + outCount;

      if (total === 0) {
        orphanedEntries.push(e);
      } else {
        connectedScores.push({
          entity: e,
          incoming: inCount,
          outgoing: outCount,
          total,
        });
      }
    });

    // Top connected entries sorted descending
    connectedScores.sort((a, b) => b.total - a.total);

    const looseMediaCount = Object.keys(looseMedia || {}).length;

    return {
      totalEntries,
      totalWordCount,
      totalCharCount,
      avgWordsPerEntry: totalEntries > 0 ? Math.round(totalWordCount / totalEntries) : 0,
      categoryCounts,
      totalImagesInEntities,
      looseMediaCount,
      orphanedEntries,
      topConnected: connectedScores.slice(0, 5),
    };
  }, [entities, looseMedia]);

  return (
    <div className="flex flex-col h-full bg-surface-card border border-line rounded-xl overflow-hidden relative">
      <RightPanelTabBar
        rightPanelTab={rightPanelTab}
        onTabChange={onTabChange}
        language={language}
        onToggleCollapse={onToggleCollapse}
      />

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {/* Metric Cards Grid */}
        <div>
          <span className="block text-[10px] font-mono text-ink-muted mb-2 tracking-wider uppercase font-bold">
            {language === 'en' ? 'VAULT OVERVIEW' : 'CHRONIK-ÜBERSICHT'}
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-surface-base/80 border border-line/80 p-3 rounded-xl flex flex-col">
              <div className="flex items-center justify-between text-ink-secondary mb-1">
                <span className="text-[10px] font-mono">{language === 'en' ? 'Total Words' : 'Wörter Gesamt'}</span>
                <FileText className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <span className="text-xl font-bold font-mono text-ink-heading">{stats.totalWordCount.toLocaleString()}</span>
              <span className="text-[9px] font-mono text-ink-muted mt-0.5">
                ~{stats.avgWordsPerEntry} {language === 'en' ? 'words / entry' : 'Wörter / Eintrag'}
              </span>
            </div>

            <div className="bg-surface-base/80 border border-line/80 p-3 rounded-xl flex flex-col">
              <div className="flex items-center justify-between text-ink-secondary mb-1">
                <span className="text-[10px] font-mono">{language === 'en' ? 'Total Entries' : 'Einträge Gesamt'}</span>
                <PieChart className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <span className="text-xl font-bold font-mono text-ink-heading">{stats.totalEntries}</span>
              <span className="text-[9px] font-mono text-ink-muted mt-0.5">
                {stats.totalCharCount.toLocaleString()} {language === 'en' ? 'characters' : 'Zeichen'}
              </span>
            </div>

            <div className="bg-surface-base/80 border border-line/80 p-3 rounded-xl flex flex-col">
              <div className="flex items-center justify-between text-ink-secondary mb-1">
                <span className="text-[10px] font-mono">{language === 'en' ? 'Orphaned' : 'Isoliert'}</span>
                <Unlink className={`h-3.5 w-3.5 ${stats.orphanedEntries.length > 0 ? 'text-amber-400' : 'text-ink-faint'}`} />
              </div>
              <span className={`text-xl font-bold font-mono ${stats.orphanedEntries.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {stats.orphanedEntries.length}
              </span>
              <span className="text-[9px] font-mono text-ink-muted mt-0.5">
                {language === 'en' ? 'without [[WikiLinks]]' : 'ohne [[WikiLinks]]'}
              </span>
            </div>

            <div className="bg-surface-base/80 border border-line/80 p-3 rounded-xl flex flex-col">
              <div className="flex items-center justify-between text-ink-secondary mb-1">
                <span className="text-[10px] font-mono">{language === 'en' ? 'Media Files' : 'Mediendateien'}</span>
                <ImageIcon className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <span className="text-xl font-bold font-mono text-ink-heading">
                {stats.totalImagesInEntities + stats.looseMediaCount}
              </span>
              <span className="text-[9px] font-mono text-ink-muted mt-0.5">
                {stats.totalImagesInEntities} {language === 'en' ? 'portraits' : 'Porträts'} + {stats.looseMediaCount} {language === 'en' ? 'assets' : 'Assets'}
              </span>
            </div>
          </div>
        </div>

        {/* Categories Breakdown */}
        <div>
          <span className="block text-[10px] font-mono text-ink-muted mb-2 tracking-wider uppercase font-bold">
            {language === 'en' ? 'ENTRIES BY CATEGORY' : 'EINTRÄGE NACH KATEGORIE'}
          </span>
          <div className="bg-surface-base/80 border border-line/80 p-3.5 rounded-xl flex flex-col gap-3">
            {Object.entries(stats.categoryCounts)
              .filter(([, rawCount]) => Number(rawCount) > 0 || stats.totalEntries === 0)
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .map(([catType, rawCount]) => {
                const count = Number(rawCount);
                const entityType = catType as EntityType;
                const percent = stats.totalEntries > 0 ? Math.round((count / stats.totalEntries) * 100) : 0;

              return (
                <div key={catType} className="flex flex-col gap-1 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {getTypeIcon(entityType, 'h-3.5 w-3.5')}
                      <span className="text-ink-bright">{getTypeTranslation(entityType, language)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-ink-secondary font-bold">{count}</span>
                      <span className="text-[10px] text-ink-muted w-8 text-right">{percent}%</span>
                    </div>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-surface-control rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full ${getTypeBarColor(entityType)} transition-all duration-500`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Orphaned Entries List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-[10px] font-mono text-ink-muted tracking-wider uppercase font-bold">
              {language === 'en' ? 'ISOLATED / ORPHANED ENTRIES' : 'ISOLIERTE EINTRÄGE (OHNE VERKNÜPFUNG)'}
            </span>
            <span className="text-[10px] font-mono text-ink-muted px-1.5 py-0.5 bg-surface-control rounded">
              {stats.orphanedEntries.length}
            </span>
          </div>

          {stats.orphanedEntries.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {stats.orphanedEntries.map((e) => {
                const wordCount = countWords(e.content);

                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onSelectEntity(e.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                      activeEntity?.id === e.id
                        ? 'bg-indigo-950/60 border-indigo-700/80 text-ink-heading'
                        : 'bg-surface-base/60 hover:bg-surface-control/80 border-line/80 text-ink'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded-lg border ${getTypeColor(e.type)}`}>
                        {getTypeIcon(e.type, 'h-3.5 w-3.5')}
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs font-mono font-semibold truncate text-ink-bright">
                          {e.title}
                        </span>
                        <span className="block text-[9px] font-mono text-ink-muted truncate">
                          {getTypeTranslation(e.type, language)} • {wordCount} {language === 'en' ? 'words' : 'Wörter'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] font-mono text-indigo-400 hover:text-indigo-300 flex-shrink-0">
                      <span>{language === 'en' ? 'Open' : 'Öffnen'}</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl text-center flex flex-col items-center gap-1">
              <Link2 className="h-5 w-5 text-emerald-400 mb-0.5" />
              <span className="text-xs font-mono font-bold text-emerald-300">
                {language === 'en' ? 'All Entries are Connected!' : 'Alle Einträge sind verknüpft!'}
              </span>
              <p className="text-[10px] font-mono text-emerald-400/80 max-w-xs">
                {language === 'en'
                  ? 'Great job! Every document in your vault has at least one incoming or outgoing [[WikiLink]].'
                  : 'Ausgezeichnet! Dokumente in deiner Chronik verfügen über mindestens eine [[WikiLink]]-Verknüpfung.'}
              </p>
            </div>
          )}
        </div>

        {/* Top Connected Hub Entries */}
        {stats.topConnected.length > 0 && (
          <div>
            <span className="block text-[10px] font-mono text-ink-muted mb-2 tracking-wider uppercase font-bold">
              {language === 'en' ? 'CORE LORE ANCHORS (MOST LINKED)' : 'KERN-ANKER (AM MEISTEN VERKNÜPFT)'}
            </span>
            <div className="flex flex-col gap-1.5">
              {stats.topConnected.map(({ entity: e, incoming, outgoing, total }) => {

                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onSelectEntity(e.id)}
                    className="w-full text-left p-2.5 rounded-xl bg-surface-base/60 hover:bg-surface-control/80 border border-line/80 transition cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded-lg border ${getTypeColor(e.type)}`}>
                        {getTypeIcon(e.type, 'h-3.5 w-3.5')}
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs font-mono font-semibold truncate text-ink-bright">
                          {e.title}
                        </span>
                        <span className="block text-[9px] font-mono text-ink-muted">
                          {incoming} {language === 'en' ? 'in' : 'eingehend'}, {outgoing} {language === 'en' ? 'out' : 'ausgehend'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-indigo-950/60 border border-indigo-800/60 px-2 py-1 rounded-lg text-[10px] font-mono text-indigo-300 font-bold">
                      <Link2 className="h-3 w-3" />
                      <span>{total}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
