/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState } from 'react';
import { LoreEntity, EntityType, LooseMediaAsset } from '../types';
import { DEFAULT_TEMPLATES } from '../data/templates';
import { Language, getTranslation, getTypeTranslation as i18nGetTypeTranslation, DEFAULT_TEMPLATES_LOCALIZED, CATEGORIZED_ENTITY_TYPES } from '../utils/i18n';
import { getAvailableTemplates } from '../utils/templateLoader';
import EntityTypeBadge, { getTypeColor, getTypeIcon } from './EntityTypeBadge';
import {
  Search,
  Plus,
  ArrowUpDown,
  Trash2,
  Book,        // Bücher
  BookOpen,    // Kapitel
  User,        // Charaktere
  Share2,      // Beziehungen
  Gem,         // Gegenstände
  // NOTE: lucide's `Map` icon is deliberately not imported here — it shadowed the built-in
  // Map constructor for the whole module (same bug as App.tsx once had) and was unused.
  Zap,         // Kräfte und Systeme
  Scroll,      // Lore
  Network,     // Organisationen
  MapPin,      // Orte
  FileText,    // Szenen
  Lightbulb,   // Brainstorming
  StickyNote,  // Arbeitsnotizen
  Palette,     // Visuelle Entwicklung
  Bot,
  Filter,
  ListFilter,
} from 'lucide-react';
import CollapseToggle from './ui/CollapseToggle';
import { BaseModal } from './BaseModal';

interface SidebarProps {
  entities: Record<string, LoreEntity>;
  looseMedia?: Record<string, LooseMediaAsset>;
  activeEntityId?: string;
  onSelectEntity: (id: string) => void;
  onAddEntity: (type: EntityType, title: string, backlinkId?: string, templateId?: string) => void;
  onDeleteEntity: (id: string) => void;
  language: Language;

  // Layout states
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  localVaultName?: string;
}

