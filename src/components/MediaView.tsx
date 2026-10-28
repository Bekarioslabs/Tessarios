/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState } from 'react';
import { LoreEntity, EntityType, LooseMediaAsset } from '../types';
import { slugify } from '../utils/markdown';
import { getTypeTranslation } from '../utils/i18n';
import { getLinkedEntities, getGalleryImageUrls, mediaFileName } from '../utils/media';
import { getTypeIcon } from './EntityTypeBadge';
import { ImageUploadModal, ImageUploadResult } from './ImageUploadModal';
import { BaseModal } from './BaseModal';
import { RightPanelTabBar } from './RightPanelTabBar';
import { Toast } from './Toast';
import {
  Search,
  Copy,
  Check,
  Folder,
  FolderOpen,
  Plus,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Trash2,
  X,
  Upload,
  Images
} from 'lucide-react';

interface MediaViewProps {
  entities: Record<string, LoreEntity>;
  looseMedia?: Record<string, LooseMediaAsset>;
  activeEntity: LoreEntity | null;
  onUpdateEntity: (entity: LoreEntity) => void;
  onSelectEntity: (id: string) => void;
  onAddEntity?: (type: EntityType, title: string, parentId?: string, templateId?: string, initialImageUrl?: string) => void;
  onAddLooseMedia?: (asset: LooseMediaAsset) => void;
  onDeleteLooseMedia?: (id: string) => void;
  language: 'de' | 'en';
  rightPanelTab: 'ai' | 'media' | 'stats';
  onTabChange: (tab: 'ai' | 'media' | 'stats') => void;
  onToggleCollapse?: () => void;
}

export interface MediaGridItem {
  id: string;
  title: string;
  imageUrl: string;
  isLoose: boolean;
  entity?: LoreEntity;
  looseAsset?: LooseMediaAsset;
  linkedEntities: LoreEntity[];
}

/** Section key: a real entity type, or the pseudo-group for images nobody links to yet. */
type SectionKey = EntityType | 'unlinked';

// Fixed browsing order for entity-type sections — matches the EntityType declaration
// order in types.ts, so it stays predictable rather than shuffling as data changes.
const ENTITY_TYPE_ORDER: EntityType[] = [
  'book', 'chapter', 'character', 'relationship', 'item', 'map', 'power', 'lore',
  'organization', 'place', 'scene', 'storyline', 'brainstorm', 'note', 'visual',
];

