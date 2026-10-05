/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useMemo } from 'react';
import { LoreEntity, EntityType, LooseMediaAsset } from '../types';
import { Language, getTypeTranslation } from '../utils/i18n';
import EntityTypeBadge, { getTypeColor, getTypeIcon } from './EntityTypeBadge';
import { WikiTextRenderer } from './WikiTextRenderer';
import { Map, Eye, Images, Link2, Target } from 'lucide-react';
import { inferTypeAndTemplateFromTitle } from '../utils/markdown';

interface EntityDetailViewProps {
  entity: LoreEntity;
  entities: Record<string, LoreEntity>;
  looseMedia?: Record<string, LooseMediaAsset>;
  language: Language;
  onSelectEntity: (id: string) => void;
  onAddEntity?: (type: EntityType, title: string, parentId?: string, templateId?: string) => void;
  onEnlargeImage?: (url: string, index?: number) => void;
  onOpenMapModal?: (readOnly: boolean) => void;
  /** Enables ticking checkboxes directly in this read-only view. */
  onContentChange?: (newContent: string) => void;
  className?: string;
}

export const EntityDetailView: React.FC<EntityDetailViewProps> = ({
  entity,
  entities,
  looseMedia = {},
  language,
  onSelectEntity,
  onAddEntity,
  onEnlargeImage,
  onOpenMapModal,
  onContentChange,
  className = '',
}) => {
  // Compute incoming connections (backlinks)
  const incomingConnections = useMemo(() => {
    if (!entity) return [];
    const targetId = entity.id;
    const targetTitleLower = entity.title.toLowerCase();

    return (Object.values(entities) as LoreEntity[]).filter((other) => {
      if (other.id === targetId) return false;
      const hasRelation = other.relations?.some((r) => r.targetId === targetId);
      if (hasRelation) return true;

      const content = other.content || '';
      const targetTitleEsc = targetTitleLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const targetIdEsc = targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wikiRegex = new RegExp(`(?<!\\!)\\[\\[(?:${targetTitleEsc}|${targetIdEsc})(?:\\|[^\\]]+)?\\]\\]`, 'i');
      if (wikiRegex.test(content)) return true;
      return false;
    });
  }, [entity, entities]);

  // Render Word Progress Bar if Word Goal custom field exists
  const renderWordProgressBar = () => {
    const rawGoal = entity.customFields['Wortziel'] || entity.customFields['WordGoal'] || entity.customFields['Word Goal'];
    if (!rawGoal) return null;

    const targetWords = parseInt(rawGoal.replace(/\D/g, ''), 10) || 0;
    if (targetWords <= 0) return null;

    // Calculate words in content
    const text = entity.content || '';
    const clean = text.replace(/```[\s\S]*?```/g, '').replace(/\[\[[^\]]+\]\]/g, 'Word');
    const wordCount = clean.trim() ? clean.trim().split(/\s+/).length : 0;
    const progress = Math.min(100, Math.round((wordCount / targetWords) * 100));

    return (
      <div className="bg-surface-card border border-line/80 rounded-xl p-3 flex flex-col gap-2 my-3 shadow-inner">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-ink-secondary font-bold flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-indigo-400" />
            <span>{language === 'en' ? 'Word Goal Progress' : 'Wortziel-Fortschritt'}</span>
          </span>
          <span className="text-indigo-300 font-bold">
            {wordCount.toLocaleString()} / {targetWords.toLocaleString()} w ({progress}%)
          </span>
        </div>
        <div className="w-full bg-surface-control h-2 rounded-full overflow-hidden border border-line">
          <div
            className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  };

  // WikiLink renderer inside custom fields
  const renderCustomFieldValue = (text: string) => {
    if (!text) return '—';
    const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = wikiLinkRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > 0 && text[matchIndex - 1] === '!') {
        continue;
      }
      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }

      const target = match[1].trim();
      const display = match[2] ? match[2].trim() : target;
      const slug = target.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
      const exists = !!entities[slug] || !!entities[target];

      parts.push(
        <button
          key={matchIndex}
          onClick={(e) => {
            e.stopPropagation();
            if (exists) {
              onSelectEntity(slug || target);
            } else if (onAddEntity) {
              const inferred = inferTypeAndTemplateFromTitle(target, entity.type);
              onAddEntity(inferred.type, inferred.cleanTitle, entity.id, inferred.templateId);
            }
          }}
          className={`font-mono text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition mx-0.5 inline-block align-middle wikilink-btn ${
            exists
              ? 'wikilink-exists bg-indigo-950/40 text-indigo-400 border border-indigo-900/40 hover:bg-indigo-600 hover:text-white'
              : 'wikilink-missing bg-surface-control text-ink-muted border border-line/60 hover:bg-indigo-600 hover:text-white border-dashed'
          }`}
          title={exists
            ? (language === 'en' ? 'Go to entry' : 'Navigiere zu Eintrag')
            : (language === 'en' ? 'Click to create this missing entry' : 'Klicke, um diesen fehlenden Eintrag zu erstellen')}
          type="button"
        >
          {display}
        </button>
      );

      lastIndex = wikiLinkRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : '—';
  };

  const galleryImages = [
    ...(entity.imageUrl ? [entity.imageUrl] : []),
    ...(entity.galleryImageUrls || []),
  ].filter((u): u is string => Boolean(u) && u.trim() !== '');

  return (
    <div className={`h-full overflow-auto bg-surface-base p-4 sm:p-6 md:p-8 select-text ${className}`}>
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {/* Top Header Section */}
        <div className="flex flex-col sm:flex-row gap-5 items-start border-b border-line/80 pb-6">
          {/* Map Image / Hero Image */}
          {entity.type === 'map' ? (
            <div
              onClick={() => onOpenMapModal && onOpenMapModal(true)}
              className="w-full sm:w-48 aspect-square rounded-xl overflow-hidden border border-indigo-800/80 bg-surface-base shadow-xl flex-shrink-0 relative group cursor-pointer"
              title={language === 'en' ? 'Click to open Interactive Map Studio' : 'Klicken, um die interaktive Karte zu öffnen'}
            >
              {entity.imageUrl ? (
                <img src={entity.imageUrl} alt="Map Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-3 text-indigo-400 bg-indigo-950/30">
                  <Map className="h-8 w-8 mb-1" />
                  <span className="text-[10px] font-mono font-bold text-center">{entity.title}</span>
                </div>
              )}
              {(entity.mapMarkers || [])
                .filter((m) => !m.floorId || m.floorId === 'main' || m.floorId === entity.mapFloors?.[0]?.id)
                .map((m) => (
                  <div
                    key={m.id}
                    className="absolute w-2.5 h-2.5 rounded-full bg-amber-400 border border-black transform -translate-x-1/2 -translate-y-1/2 shadow-sm"
                    style={{ left: `${m.x}%`, top: `${m.y}%` }}
                  />
                ))}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center p-2 text-center backdrop-blur-[1px]">
                <span className="text-[10px] font-mono font-bold text-white bg-indigo-600 px-2.5 py-1 rounded shadow flex items-center gap-1">
                  <Map className="h-3.5 w-3.5" />
                  {language === 'en' ? 'Open Map' : 'Große Karte öffnen'}
                </span>
              </div>
            </div>
          ) : galleryImages.length > 0 ? (
            <div className="flex flex-col gap-2 flex-shrink-0 w-40 sm:w-44">
              <div
                onClick={() => onEnlargeImage && onEnlargeImage(galleryImages[0], 0)}
                className="w-40 h-40 sm:w-44 sm:h-44 aspect-square rounded-xl overflow-hidden border border-line bg-surface-base shadow-xl relative group cursor-pointer shrink-0"
                title={language === 'en' ? 'Click to open image gallery' : 'Klicken, um Bildgalerie zu öffnen'}
              >
                <img
                  src={galleryImages[0]}
                  alt={entity.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center backdrop-blur-[1px]">
                  <Eye className="h-4 w-4 text-ink-heading drop-shadow" />
                </div>

                {galleryImages.length > 1 && (
                  <div className="absolute bottom-1.5 right-1.5 bg-black/85 backdrop-blur-md border border-line-strong/80 text-ink-bright text-[9px] font-mono px-1.5 py-0.5 rounded shadow flex items-center gap-1">
                    <Images className="h-2.5 w-2.5 text-indigo-400" />
                    <span>+{galleryImages.length - 1}</span>
                  </div>
                )}
              </div>

              {/* Gallery Thumbnails */}
              {galleryImages.length > 1 && (
                <div className="grid grid-cols-4 gap-1.5 w-40 sm:w-44">
                  {galleryImages.slice(1).map((gUrl, gIdx) => (
                    <button
                      key={gIdx}
                      type="button"
                      onClick={() => onEnlargeImage && onEnlargeImage(gUrl, gIdx + 1)}
                      className="aspect-square rounded-md overflow-hidden border border-line hover:border-indigo-400 opacity-80 hover:opacity-100 transition cursor-pointer group"
                    >
                      <img src={gUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Title, Badge & Metadata Summary */}
          <div className="flex-1 w-full min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <EntityTypeBadge type={entity.type} language={language} size="xs" uppercase={true} />
              {entity.tags.map((tag) => (
                <span key={tag} className="text-[9px] font-mono yaml-tag px-2 py-0.5 rounded-full shadow-sm">
                  #{tag}
                </span>
              ))}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold font-sans text-ink-heading tracking-tight leading-snug">
              {entity.title}
            </h2>

            {/* Word Goal Progress Bar */}
            {renderWordProgressBar()}

            {/* Custom Fields Grid */}
            {Object.keys(entity.customFields || {}).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-line/60">
                {Object.entries(entity.customFields)
                  .filter(([key]) => {
                    const lower = key.toLowerCase();
                    return ![
                      'basisbild',
                      'markerdaten',
                      'loretyp',
                      'schauplatz',
                      'beteiligte',
                      'zugehöriges system',
                      'base image',
                      'marker data',
                      'lore type',
                      'setting',
                      'participants',
                      'associated system',
                      'fortschritt',
                      'progress',
                      'wortanzahl',
                      'word count',
                      'zeitpunkt',
                      'time',
                    ].includes(lower);
                  })
                  .map(([key, val]) => (
                    <div key={key} className="text-[10px] font-mono leading-relaxed flex items-baseline gap-1 flex-wrap">
                      <span className="text-ink-muted font-medium whitespace-nowrap">{key}:</span>{' '}
                      <span className="text-ink">{renderCustomFieldValue(String(val))}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Structured Body Content */}
        <div className="bg-surface-card border border-line/80 rounded-2xl p-5 shadow-lg flex flex-col gap-3">
          <div className="text-[10px] font-mono text-ink-muted font-bold uppercase tracking-wider border-b border-line/60 pb-2">
            {language === 'en' ? 'CONTENT & DESCRIPTION' : 'INHALT / BESCHREIBUNG'}
          </div>

          <div className="text-xs leading-relaxed text-ink space-y-3 font-sans">
            {entity.content ? (
              <WikiTextRenderer
                content={entity.content}
                entities={entities}
                looseMedia={looseMedia}
                onSelectEntity={onSelectEntity}
                onAddEntity={onAddEntity}
                onContentChange={onContentChange}
              />
            ) : (
              <span className="text-ink-faint italic">
                {language === 'en' ? 'No content recorded yet.' : 'Kein Inhalt vorhanden.'}
              </span>
            )}
          </div>
        </div>

        {/* Relationships and Backlinks Grid */}
        <div className="border-t border-line/80 pt-6 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-6 pb-8">
          {/* Outgoing relationships */}
          <div>
            <h4 className="text-[10px] font-mono font-bold tracking-wider text-ink-secondary uppercase mb-3 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-indigo-400" />
              <span>{language === 'en' ? 'OUTGOING RELATIONSHIPS' : 'AUSGEHENDE BEZIEHUNGEN'}</span>
            </h4>
            <div className="flex flex-col gap-2">
              {entity.relations?.map((rel, idx) => {
                const target = entities[rel.targetId];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectEntity(rel.targetId)}
                    className="text-left w-full p-2.5 bg-surface-card hover:bg-surface-hover/40 border border-line/80 rounded-xl text-[10px] font-mono flex items-center justify-between cursor-pointer transition-colors shadow-sm"
                  >
                    <span className="text-indigo-400 font-bold">{target ? target.title : rel.targetId}</span>
                    <span className="text-ink-muted">({rel.type})</span>
                  </button>
                );
              })}
              {(!entity.relations || entity.relations.length === 0) && (
                <span className="text-[10px] font-mono text-ink-faint italic">
                  {language === 'en' ? 'No relationships mapped yet.' : 'Noch keine Beziehungen kartiert.'}
                </span>
              )}
            </div>
          </div>

          {/* Backlinks / Incoming connections */}
          <div>
            <h4 className="text-[10px] font-mono font-bold tracking-wider text-ink-secondary uppercase mb-3 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>{language === 'en' ? 'BACKLINKS (MENTIONS)' : 'RÜCKVERWEISE (ERWÄHNUNGEN)'}</span>
            </h4>
            <div className="flex flex-col gap-2">
              {incomingConnections.map((inc, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectEntity(inc.id)}
                  className="text-left w-full p-2.5 bg-surface-card hover:bg-surface-hover/40 border border-line/80 rounded-xl text-[10px] font-mono flex items-center justify-between cursor-pointer transition-colors shadow-sm"
                >
                  <span className="text-indigo-400 font-bold">{inc.title}</span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 border rounded flex items-center gap-1 ${getTypeColor(inc.type)}`}>
                    {getTypeIcon(inc.type, 'h-2.5 w-2.5')}
                    <span>{getTypeTranslation(inc.type, language).toUpperCase()}</span>
                  </span>
                </button>
              ))}
              {incomingConnections.length === 0 && (
                <span className="text-[10px] font-mono text-ink-faint italic">
                  {language === 'en' ? 'No backlinks recorded yet.' : 'Noch keine Rückverweise verzeichnet.'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