export default function Sidebar({
  entities,
  looseMedia = {},
  activeEntityId,
  onSelectEntity,
  onAddEntity,
  onDeleteEntity,
  language,
  isCollapsed = false,
  onToggleCollapse,
  localVaultName,
}: SidebarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<EntityType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'modified' | 'created' | 'alpha'>('modified');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<EntityType>('character');
  const [newTemplateId, setNewTemplateId] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [sidebarAlert, setSidebarAlert] = useState<{ title: string; message: string } | null>(null);

  // Filtering logic
  const filteredEntities = Object.values(entities).filter(entity => {
    const matchesSearch =
      entity.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entity.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase())) ||
      entity.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      Object.entries(entity.customFields).some(
        ([k, v]) => k.toLowerCase().includes(searchTerm.toLowerCase()) || v.toLowerCase().includes(searchTerm.toLowerCase())
      );

    const matchesType = selectedType === 'all' || entity.type === selectedType;

    return matchesSearch && matchesType;
  });

  // Sorting logic
  const sortedEntities = [...filteredEntities].sort((a, b) => {
    let result = 0;
    if (sortBy === 'alpha') {
      result = a.title.localeCompare(b.title, language === 'de' ? 'de' : 'en');
    } else if (sortBy === 'created') {
      const timeA = a.createdAt || a.lastModified || 0;
      const timeB = b.createdAt || b.lastModified || 0;
      result = timeA - timeB;
    } else {
      // modified
      const timeA = a.lastModified || 0;
      const timeB = b.lastModified || 0;
      result = timeA - timeB;
    }
    return sortOrder === 'desc' ? -result : result;
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddEntity(newType, newTitle.trim(), undefined, newTemplateId || undefined);
    setNewTitle('');
    setNewTemplateId('');
    setIsAdding(false);
  };

  const getTypeTranslation = (type: EntityType | 'all') => {
    return i18nGetTypeTranslation(type, language).toUpperCase();
  };

  // Render Collapsed Rail mode if sidebar is collapsed
  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full bg-surface-card border-r border-line/80 w-full items-center py-2 gap-3" id="sidebar-container-collapsed">
        {/* Toggle Expand button */}
        <CollapseToggle
          collapsed={true}
          onToggle={() => onToggleCollapse && onToggleCollapse()}
          direction="horizontal-left"
          titleExpand={language === 'en' ? 'Expand Sidebar' : 'Sidebar ausklappen'}
          titleCollapse=""
        />

        {/* Quick Add Button */}
        <button
          onClick={() => {
            if (onToggleCollapse) onToggleCollapse();
            setIsAdding(true);
          }}
          className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer shadow-[0_0_10px_rgba(0,96,229,0.3)]"
          title={language === 'en' ? 'Forge New Entry' : 'Neuen Eintrag schmieden'}
        >
          <Plus className="h-4 w-4" />
        </button>

        <div className="w-8 h-[1px] bg-surface-hover my-1" />

        {/* Vertical Icon Rail of entities with matched icon colors */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden w-full flex flex-col items-center gap-2 px-1 scrollbar-none">
          {sortedEntities.map(entity => {
            const isActive = entity.id === activeEntityId;
            const style = getTypeColor(entity.type);

            return (
              <button
                key={entity.id}
                onClick={() => onSelectEntity(entity.id)}
                className={`relative p-1.5 rounded-lg transition cursor-pointer flex items-center justify-center border ${style} ${
                  isActive
                    ? 'ring-2 ring-indigo-500 shadow-[0_0_10px_rgba(0,96,229,0.3)] scale-105'
                    : 'opacity-80 hover:opacity-100 hover:scale-105'
                }`}
                title={`${entity.title} (${getTypeTranslation(entity.type)})`}
              >
                {getTypeIcon(entity.type, "h-4 w-4")}
                {isActive && (
                  <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-4 bg-indigo-500 rounded-r" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-card border-r border-line/80" id="sidebar-container">
      {/* Header with Title & Collapse Toggle */}
      <div className="px-3 py-2 bg-surface-base border-b border-line/80 flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <BookOpen className="h-4 w-4 text-indigo-400 shrink-0" />
          <span className="text-xs font-mono font-bold text-ink-bright uppercase tracking-wider truncate">
            {language === 'en' ? 'Chronicles' : 'Chroniken'}
          </span>
          <span className="text-[10px] font-mono text-ink-muted bg-surface-control px-1.5 py-0.5 rounded border border-line/80">
            {Object.keys(entities).length}
          </span>
        </div>

        {onToggleCollapse && (
          <CollapseToggle
            collapsed={false}
            onToggle={onToggleCollapse}
            direction="horizontal-left"
            titleExpand=""
            titleCollapse={language === 'en' ? 'Collapse Sidebar' : 'Sidebar einklappen'}
          />
        )}
      </div>

      {/* Top Search bar & Category Dropdown */}
      <div className="p-3 bg-surface-base flex flex-col gap-2 border-b border-line/50">
        <div className="flex items-center gap-2 bg-surface-base/50 border border-line rounded-lg px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-ink-muted flex-shrink-0" />
          <input
            type="text"
            placeholder={language === 'en' ? "Filter vault (e.g. #magic)..." : "Tresor filtern (z.B. #magie)..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none text-xs text-ink-bright outline-none w-full font-mono"
          />
        </div>

        {/* Space-Saving Category Dropdown */}
        <div className="flex items-center gap-1.5 bg-surface-base/50 border border-line rounded-lg px-2.5 py-1 text-xs">
          <ListFilter className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className="bg-transparent border-none text-[11px] text-ink-bright outline-none w-full font-mono cursor-pointer py-1"
          >
            {['all', 'book', 'chapter', 'character', 'relationship', 'item', 'map', 'power', 'lore', 'organization', 'place', 'scene', 'storyline', 'note', 'brainstorm', 'visual'].map(type => {
              const count = type === 'all' 
                ? Object.keys(entities).length 
                : Object.values(entities).filter(e => e.type === type).length;

              return (
                <option key={type} value={type} className="bg-surface-card text-ink-bright">
                  {getTypeTranslation(type as any)} ({count})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Compact Sort Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-base/80 border-y border-line/70 text-[10px] font-mono text-ink-secondary select-none">
        <div className="flex items-center gap-1.5 text-ink-muted">
          <ArrowUpDown className="h-3 w-3 text-indigo-400 flex-shrink-0" />
          <span>{language === 'en' ? 'Sort:' : 'Sortierung:'}</span>
        </div>

        <div className="flex items-center gap-1">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-surface-base border border-line rounded px-1.5 py-0.5 text-[10px] text-ink-bright outline-none cursor-pointer hover:border-line-strong transition font-mono"
          >
            <option value="modified">{language === 'en' ? 'Modified' : 'Bearbeitung'}</option>
            <option value="created">{language === 'en' ? 'Created' : 'Erstellung'}</option>
            <option value="alpha">{language === 'en' ? 'Alphabetical' : 'A-Z (Name)'}</option>
          </select>

          <button
            type="button"
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="px-1.5 py-0.5 rounded bg-surface-base border border-line hover:bg-surface-control text-indigo-400 hover:text-indigo-300 transition cursor-pointer font-bold text-[10px]"
            title={sortOrder === 'desc' 
              ? (language === 'en' ? 'Descending (Newest / Z-A)' : 'Absteigend (Neueste / Z-A)')
              : (language === 'en' ? 'Ascending (Oldest / A-Z)' : 'Aufsteigend (Älteste / A-Z)')}
          >
            {sortOrder === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>

      {/* Main entity list */}
      <div className="flex-1 min-h-0 overflow-auto p-2 flex flex-col gap-1.5">
        {sortedEntities.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink-faint font-mono italic">
            {language === 'en' ? 'No chronicles found.' : 'Keine Chroniken gefunden.'}
          </div>
        ) : (
          sortedEntities.map(entity => {
            const isActive = entity.id === activeEntityId;
            const style = getTypeColor(entity.type);

            return (
              <div
                key={entity.id}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/tessarios-entity-id', entity.id);
                  e.dataTransfer.setData('text/plain', entity.id);
                }}
                onClick={() => onSelectEntity(entity.id)}
                className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition select-none ${
                  isActive
                    ? 'bg-surface-hover/40 border-l-2 border-indigo-500 text-ink-heading rounded-r-md'
                    : 'hover:bg-surface-hover/20 bg-transparent border-l border-transparent text-ink-secondary'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className={`p-1 rounded border flex-shrink-0 ${style}`}>
                    {getTypeIcon(entity.type, "h-3.5 w-3.5")}
                  </span>
                  <div className="flex flex-col overflow-hidden">
                    <span className={`text-xs font-medium font-mono truncate ${isActive ? 'text-ink-heading' : 'text-ink-secondary group-hover:text-ink-bright'}`}>
                      {entity.title}
                    </span>
                    {entity.tags.length > 0 && (
                      <span className="text-[9px] text-ink-muted truncate font-mono mt-0.5">
                        #{entity.tags.join(' #')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEntity(entity.id);
                    }}
                    className="p-1 rounded hover:bg-surface-hover text-rose-400 hover:text-rose-300 cursor-pointer"
                    title={language === 'en' ? "Delete entry" : "Eintrag löschen"}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Vault Operations Panel */}
      <div className="p-3 bg-surface-card border-t border-line/80 flex flex-col gap-2.5 shrink-0 mt-auto">
        {isAdding ? (
          <form onSubmit={handleCreate} className="flex flex-col gap-2">
            <input
              type="text"
              placeholder={language === 'en' ? 'Chronicle title...' : 'Chroniktitel...'}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-surface-base border border-line rounded px-2.5 py-1.5 text-xs text-ink-heading outline-none focus:border-indigo-500 font-mono"
              autoFocus
            />
            <select
              value={newType}
              onChange={(e) => {
                const t = e.target.value as EntityType;
                setNewType(t);
                const templatesForType = getAvailableTemplates(language).filter(tpl => tpl.type === t);
                setNewTemplateId(templatesForType[0]?.id || '');
              }}
              className="w-full bg-surface-base border border-line rounded px-2 py-1.5 text-xs text-ink font-mono outline-none focus:border-indigo-500 cursor-pointer"
            >
              {CATEGORIZED_ENTITY_TYPES.map((group) => (
                <optgroup
                  key={group.category.de}
                  label={language === 'en' ? group.category.en : group.category.de}
                  className="bg-surface-card text-indigo-400 font-bold"
                >
                  {group.types.map((type) => (
                    <option key={type} value={type} className="bg-surface-card text-ink-bright font-normal">
                      {getTypeTranslation(type as any)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Optional Specific Template Picker for selected type */}
            {(() => {
              const templatesForType = getAvailableTemplates(language).filter(tpl => tpl.type === newType);
              if (templatesForType.length <= 1) return null;
              return (
                <select
                  value={newTemplateId || templatesForType[0]?.id || ''}
                  onChange={(e) => setNewTemplateId(e.target.value)}
                  className="w-full bg-surface-base border border-indigo-900/60 rounded px-2 py-1.5 text-xs text-indigo-300 font-mono outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {templatesForType.map((tpl) => (
                    <option key={tpl.id} value={tpl.id} className="bg-surface-card text-ink-bright">
                      📋 {tpl.name}
                    </option>
                  ))}
                </select>
              );
            })()}

            <div className="flex gap-1.5">
              <button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-mono py-1.5 transition cursor-pointer font-semibold shadow-[0_0_10px_rgba(0,96,229,0.3)]"
              >
                {language === 'en' ? 'Forge' : 'Schmieden'}
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 bg-surface-control text-ink-secondary hover:text-ink-heading rounded text-xs font-mono py-1.5 border border-line cursor-pointer transition"
              >
                {language === 'en' ? 'Cancel' : 'Abbrechen'}
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono transition flex items-center justify-center gap-1.5 cursor-pointer font-semibold shadow-[0_0_12px_rgba(0,96,229,0.25)]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{language === 'en' ? 'Forge New Entry' : 'Neuen Eintrag schmieden'}</span>
          </button>
        )}
      </div>

      {sidebarAlert && (
        <BaseModal
          isOpen={!!sidebarAlert}
          onClose={() => setSidebarAlert(null)}
          icon={<Bot className="h-4 w-4" />}
          title={sidebarAlert.title}
          maxWidth="sm"
          footer={
            <button
              onClick={() => setSidebarAlert(null)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-mono transition cursor-pointer font-semibold shadow-[0_0_10px_rgba(0,96,229,0.3)]"
            >
              {language === 'en' ? 'Got it' : 'Verstanden'}
            </button>
          }
        >
          <p className="text-[11px] font-mono text-ink-secondary leading-normal">{sidebarAlert.message}</p>
        </BaseModal>
      )}
    </div>
  );
}