export default function MediaView({
  entities,
  looseMedia = {},
  activeEntity,
  onUpdateEntity,
  onSelectEntity,
  onAddEntity,
  onAddLooseMedia,
  onDeleteLooseMedia,
  language,
  rightPanelTab,
  onTabChange,
  onToggleCollapse
}: MediaViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [moveNotification, setMoveNotification] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [uploadModalFile, setUploadModalFile] = useState<File | null>(null);

  // Modal states
  const [pendingDeleteItem, setPendingDeleteItem] = useState<MediaGridItem | null>(null);
  const [pendingGalleryLinkItem, setPendingGalleryLinkItem] = useState<MediaGridItem | null>(null);
  const [galleryLinkSearch, setGalleryLinkSearch] = useState('');

  const term = searchTerm.toLowerCase().trim();
  const seenImageUrls = new Set<string>();
  const allItems: MediaGridItem[] = [];

  // An image matches a search term if its own title matches, or if any entity it's
  // linked to matches by title, category, or tag — typing "map" should surface every
  // image linked to a map-type entry, not just images whose filename contains "map".
  const matchesLinkedEntities = (linked: LoreEntity[]): boolean =>
    linked.some((e) =>
      e.title.toLowerCase().includes(term) ||
      getTypeTranslation(e.type, language).toLowerCase().includes(term) ||
      (e.tags && e.tags.some((t) => t.toLowerCase().includes(term)))
    );

  // 1. Loose Media Assets (primary source)
  Object.values(looseMedia || {}).forEach((m) => {
    if (!m.imageUrl || seenImageUrls.has(m.imageUrl)) return;
    seenImageUrls.add(m.imageUrl);

    const linkedEntities = getLinkedEntities(m.imageUrl, entities);
    const matchesSearch = !term || m.title.toLowerCase().includes(term) || matchesLinkedEntities(linkedEntities);
    if (matchesSearch) {
      allItems.push({
        id: m.id,
        title: m.title,
        imageUrl: m.imageUrl,
        isLoose: true,
        looseAsset: m,
        linkedEntities,
      });
    }
  });

  // 2. Entities with images (fallback if image not in looseMedia)
  Object.values(entities).forEach((e) => {
    if (!e.imageUrl || !e.imageUrl.trim() || seenImageUrls.has(e.imageUrl)) return;
    seenImageUrls.add(e.imageUrl);

    const linkedEntities = getLinkedEntities(e.imageUrl, entities);
    const matchesSearch = !term || e.title.toLowerCase().includes(term) || matchesLinkedEntities(linkedEntities);

    if (matchesSearch) {
      allItems.push({
        id: `entity-media-${e.id}`,
        title: e.title,
        imageUrl: e.imageUrl,
        isLoose: false,
        entity: e,
        linkedEntities,
      });
    }
  });

  // 3. Images that only sit in an entry's gallery (neither a loose upload nor any entry's main image)
  getGalleryImageUrls(entities).forEach((url) => {
    if (seenImageUrls.has(url)) return;
    seenImageUrls.add(url);

    const linkedEntities = getLinkedEntities(url, entities);
    const title = mediaFileName(url);
    const matchesSearch = !term || title.toLowerCase().includes(term) || matchesLinkedEntities(linkedEntities);

    if (matchesSearch) {
      allItems.push({
        id: `gallery-media-${url}`,
        title,
        imageUrl: url,
        isLoose: false,
        linkedEntities,
      });
    }
  });

  // Group by every entity type that actually links to each image — an image can land in
  // several sections at once (e.g. a portrait shared by a character and a relationship).
  // Images nobody links to yet fall into 'unlinked' (shown as "Uploads").
  const groupedMedia: Record<string, MediaGridItem[]> = {};
  allItems.forEach((item) => {
    if (item.linkedEntities.length === 0) {
      (groupedMedia['unlinked'] = groupedMedia['unlinked'] || []).push(item);
      return;
    }
    const seenTypes = new Set<EntityType>();
    item.linkedEntities.forEach((linked) => {
      if (seenTypes.has(linked.type)) return;
      seenTypes.add(linked.type);
      (groupedMedia[linked.type] = groupedMedia[linked.type] || []).push(item);
    });
  });

  const sectionKeys: SectionKey[] = [
    'unlinked',
    ...ENTITY_TYPE_ORDER.filter((t) => (groupedMedia[t]?.length || 0) > 0),
  ];

  const sectionLabel = (key: SectionKey): string => {
    if (key === 'unlinked') return language === 'en' ? 'Uploads' : 'Uploads';
    return getTypeTranslation(key, language);
  };

  const sectionIcon = (key: SectionKey, className: string) => {
    if (key === 'unlinked') return <Upload className={className} />;
    return getTypeIcon(key, className);
  };

  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleInsertReference = (title: string) => {
    if (!activeEntity) return;
    const refText = `![[${title}]]`;
    if (typeof (window as any).insertTextAtEditorCursor === 'function') {
      (window as any).insertTextAtEditorCursor(refText);
    } else {
      onUpdateEntity({
        ...activeEntity,
        content: (activeEntity.content || '') + `\n\n${refText}\n`,
        lastModified: Date.now()
      });
    }
  };

  const handleCopyReference = (id: string, title: string) => {
    const refText = `![[${title}]]`;
    navigator.clipboard.writeText(refText).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const handleUploadComplete = (result: ImageUploadResult) => {
    if (result.mode === 'loose') {
      const id = 'media-' + Date.now() + '-' + slugify(result.title);
      if (onAddLooseMedia) {
        onAddLooseMedia({
          id,
          title: result.title,
          imageUrl: result.url,
          createdAt: Date.now()
        });
      }
    } else if (result.mode === 'active' && activeEntity) {
      onUpdateEntity({
        ...activeEntity,
        imageUrl: result.url,
        lastModified: Date.now()
      });
    }
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteItem) return;
    const targetUrl = pendingDeleteItem.imageUrl;

    if (pendingDeleteItem.isLoose && onDeleteLooseMedia) {
      onDeleteLooseMedia(pendingDeleteItem.id);
    }

    // Unlink image from any entities that use it as main image or gallery image
    Object.values(entities).forEach((ent) => {
      let changed = false;
      const newEnt = { ...ent };

      if (newEnt.imageUrl === targetUrl) {
        newEnt.imageUrl = undefined;
        changed = true;
      }
      if (newEnt.galleryImageUrls && newEnt.galleryImageUrls.includes(targetUrl)) {
        newEnt.galleryImageUrls = newEnt.galleryImageUrls.filter(u => u !== targetUrl);
        changed = true;
      }

      if (changed) {
        onUpdateEntity({
          ...newEnt,
          lastModified: Date.now()
        });
      }
    });

    setPendingDeleteItem(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface-card border border-line rounded-xl overflow-hidden relative" id="media-view-container">
      <RightPanelTabBar
        rightPanelTab={rightPanelTab}
        onTabChange={onTabChange}
        language={language}
        onToggleCollapse={onToggleCollapse}
      />

      {/* Search Input Bar */}
      <div className="p-2.5 border-b border-line/80 bg-surface-card shrink-0 flex items-center gap-2">
        <div className="relative flex-1 flex items-center bg-surface-base border border-line rounded px-2.5 py-1">
          <Search className="h-3.5 w-3.5 text-ink-muted mr-2 flex-shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              language === 'en' ? 'Search media database...' : 'Bilder-Datenbank durchsuchen...'
            }
            className="w-full bg-transparent text-xs text-ink-bright outline-none font-mono placeholder:text-ink-faint"
          />
        </div>

        <input
          type="file"
          id="media-view-upload-input"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setUploadModalFile(file);
              e.target.value = '';
            }
          }}
        />
        <button
          type="button"
          onClick={() => document.getElementById('media-view-upload-input')?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-mono font-semibold transition cursor-pointer shrink-0"
          title={language === 'en' ? 'Upload image' : 'Bild hochladen'}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{language === 'en' ? 'Upload' : 'Hochladen'}</span>
        </button>
      </div>

      {/* Main Folder-structure Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 flex flex-col gap-2.5 custom-scrollbar">
        {sectionKeys.map((key) => {
          const list = groupedMedia[key] || [];
          const isExpanded = !collapsedSections[key];

          return (
            <div
              key={key}
              className="border border-line bg-surface-base/40 rounded-lg overflow-hidden shrink-0"
            >
              {/* Collapsible Folder Header */}
              <button
                onClick={() => toggleSection(key)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 bg-surface-base/80 hover:bg-surface-control border-b border-line transition-colors text-left font-mono text-[11px] font-semibold text-ink shrink-0 cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <FolderOpen className="h-4 w-4 text-indigo-400 shrink-0" />
                  ) : (
                    <Folder className="h-4 w-4 text-ink-muted shrink-0" />
                  )}
                  {sectionIcon(key, 'h-3.5 w-3.5 shrink-0')}
                  <span>{sectionLabel(key)}</span>
                  <span className="text-[9px] text-ink-muted bg-surface-card px-1.5 py-0.5 rounded border border-line font-normal">
                    {list.length}
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-ink-muted shrink-0" />
                )}
              </button>

              {/* Grid layout inside Folder - 3 to 4 smaller columns */}
              {isExpanded && (
                <div className="p-2 grid grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {list.length === 0 && (
                    <div className="col-span-full py-4 text-center text-[10px] font-mono text-ink-faint">
                      {language === 'en' ? 'No images linked here yet.' : 'Hier noch keine Bilder verlinkt.'}
                    </div>
                  )}
                  {list.map((item) => (
                    <div
                      key={item.id}
                      className="group relative bg-surface-card border border-line hover:border-line-strong rounded-lg overflow-hidden flex flex-col transition shadow-sm cursor-pointer"
                      onClick={() => {
                        if (!item.isLoose && item.entity) {
                          onSelectEntity(item.entity.id);
                        }
                      }}
                    >
                      {/* Image Thumbnail Slot */}
                      <div className="aspect-square bg-surface-base flex items-center justify-center relative overflow-hidden">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />

                        {/* Quick action overlay buttons */}
                        <div
                          className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 flex-wrap p-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Insert reference button into active text */}
                          {activeEntity && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInsertReference(item.title);
                              }}
                              className="p-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition shadow cursor-pointer"
                              title={
                                language === 'en'
                                  ? `Insert ![[${item.title}]] into active text`
                                  : `![[${item.title}]] in aktuellen Text einfügen`
                              }
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          )}

                          {/* Copy WikiLink Code */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyReference(item.id, item.title);
                            }}
                            className="p-1 rounded bg-surface-hover hover:bg-surface-active text-ink-bright transition shadow cursor-pointer"
                            title={
                              language === 'en'
                                ? `Copy reference code ![[${item.title}]]`
                                : `Code ![[${item.title}]] kopieren`
                            }
                          >
                            {copiedId === item.id ? (
                              <Check className="h-3 w-3 text-green-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>

                          {/* Set as main portrait image of currently active dossier */}
                          {activeEntity && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateEntity({
                                  ...activeEntity,
                                  imageUrl: item.imageUrl,
                                  lastModified: Date.now()
                                });
                              }}
                              className="p-1 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/80 transition shadow cursor-pointer"
                              title={
                                language === 'en'
                                  ? `Set as main image for "${activeEntity.title}"`
                                  : `Als Hauptbild für „${activeEntity.title}“ übernehmen`
                              }
                            >
                              <ImageIcon className="h-3 w-3" />
                            </button>
                          )}

                          {/* Link to Entity Gallery button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingGalleryLinkItem(item);
                              setGalleryLinkSearch('');
                            }}
                            className="p-1 rounded bg-indigo-950/90 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/80 transition shadow cursor-pointer"
                            title={
                              language === 'en'
                                ? `Link "${item.title}" to entity galleries`
                                : `„${item.title}“ in Chronik-Galerien verlinken`
                            }
                          >
                            <Images className="h-3 w-3" />
                          </button>

                          {/* Jump to Dossier (Only if dossier entity) */}
                          {!item.isLoose && item.entity && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectEntity(item.entity!.id);
                              }}
                              className="p-1 rounded bg-surface-hover hover:bg-surface-active text-ink-bright transition shadow cursor-pointer"
                              title={
                                language === 'en'
                                  ? 'View this entry sheet'
                                  : 'Dossier anzeigen'
                              }
                            >
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          )}

                          {/* Delete image */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeleteItem(item);
                            }}
                            className="p-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 transition shadow cursor-pointer"
                            title={
                              language === 'en'
                                ? 'Delete image'
                                : 'Bild löschen'
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Title Bar footer */}
                      <div className="p-1 bg-surface-base border-t border-line-subtle/60 flex items-center justify-between gap-1 overflow-hidden">
                        <span
                          className="text-[9px] font-mono text-ink truncate font-medium select-none"
                          title={item.title}
                        >
                          {item.title}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Active Entity Quick helper footer info */}
      {activeEntity && (
        <div className="p-2.5 bg-surface-base border-t border-line text-[10px] font-mono text-ink-muted flex items-center gap-1.5 justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>
            {language === 'en'
              ? `Ready to link into: "${activeEntity.title}"`
              : `Bereit zum Einfügen in: „${activeEntity.title}“`}
          </span>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDeleteItem && (() => {
        const imageUrl = pendingDeleteItem.imageUrl;
        const filename = imageUrl.split('/').pop() || '';
        const linkedEntities = Object.values(entities).filter(ent => {
          if (!pendingDeleteItem.isLoose && pendingDeleteItem.entity && ent.id === pendingDeleteItem.entity.id) return false;
          const hasMainImage = ent.imageUrl === imageUrl;
          const hasGalleryImage = (ent.galleryImageUrls || []).includes(imageUrl);
          const hasFloorImage = ent.mapFloors && ent.mapFloors.some(f => f.imageUrl === imageUrl);
          const mentionedInText = !!(ent.content && filename && (
            ent.content.includes(imageUrl) ||
            ent.content.includes(`![[${filename}]]`) ||
            ent.content.includes(`](${filename})`) ||
            ent.content.includes(`](${imageUrl})`)
          ));
          return hasMainImage || hasGalleryImage || hasFloorImage || mentionedInText;
        });

        const usageCount = linkedEntities.length;

        return (
          <div className="absolute inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-fade-in">
            <div className="bg-surface-elevated border border-rose-900/60 rounded-xl p-4 w-full max-w-sm flex flex-col gap-3.5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-line/80 pb-2">
                <div className="flex items-center gap-2 text-rose-400">
                  <Trash2 className="h-4 w-4" />
                  <span className="text-xs font-mono font-bold">
                    {language === 'en' ? 'Delete Image' : 'Bild löschen'}
                  </span>
                </div>
                <button
                  onClick={() => setPendingDeleteItem(null)}
                  className="text-ink-muted hover:text-ink p-1 rounded hover:bg-surface-hover/60 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs font-mono text-ink">
                {language === 'en'
                  ? `Are you sure you want to delete "${pendingDeleteItem.title}"?`
                  : `Möchtest du das Bild „${pendingDeleteItem.title}“ wirklich löschen?`}
              </p>

              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-mono text-ink-muted bg-surface-base p-2 rounded border border-line">
                  {pendingDeleteItem.isLoose
                    ? (language === 'en' ? 'This loose image will be removed from your image database and your hard drive.' : 'Dieses lose Bild wird aus deiner Medien-Datenbank und von der Festplatte entfernt.')
                    : (language === 'en' ? 'The image will be removed from this dossier entry.' : 'Das Hauptbild wird aus diesem Dossier-Eintrag entfernt.')}
                </p>

                {usageCount > 0 && (
                  <div className="text-[10px] font-mono font-medium text-rose-400 bg-rose-950/30 p-2 rounded border border-rose-900/40">
                    <span className="font-bold block mb-1">
                      {language === 'en' ? '⚠️ Image in use!' : '⚠️ Bild in Verwendung!'}
                    </span>
                    {language === 'en'
                      ? `This image is linked in ${usageCount} other dossier(s) (e.g. "${linkedEntities[0].title}"). Deleting it will break those links.`
                      : `Dieses Bild ist noch in ${usageCount} anderen Dossier(s) verknüpft (z.B. „${linkedEntities[0].title}“). Wenn du es löschst, wird es dort fehlerhaft angezeigt.`}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/80">
                <button
                  type="button"
                  onClick={() => setPendingDeleteItem(null)}
                  className="px-3 py-1.5 rounded bg-surface-hover hover:bg-surface-hover text-ink-secondary text-xs font-mono transition cursor-pointer"
                >
                  {language === 'en' ? 'Cancel' : 'Abbrechen'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-semibold transition shadow-md cursor-pointer"
                >
                  {language === 'en' ? 'Delete' : 'Löschen'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Link Image to Gallery Modal */}
      {pendingGalleryLinkItem && (
        <BaseModal
          isOpen={!!pendingGalleryLinkItem}
          onClose={() => setPendingGalleryLinkItem(null)}
          icon={<Images className="h-4 w-4" />}
          title={language === 'en' ? 'Link to Entity Gallery' : 'In Chronik-Galerie verlinken'}
          maxWidth="md"
          footer={
            <button
              type="button"
              onClick={() => setPendingGalleryLinkItem(null)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-mono font-semibold transition cursor-pointer"
            >
              {language === 'en' ? 'Done' : 'Fertig'}
            </button>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-mono text-ink-secondary">
              {language === 'en'
                ? `Select entities to link "${pendingGalleryLinkItem.title}" into their gallery:`
                : `Wähle Chroniken aus, in deren Galerie „${pendingGalleryLinkItem.title}“ angezeigt werden soll:`}
            </p>

            {/* Search Input */}
            <input
              type="text"
              placeholder={language === 'en' ? 'Search entity...' : 'Chronik suchen...'}
              value={galleryLinkSearch}
              onChange={(e) => setGalleryLinkSearch(e.target.value)}
              className="w-full bg-surface-base border border-line rounded-lg px-2.5 py-1.5 text-xs text-ink-heading outline-none focus:border-indigo-500 font-mono"
            />

            {/* Entity list */}
            <div className="flex-1 overflow-y-auto max-h-64 space-y-1 pr-1 scrollbar-thin">
              {Object.values(entities)
                .filter((e) => e.type !== 'map' && e.title.toLowerCase().includes(galleryLinkSearch.toLowerCase()))
                .map((entity) => {
                  const isLinked = (entity.galleryImageUrls || []).includes(pendingGalleryLinkItem.imageUrl);
                  const isPrimary = entity.imageUrl === pendingGalleryLinkItem.imageUrl;

                  return (
                    <div
                      key={entity.id}
                      onClick={() => {
                        const currentList = entity.galleryImageUrls || [];
                        const newList = isLinked
                          ? currentList.filter((url) => url !== pendingGalleryLinkItem.imageUrl)
                          : [...currentList, pendingGalleryLinkItem.imageUrl];

                        onUpdateEntity({
                          ...entity,
                          galleryImageUrls: newList,
                          lastModified: Date.now()
                        });

                        setMoveNotification(
                          isLinked
                            ? (language === 'en' ? `Removed from ${entity.title}` : `Aus Galerie von ${entity.title} entfernt`)
                            : (language === 'en' ? `Linked to ${entity.title}` : `In Galerie von ${entity.title} verlinkt`)
                        );
                        setTimeout(() => setMoveNotification(null), 3000);
                      }}
                      className={`p-2 rounded-lg border flex items-center justify-between cursor-pointer transition text-xs font-mono ${
                        isLinked
                          ? 'bg-indigo-950/60 border-indigo-600/80 text-ink-heading'
                          : 'bg-surface-control/80 border-line text-ink hover:bg-surface-hover'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div className="w-6 h-6 rounded bg-surface-base border border-line overflow-hidden flex-shrink-0">
                          {entity.imageUrl ? (
                            <img src={entity.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] text-ink-faint">MD</div>
                          )}
                        </div>
                        <span className="truncate font-semibold">{entity.title}</span>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {isPrimary && (
                          <span className="text-[9px] bg-amber-950/80 text-amber-300 border border-amber-800/80 px-1.5 py-0.5 rounded">
                            ★ {language === 'en' ? 'Primary' : 'Hauptbild'}
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${
                          isLinked
                            ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                            : 'bg-surface-hover text-ink-secondary border-line-strong'
                        }`}>
                          {isLinked ? (language === 'en' ? 'Linked ✓' : 'Verlinkt ✓') : (language === 'en' ? '+ Link' : '+ Verlinken')}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </BaseModal>
      )}

      {/* Success Notification Banner */}
      {moveNotification && (
        <Toast
          className="absolute top-12 left-1/2 -translate-x-1/2"
          icon={<Check className="h-3.5 w-3.5 text-emerald-400" />}
          message={moveNotification}
        />
      )}
      {/* Unified Image Upload Modal */}
      <ImageUploadModal
        isOpen={uploadModalFile !== null}
        onClose={() => setUploadModalFile(null)}
        file={uploadModalFile}
        activeEntity={activeEntity}
        language={language}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  );
}
