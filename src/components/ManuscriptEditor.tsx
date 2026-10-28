/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LoreEntity, EntityType, LooseMediaAsset, Template } from '../types';
import { Language, getTypeTranslation as i18nGetTypeTranslation } from '../utils/i18n';
import EntityTypeBadge, { getTypeIcon, getTypeColor } from './EntityTypeBadge';
import MarkdownTextEditor, { MarkdownTextEditorHandle, EditorSelection } from './MarkdownTextEditor';
import { WikiTextRenderer } from './WikiTextRenderer';
import { EntityDetailView } from './EntityDetailView';
import { RevisionHistoryModal } from './RevisionHistoryModal';
import CollapseToggle from './ui/CollapseToggle';
import ManuscriptChatPanel from './ai/ManuscriptChatPanel';
import { useManuscriptChat } from '../hooks/useManuscriptChat';
import { findSceneContradictions } from '../ai/engine/aiContradictionDetector';
import {
  getManuscriptHierarchy,
  reorderScenesAndRename,
  reorderChaptersAndRename,
  extractManuscriptText,
  updateManuscriptText,
  countWords,
  formatSceneTitle,
  formatChapterTitle,
  normalizeStatus,
  statusValueFor,
  StatusType
} from '../utils/manuscript';
import { slugify } from '../utils/markdown';
import {
  Book,
  BookOpen,
  PenTool,
  FileText,
  ChevronRight,
  ChevronDown,
  Plus,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Minimize2,
  Download,
  Trash2,
  Eye,
  Search,
  User,
  MapPin,
  Sparkles,
  Tag,
  Link2,
  AlertTriangle,
  X,
  CheckCircle,
  ExternalLink,
  Target,
  BarChart2,
  Edit3,
  Bold,
  Italic,
  Heading,
  Quote,
  List,
  ListOrdered,
  Minus,
  Clock,
  Circle,
  History
} from 'lucide-react';

interface ManuscriptEditorProps {
  entities: Record<string, LoreEntity>;
  /** Needed to read a dossier's select-field options for the editor's consistency check. */
  templates: Template[];
  activeEntityId?: string;
  onUpdateEntity: (entity: LoreEntity) => void;
  onUpdateEntitiesBatch?: (updatedMap: Record<string, LoreEntity>) => void;
  onSelectEntity: (id: string) => void;
  onAddEntity?: (type: EntityType, title: string, backlinkId?: string, templateId?: string) => void;
  onDeleteEntity?: (id: string) => void;
  looseMedia?: Record<string, LooseMediaAsset>;
  onAddLooseMedia?: (asset: LooseMediaAsset) => void;
  onRenameEntity?: (oldId: string, newTitle: string) => void;
  language: Language;
  onClose?: () => void;
}

export default function ManuscriptEditor({
  entities,
  templates,
  activeEntityId,
  onUpdateEntity,
  onUpdateEntitiesBatch,
  onSelectEntity,
  onAddEntity,
  onDeleteEntity,
  looseMedia = {},
  onAddLooseMedia,
  onRenameEntity,
  language,
  onClose
}: ManuscriptEditorProps) {
  // Extract manuscript hierarchy
  const hierarchy = getManuscriptHierarchy(entities);
  const activeBook = hierarchy[0]; // Primary book or fallback

  // Selection states
  const [selectedBookId, setSelectedBookId] = useState<string>(activeBook?.id || '');
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  // View Scope Mode: 'book' | 'chapter' | 'scene'
  const [viewScope, setViewScope] = useState<'book' | 'chapter' | 'scene'>('book');

  // Focus mode
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Scene Text Editor preview/write mode
  const [editorTabMode, setEditorTabMode] = useState<'write' | 'preview'>('write');

  // Delete confirmation modal state
  const [entityToDelete, setEntityToDelete] = useState<{ id: string; title: string; type: string } | null>(null);

  // Version History & Snapshots modal state
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [historyEntity, setHistoryEntity] = useState<LoreEntity | null>(null);

  // Dossier Preview selection state
  const [previewEntityId, setPreviewEntityId] = useState<string | null>(null);

  // Right Sidebar: collapsibility, and which of its two jobs it is doing. Both share
  // the column so the author never has both competing for the same width — while
  // writing you are either consulting a dossier or talking to the companion.
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(true);
  const [rightSidebarTab, setRightSidebarTab] = useState<'dossier' | 'ai'>('dossier');

  // What the author has marked in the scene editor. Held here rather than read out of
  // the textarea on demand, so the AI panel can enable "Replace selection" the moment
  // something is marked instead of only finding out when the button is pressed.
  const editorHandleRef = useRef<MarkdownTextEditorHandle>(null);
  const [editorSelection, setEditorSelection] = useState<EditorSelection>({ start: 0, end: 0, text: '' });

  // Searchable dossier selector states
  const [isDossierSearchOpen, setIsDossierSearchOpen] = useState<boolean>(false);
  const [dossierSearchQuery, setDossierSearchQuery] = useState<string>('');
  const dossierSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dossierSearchRef.current && !dossierSearchRef.current.contains(event.target as Node)) {
        setIsDossierSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Expanded chapter folders in tree
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    activeBook?.chapters?.forEach(ch => {
      init[ch.id] = true;
    });
    return init;
  });

  // Track active entity from outside selection if applicable
  useEffect(() => {
    if (!activeEntityId) return;
    const entity = entities[activeEntityId];
    if (!entity) return;

    if (entity.type === 'book') {
      setSelectedBookId(entity.id);
      setSelectedChapterId(null);
      setSelectedSceneId(null);
      setViewScope('book');
    } else if (entity.type === 'chapter') {
      setSelectedChapterId(entity.id);
      setSelectedSceneId(null);
      setViewScope('chapter');
    } else if (entity.type === 'scene') {
      setSelectedSceneId(entity.id);
      // Find parent chapter
      for (const bk of hierarchy) {
        for (const ch of bk.chapters) {
          if (ch.scenes.some(s => s.id === entity.id)) {
            setSelectedChapterId(ch.id);
            setExpandedChapters(prev => ({ ...prev, [ch.id]: true }));
            break;
          }
        }
      }
      setViewScope('scene');
    }
  }, [activeEntityId]);

  // Selected Items
  const activeBookItem = hierarchy.find(b => b.id === selectedBookId) || activeBook;
  const activeBookEntity = activeBookItem ? entities[activeBookItem.id] : null;

  const activeChapterItem = activeBookItem?.chapters?.find(c => c.id === selectedChapterId);
  const activeChapterEntity = activeChapterItem ? entities[activeChapterItem.id] : null;

  const activeSceneItem = activeChapterItem?.scenes?.find(s => s.id === selectedSceneId)
    || activeBookItem?.chapters?.flatMap(c => c.scenes).find(s => s.id === selectedSceneId);
  const activeSceneEntity = activeSceneItem ? entities[activeSceneItem.id] : null;

  // The companion works on whichever scene is open for writing — never on a chapter or
  // book view, where there is no single text to write into.
  const isSceneOpen = viewScope === 'scene' && Boolean(activeSceneEntity);
  const manuscriptChat = useManuscriptChat({
    activeScene: isSceneOpen ? activeSceneEntity : null,
    entities,
    language,
    selectedText: editorSelection.text,
  });

  // Deterministic consistency check for the editor role — text search over already-loaded
  // entities, no model call, so it can simply run whenever the scene text changes rather
  // than waiting to be asked.
  const sceneContradictions = useMemo(
    () => (isSceneOpen && activeSceneEntity ? findSceneContradictions(activeSceneEntity, entities, templates) : []),
    [isSceneOpen, activeSceneEntity?.id, activeSceneEntity?.content, entities, templates]
  );

  // A selection belongs to the text it was made in. Leaving the scene drops it, so
  // "Replace selection" can never point at offsets in a document no longer on screen.
  useEffect(() => {
    setEditorSelection({ start: 0, end: 0, text: '' });
  }, [activeSceneEntity?.id, viewScope]);

  // Sync right-column Dossier Preview to currently selected item on left navigation
  useEffect(() => {
    if (viewScope === 'scene' && activeSceneEntity) {
      setPreviewEntityId(activeSceneEntity.id);
    } else if (viewScope === 'chapter' && activeChapterEntity) {
      setPreviewEntityId(activeChapterEntity.id);
    } else if (viewScope === 'book' && activeBookEntity) {
      setPreviewEntityId(activeBookEntity.id);
    }
  }, [viewScope, selectedSceneId, selectedChapterId, selectedBookId, activeSceneEntity?.id, activeChapterEntity?.id, activeBookEntity?.id]);

  // All entities for Dossier Preview selector
  const allEntitiesList = useMemo(() => {
    return Object.values(entities).sort((a, b) => a.title.localeCompare(b.title));
  }, [entities]);

  // Filtered entities for Dossier Search Dropdown
  const filteredEntitiesList = useMemo(() => {
    if (!dossierSearchQuery.trim()) return allEntitiesList;
    const q = dossierSearchQuery.toLowerCase();
    return allEntitiesList.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        i18nGetTypeTranslation(e.type, language).toLowerCase().includes(q) ||
        (e.tags && e.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [allEntitiesList, dossierSearchQuery, language]);

  // Smart WikiLink handler:
  // - If target is Chapter or Scene or Book -> navigate inside Manuscript Editor
  // - Otherwise (Character, Location, Item, etc.) -> open in right-hand Dossier Preview!
  const handleWikiLinkClick = (idOrSlug: string) => {
    const targetEntity = entities[idOrSlug] || Object.values(entities).find(
      e => e.id === idOrSlug || slugify(e.title) === slugify(idOrSlug) || e.title.toLowerCase() === idOrSlug.toLowerCase()
    );

    if (!targetEntity) {
      onSelectEntity(idOrSlug);
      return;
    }

    if (targetEntity.type === 'chapter') {
      setSelectedChapterId(targetEntity.id);
      setSelectedSceneId(null);
      setViewScope('chapter');
    } else if (targetEntity.type === 'scene') {
      setSelectedSceneId(targetEntity.id);
      for (const bk of hierarchy) {
        for (const ch of bk.chapters) {
          if (ch.scenes.some(s => s.id === targetEntity.id)) {
            setSelectedChapterId(ch.id);
            setExpandedChapters(prev => ({ ...prev, [ch.id]: true }));
            break;
          }
        }
      }
      setViewScope('scene');
    } else if (targetEntity.type === 'book') {
      setSelectedBookId(targetEntity.id);
      setSelectedChapterId(null);
      setSelectedSceneId(null);
      setViewScope('book');
    } else {
      // Character, Location, Item, Faction, World, etc. -> Show in Dossier Preview!
      setPreviewEntityId(targetEntity.id);
      setIsRightSidebarOpen(true);
    }
  };

  const previewEntity = previewEntityId ? entities[previewEntityId] : null;

  // Batch update dispatcher
  const updateEntitiesBatch = (updatedMap: Record<string, LoreEntity>) => {
    if (onUpdateEntitiesBatch) {
      onUpdateEntitiesBatch(updatedMap);
    } else {
      Object.values(updatedMap).forEach(ent => onUpdateEntity(ent));
    }
  };

  // Reordering handlers
  const handleMoveChapter = (chapterId: string, direction: 'up' | 'down') => {
    if (!activeBookItem) return;
    const chList = activeBookItem.chapters;
    const currIdx = chList.findIndex(c => c.id === chapterId);
    if (currIdx === -1) return;

    const targetIdx = direction === 'up' ? currIdx - 1 : currIdx + 1;
    if (targetIdx < 0 || targetIdx >= chList.length) return;

    const newChOrder = [...chList.map(c => c.id)];
    const [moved] = newChOrder.splice(currIdx, 1);
    newChOrder.splice(targetIdx, 0, moved);

    const updatedMap = reorderChaptersAndRename(entities, activeBookItem.id, newChOrder, language);
    updateEntitiesBatch(updatedMap);
  };

  const handleMoveScene = (chapterId: string, sceneId: string, direction: 'up' | 'down') => {
    const ch = activeBookItem?.chapters?.find(c => c.id === chapterId);
    if (!ch) return;

    const scList = ch.scenes;
    const currIdx = scList.findIndex(s => s.id === sceneId);
    if (currIdx === -1) return;

    const targetIdx = direction === 'up' ? currIdx - 1 : currIdx + 1;
    if (targetIdx < 0 || targetIdx >= scList.length) return;

    const newScOrder = [...scList.map(s => s.id)];
    const [moved] = newScOrder.splice(currIdx, 1);
    newScOrder.splice(targetIdx, 0, moved);

    const updatedMap = reorderScenesAndRename(entities, chapterId, newScOrder, language);
    updateEntitiesBatch(updatedMap);
  };

  // Quick addition of Chapter or Scene
  const handleCreateChapter = () => {
    if (!onAddEntity) return;
    const nextNum = (activeBookItem?.chapters?.length || 0) + 1;
    const title = formatChapterTitle(nextNum, undefined, language);
    onAddEntity('chapter', title, activeBookItem?.id, 'chapter-template');
  };

  const handleCreateScene = (chapterId: string) => {
    if (!onAddEntity) return;
    const ch = activeBookItem?.chapters?.find(c => c.id === chapterId);
    if (!ch) return;

    const chIndex = ch.chapterIndex;
    const nextScNum = ch.scenes.length + 1;
    const title = formatSceneTitle(chIndex, nextScNum, undefined, language);
    onAddEntity('scene', title, chapterId, 'scene-template');
  };

  // Direct text editing per scene
  const handleUpdateSceneManuscriptText = (sceneId: string, newManuscriptText: string) => {
    const scEntity = entities[sceneId];
    if (!scEntity) return;

    const updatedContent = updateManuscriptText(scEntity.content, newManuscriptText);
    onUpdateEntity({
      ...scEntity,
      content: updatedContent,
      lastModified: Date.now()
    });
  };

  /**
   * Adds an accepted proposal to the end of the scene. The safe default: nothing that
   * is already written can be lost this way, whatever the AI returned.
   */
  const handleAppendAIText = (text: string) => {
    if (!activeSceneEntity) return;
    const current = extractManuscriptText(activeSceneEntity.content);
    const addition = text.trim();
    if (!addition) return;
    handleUpdateSceneManuscriptText(
      activeSceneEntity.id,
      current.trim() ? `${current.trimEnd()}\n\n${addition}` : addition
    );
  };

  /**
   * Writes an accepted proposal over exactly the offsets the author marked — by range,
   * never by searching for the old text, since the same words may occur more than once
   * in a scene. Goes through the editor's own history, so a single undo takes it back.
   */
  const handleReplaceSelectionWithAIText = (text: string) => {
    if (!activeSceneEntity || editorSelection.start === editorSelection.end) return;
    const replacement = text.trim();
    if (!replacement) return;
    editorHandleRef.current?.replaceRange(editorSelection.start, editorSelection.end, replacement);
    setEditorSelection({ start: 0, end: 0, text: '' });
  };

  // Update scene status custom field
  const handleUpdateSceneStatus = (sceneId: string, newStatus: string) => {
    const scEntity = entities[sceneId];
    if (!scEntity) return;

    onUpdateEntity({
      ...scEntity,
      customFields: {
        ...scEntity.customFields,
        // newStatus is the internal name the dropdown submits; the file gets the spelling
        // its own template (and the entry's existing value) uses.
        'Status': statusValueFor(normalizeStatus(newStatus), language, scEntity.customFields?.['Status'])
      },
      lastModified: Date.now()
    });
  };

  // Status Indicator Dot Component: Green if Fertig, Orange if in progress/draft
  const renderStatusDot = (statuses: StatusType | StatusType[]) => {
    const statusArray = Array.isArray(statuses) ? statuses : [statuses];
    const isAllReady = statusArray.length > 0 && statusArray.every(s => s === 'Fertig');
    const isDraft = statusArray.some(s => s === 'Entwurf' || s === 'In Bearbeitung' || s === 'In Überarbeitung');

    if (isAllReady) {
      return (
        <span
          className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] shrink-0"
          title={language === 'en' ? 'Done / Completed' : 'Fertig / Abgeschlossen'}
        />
      );
    }

    if (isDraft) {
      return (
        <span
          className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] shrink-0"
          title={language === 'en' ? 'In Progress / Draft' : 'In Bearbeitung / Entwurf'}
        />
      );
    }

    return (
      <span
        className="w-2.5 h-2.5 rounded-full bg-zinc-600 shrink-0"
        title={language === 'en' ? 'No Status' : 'Kein Status'}
      />
    );
  };

  // Generate full text for current scope for export
  const getCompiledManuscriptText = (): string => {
    if (!activeBookItem) return '';

    if (viewScope === 'scene' && activeSceneItem) {
      return extractManuscriptText(activeSceneItem.entity.content);
    }

    if (viewScope === 'chapter' && activeChapterItem) {
      const header = `# ${activeChapterItem.title}\n\n`;
      const sceneTexts = activeChapterItem.scenes.map((sc, idx) => {
        const text = extractManuscriptText(sc.entity.content);
        return text || (language === 'en' ? `*(Scene ${idx + 1} has no manuscript text yet)*` : `*(Szene ${idx + 1} hat noch keinen Manuskripttext)*`);
      });
      return header + sceneTexts.join('\n\n* * *\n\n');
    }

    // Whole Book
    let result = `# ${activeBookItem.title}\n\n`;
    activeBookItem.chapters.forEach((ch, chIdx) => {
      result += `## ${ch.title}\n\n`;
      const sceneTexts = ch.scenes.map(sc => extractManuscriptText(sc.entity.content)).filter(Boolean);
      if (sceneTexts.length > 0) {
        result += sceneTexts.join('\n\n') + '\n\n';
      } else {
        result += `*(${language === 'en' ? `Chapter ${chIdx + 1} has no scenes yet` : `Kapitel ${chIdx + 1} enthält noch keine Szenen`})*\n\n`;
      }
    });

    return result.trim();
  };

  // Export manuscript
  const handleExportManuscript = () => {
    const content = getCompiledManuscriptText();
    const filename = `${slugify(activeBookItem?.title || 'manuskript')}.md`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Scene Text Formatting helpers
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertFormatting = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current || !activeSceneEntity) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const currentText = extractManuscriptText(activeSceneEntity.content);
    const selectedText = currentText.substring(start, end);

    const replacement = `${prefix}${selectedText || 'Text'}${suffix}`;
    const newText = currentText.substring(0, start) + replacement + currentText.substring(end);
    handleUpdateSceneManuscriptText(activeSceneEntity.id, newText);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length + (selectedText.length || 4));
    }, 50);
  };

  // Word goal computation for Book
  const rawWordGoal = activeBookEntity?.customFields['Wortziel'] || activeBookEntity?.customFields['WordGoal'] || activeBookEntity?.customFields['Word Goal'] || '50000';
  const numericWordGoal = parseInt(rawWordGoal.toString().replace(/\D/g, ''), 10) || 50000;
  const currentTotalWords = activeBookItem?.totalWordCount || 0;
  const progressPercent = Math.min(100, Math.round((currentTotalWords / numericWordGoal) * 100));
  const totalScenesCount = activeBookItem?.chapters?.reduce((acc, c) => acc + c.scenes.length, 0) || 0;

  // No real Book entity exists yet — activeBookItem may be the synthetic "Hauptbuch"
  // fallback (id 'default-book') that getManuscriptHierarchy() invents to group any
  // orphaned chapters/scenes; it's a display aid, not an actual saved entity, so
  // creating chapters against it would link them to an id that doesn't exist. Require
  // a real book first instead of silently operating on the phantom one.
  if (!activeBookItem || !activeBookEntity) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-surface-base text-ink-bright border border-line gap-4 p-6 select-none">
        <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-md ${getTypeColor('book')}`}>
          {getTypeIcon('book', 'h-7 w-7')}
        </div>
        <div className="text-center">
          <h2 className="text-sm font-bold font-mono text-ink-bright">
            {language === 'en' ? 'No book yet' : 'Noch kein Buch vorhanden'}
          </h2>
          <p className="text-xs font-mono text-ink-muted mt-1 max-w-xs">
            {language === 'en'
              ? 'Create your first book before adding chapters and scenes.'
              : 'Lege zuerst ein Buch an, bevor du Kapitel und Szenen hinzufügen kannst.'}
          </p>
        </div>
        {onAddEntity && (
          <button
            type="button"
            onClick={() => onAddEntity('book', language === 'en' ? 'New Book' : 'Neues Buch', undefined, 'book-template')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-2 shadow-[0_0_12px_rgba(0,96,229,0.3)]"
          >
            <Plus className="h-4 w-4" />
            <span>{language === 'en' ? 'Create New Book' : 'Neues Buch erstellen'}</span>
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] font-mono text-ink-muted hover:text-ink transition cursor-pointer"
          >
            {language === 'en' ? '← Back to Chronicles' : '← Zurück zu den Chroniken'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface-base text-ink-bright font-sans border border-line overflow-hidden select-none">
      {/* Top Standard Header */}
      <header className="shrink-0 bg-surface-card border-b border-line px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg border border-rose-900/50 bg-rose-950/30 flex items-center justify-center shrink-0 shadow-md">
            <PenTool className="h-4 w-4 text-rose-400" />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold font-mono tracking-wider text-ink-bright uppercase">
              Manuskript
            </h2>
            <span className="text-xs bg-surface-hover/90 border border-line-strong text-indigo-300 font-mono px-2.5 py-0.5 rounded-full font-bold">
              {activeBookItem?.title || (language === 'en' ? 'Book' : 'Buch')}
            </span>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Standard Export Button */}
          <button
            type="button"
            onClick={handleExportManuscript}
            className="px-3 py-1.5 bg-surface-control hover:bg-surface-hover text-ink border border-line-strong hover:border-line-highlight rounded-lg text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5 shadow-sm"
            title={language === 'en' ? 'Export compiled manuscript (.md)' : 'Kompiliertes Manuskript exportieren (.md)'}
          >
            <Download className="h-3.5 w-3.5 text-indigo-400" />
            <span>{language === 'en' ? 'Export (.md)' : 'Manuskript Exportieren (.md)'}</span>
          </button>

          {/* Focus Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`p-1.5 border rounded-lg transition cursor-pointer flex items-center justify-center ${
              isFocusMode
                ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_12px_rgba(0,96,229,0.4)]'
                : 'bg-surface-control text-ink-secondary hover:text-ink-bright border-line hover:border-line-strong'
            }`}
            title={language === 'en' ? 'Toggle Focus Mode' : 'Fokus-Modus umschalten'}
          >
            {isFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Main 3-Column Workspace Body */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Directory Navigation Column (Hidden in Focus Mode) */}
        {!isFocusMode && (
          <aside className="w-full md:w-88 lg:w-[420px] xl:w-[460px] shrink-0 bg-surface-base border-r border-line flex flex-col min-h-0 overflow-hidden">
            {/* Book Root Clickable Card & Stats */}
            <div className="p-3 bg-surface-card border-b border-line flex flex-col gap-2">
              <div
                onClick={() => {
                  if (activeBookItem) {
                    setSelectedBookId(activeBookItem.id);
                    setSelectedChapterId(null);
                    setSelectedSceneId(null);
                    setViewScope('book');
                    onSelectEntity(activeBookItem.id);
                  }
                }}
                className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                  viewScope === 'book'
                    ? 'bg-indigo-950/70 border-indigo-700 text-indigo-100 font-bold shadow-md'
                    : 'bg-surface-control/60 border-line hover:bg-surface-hover/80 text-ink-bright'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {getTypeIcon('book', "h-4 w-4 shrink-0")}
                  <span className="font-bold text-xs truncate">{activeBookItem?.title || (language === 'en' ? 'Book' : 'Buch')}</span>
                </div>
                {activeBookItem && renderStatusDot(
                  activeBookItem.chapters.flatMap(c => c.scenes.map(s => s.status))
                )}
              </div>

              {/* Linked Statistics & Word Goal Progress Bar */}
              <div className="flex flex-col gap-1.5 p-2.5 bg-surface-base border border-line/90 rounded-xl text-xs font-mono">
                <div className="flex items-center justify-between text-ink-secondary text-[10px]">
                  <span className="flex items-center gap-1 font-semibold text-ink">
                    <BarChart2 className="h-3 w-3 text-indigo-400" />
                    <span>{language === 'en' ? 'Word goal:' : 'Wortziel:'}</span>
                  </span>
                  <span className="text-indigo-300 font-bold">
                    {currentTotalWords.toLocaleString()} / {numericWordGoal.toLocaleString()} w ({progressPercent}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-ink-secondary pt-1 border-t border-line/50 mt-0.5">
                  <span>{activeBookItem?.chapters?.length || 0} {language === 'en' ? 'chapters' : 'Kapitel'}</span>
                  <span>{totalScenesCount} {language === 'en' ? 'scenes' : 'Szenen'}</span>
                </div>
              </div>

              {/* Add Chapter Button */}
              <button
                type="button"
                onClick={handleCreateChapter}
                className="py-1.5 px-2 bg-indigo-950/50 hover:bg-indigo-900/70 border border-indigo-800/80 text-indigo-200 rounded-xl text-xs font-mono transition cursor-pointer flex items-center justify-center gap-1.5 font-bold"
              >
                <Plus className="h-3.5 w-3.5 text-indigo-400" />
                <span>{language === 'en' ? '+ New Chapter' : '+ Neues Kapitel'}</span>
              </button>
            </div>

            {/* Tree Navigation List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1">
              {activeBookItem?.chapters?.map((ch, chIdx) => {
                const isChExpanded = expandedChapters[ch.id] ?? true;
                const isChSelected = selectedChapterId === ch.id && viewScope === 'chapter';
                const chSceneStatuses = ch.scenes.map(s => s.status);

                return (
                  <div key={ch.id} className="flex flex-col gap-0.5 rounded-xl border border-line/80 bg-surface-card/60 p-1">
                    {/* Chapter Item Row */}
                    <div
                      onClick={() => {
                        setSelectedChapterId(ch.id);
                        setSelectedSceneId(null);
                        setViewScope('chapter');
                        onSelectEntity(ch.id);
                      }}
                      className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition text-xs font-mono group ${
                        isChSelected
                          ? 'bg-indigo-950/80 text-indigo-100 font-bold border border-indigo-700/80 shadow-sm'
                          : 'hover:bg-surface-hover/60 text-ink'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <CollapseToggle
                          collapsed={!isChExpanded}
                          onToggle={(e) => {
                            e.stopPropagation();
                            setExpandedChapters(prev => ({ ...prev, [ch.id]: !isChExpanded }));
                          }}
                          direction="disclosure"
                          variant="ghost"
                          titleExpand=""
                          titleCollapse=""
                          className="shrink-0"
                        />
                        {getTypeIcon('chapter', "h-3.5 w-3.5 shrink-0")}
                        <span className="truncate font-semibold text-[11px]">{ch.title}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9px] text-ink-muted font-mono">{ch.totalWordCount}w</span>
                        {renderStatusDot(chSceneStatuses)}

                        {/* Controls (Move & Delete) */}
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveChapter(ch.id, 'up');
                            }}
                            disabled={chIdx === 0}
                            className="p-0.5 hover:bg-surface-active text-ink rounded disabled:opacity-30 cursor-pointer"
                            title={language === 'en' ? 'Move chapter up' : 'Kapitel nach oben'}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveChapter(ch.id, 'down');
                            }}
                            disabled={chIdx === activeBookItem.chapters.length - 1}
                            className="p-0.5 hover:bg-surface-active text-ink rounded disabled:opacity-30 cursor-pointer"
                            title={language === 'en' ? 'Move chapter down' : 'Kapitel nach unten'}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEntityToDelete({ id: ch.id, title: ch.title, type: 'chapter' });
                            }}
                            className="p-0.5 hover:bg-rose-950/80 text-rose-400 rounded cursor-pointer transition ml-0.5"
                            title={language === 'en' ? 'Delete chapter' : 'Kapitel löschen'}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sub-Scenes List */}
                    {isChExpanded && (
                      <div className="pl-3 pr-1 py-1 flex flex-col gap-1 border-l border-line ml-2 mt-0.5">
                        {ch.scenes.map((sc, scIdx) => {
                          const isScSelected = selectedSceneId === sc.id && viewScope === 'scene';

                          return (
                            <div
                              key={sc.id}
                              onClick={() => {
                                setSelectedChapterId(ch.id);
                                setSelectedSceneId(sc.id);
                                setViewScope('scene');
                                onSelectEntity(sc.id);
                              }}
                              className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition text-[11px] font-mono group ${
                                isScSelected
                                  ? 'bg-indigo-600 text-white font-bold shadow-md'
                                  : 'hover:bg-surface-hover/50 text-ink'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                {getTypeIcon('scene', `h-3 w-3 shrink-0 ${isScSelected ? 'text-ink-heading' : ''}`)}
                                <span className="truncate">{sc.title}</span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`text-[9px] font-mono ${isScSelected ? 'text-indigo-200' : 'text-ink-muted'}`}>
                                  {sc.wordCount}w
                                </span>

                                {renderStatusDot(sc.status)}

                                {/* Move Scene Up/Down & Delete */}
                                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveScene(ch.id, sc.id, 'up');
                                    }}
                                    disabled={scIdx === 0}
                                    className="p-0.5 hover:bg-surface-active text-ink rounded disabled:opacity-30 cursor-pointer"
                                    title={language === 'en' ? 'Move scene up' : 'Szene nach oben'}
                                  >
                                    <ArrowUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveScene(ch.id, sc.id, 'down');
                                    }}
                                    disabled={scIdx === ch.scenes.length - 1}
                                    className="p-0.5 hover:bg-surface-active text-ink rounded disabled:opacity-30 cursor-pointer"
                                    title={language === 'en' ? 'Move scene down' : 'Szene nach unten'}
                                  >
                                    <ArrowDown className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEntityToDelete({ id: sc.id, title: sc.title, type: 'scene' });
                                    }}
                                    className="p-0.5 hover:bg-rose-950/80 text-rose-400 rounded cursor-pointer transition ml-0.5"
                                    title={language === 'en' ? 'Delete scene' : 'Szene löschen'}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Add Scene Button */}
                        <button
                          type="button"
                          onClick={() => handleCreateScene(ch.id)}
                          className="mt-0.5 py-1 px-2 hover:bg-indigo-950/40 text-indigo-300 hover:text-indigo-200 text-[10px] font-mono rounded-lg flex items-center gap-1 transition cursor-pointer"
                        >
                          <Plus className="h-3 w-3 text-indigo-400" />
                          <span>{language === 'en' ? '+ New Scene' : '+ Neue Szene'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* Middle Writing / Reading Canvas */}
        <main className="flex-1 min-w-0 h-full bg-surface-card flex flex-col overflow-hidden">
          {viewScope === 'scene' && activeSceneEntity ? (
            /* Scene Writing Mode: Dedicated Rich Text Editor Environment */
            <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden bg-surface-card">
              {/* Scene Top Header Bar */}
              <div className="p-4 bg-surface-base border-b border-line flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  {getTypeIcon('scene', "h-5 w-5 shrink-0")}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-ink-secondary">
                      <span>{activeChapterItem?.title || (language === 'en' ? 'Chapter' : 'Kapitel')}</span>
                      <span>•</span>
                      <span className="text-indigo-300 font-bold">
                        {countWords(extractManuscriptText(activeSceneEntity.content))} Wörter
                      </span>
                    </div>
                    <input
                      type="text"
                      value={activeSceneEntity.title}
                      onChange={(e) => {
                        const newTitle = e.target.value;
                        if (onRenameEntity) {
                          onRenameEntity(activeSceneEntity.id, newTitle);
                        } else {
                          onUpdateEntity({ ...activeSceneEntity, title: newTitle, lastModified: Date.now() });
                        }
                      }}
                      className="bg-transparent text-lg font-bold text-ink-heading outline-none hover:bg-surface-hover/40 focus:bg-surface-hover/60 rounded px-1.5 py-0.5 transition w-full"
                    />
                  </div>
                </div>

                {/* Status Selector & Write/Preview mode toggles */}
                <div className="flex items-center gap-3 shrink-0">
                  {/* Scene Snapshots / Version History Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryEntity(activeSceneEntity);
                      setIsHistoryModalOpen(true);
                    }}
                    className="w-[30px] h-[30px] flex items-center justify-center bg-surface-elevated hover:bg-indigo-950/60 text-ink hover:text-ink-heading border border-line hover:border-indigo-700/80 rounded-md text-[11px] font-mono transition cursor-pointer shadow-sm shrink-0"
                    title={language === 'en' ? 'Scene Snapshots & Version History' : 'Szenen-Schnappschüsse & Versionsverlauf'}
                  >
                    <History className="h-3.5 w-3.5 text-indigo-400" />
                  </button>

                  {/* Status Dropdown */}
                  <div className="flex items-center gap-1.5 bg-surface-card border border-line px-2.5 py-1 rounded-xl text-xs font-mono">
                    <span className="text-ink-muted text-[10px]">Status:</span>
                    <select
                      value={normalizeStatus(activeSceneEntity.customFields['Status'])}
                      onChange={(e) => handleUpdateSceneStatus(activeSceneEntity.id, e.target.value)}
                      className="bg-transparent text-ink-bright outline-none cursor-pointer font-bold"
                    >
                      <option value="Entwurf" className="bg-surface-base text-amber-300">{language === 'en' ? 'Draft' : 'Entwurf'}</option>
                      <option value="In Bearbeitung" className="bg-surface-base text-amber-300">{language === 'en' ? 'In Progress' : 'In Bearbeitung'}</option>
                      <option value="In Überarbeitung" className="bg-surface-base text-indigo-300">{language === 'en' ? 'In Revision' : 'In Überarbeitung'}</option>
                      <option value="Fertig" className="bg-surface-base text-emerald-400">{language === 'en' ? 'Done' : 'Fertig'}</option>
                    </select>
                    {renderStatusDot(normalizeStatus(activeSceneEntity.customFields['Status']))}
                  </div>
                </div>
              </div>

              {/* Centered A4 Bounded Page Canvas with Scroll */}
              <div id="manuscript-editor-canvas" className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 flex justify-center bg-surface-base">
                {/* No overflow-hidden: it would become the scrollport for the editor's
                    sticky toolbar and pin it inside this (taller-than-viewport) sheet. */}
                <div id="manuscript-paper-sheet" className="w-full max-w-[800px] bg-surface-card border border-line/80 rounded-2xl shadow-2xl flex flex-col my-2 min-h-[850px]">
                  {/* Shared Reusable Markdown Text Editor */}
                  <MarkdownTextEditor
                    ref={editorHandleRef}
                    onSelectionChange={setEditorSelection}
                    value={extractManuscriptText(activeSceneEntity.content)}
                    onChange={(newText) => handleUpdateSceneManuscriptText(activeSceneEntity.id, newText)}
                    language={language}
                    entities={entities}
                    currentEntityId={activeSceneEntity.id}
                    onAddEntity={onAddEntity}
                    onSelectEntity={handleWikiLinkClick}
                    looseMedia={looseMedia}
                    onAddLooseMedia={onAddLooseMedia}
                    viewMode={editorTabMode}
                    onViewModeChange={(m) => setEditorTabMode(m)}
                    placeholder={language === 'en' ? 'Write scene manuscript text here...' : 'Schreibe hier deinen Szenentext...'}
                    className="flex-1 min-h-0 border-none rounded-none"
                  />
                </div>
              </div>
            </div>
          ) : viewScope === 'chapter' && activeChapterItem ? (
            /* Chapter View: Individual scenes with "Szene bearbeiten" buttons (no fancy separators) */
            <div className="p-6 md:p-10 max-w-4xl mx-auto w-full flex flex-col gap-6 overflow-y-auto">
              <div className="border-b border-line pb-4 flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-ink-heading tracking-tight">
                    {activeChapterItem.title}
                  </h1>
                  <p className="text-xs font-mono text-ink-secondary mt-1">
                    {activeChapterItem.scenes.length} {language === 'en' ? 'scenes' : 'Szenen'} • {activeChapterItem.totalWordCount} {language === 'en' ? 'words' : 'Wörter'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCreateScene(activeChapterItem.id)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-mono transition cursor-pointer font-bold flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{language === 'en' ? 'New Scene' : 'Neue Szene'}</span>
                </button>
              </div>

              {activeChapterItem.scenes.length === 0 ? (
                <div className="p-10 text-center border border-dashed border-line rounded-2xl bg-surface-base/50 font-mono text-xs text-ink-muted flex flex-col items-center gap-3">
                  <p>{language === 'en' ? 'This chapter has no scenes yet.' : 'Dieses Kapitel enthält noch keine Szenen.'}</p>
                  <button
                    type="button"
                    onClick={() => handleCreateScene(activeChapterItem.id)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition font-bold"
                  >
                    {language === 'en' ? '+ Create First Scene' : '+ Erste Szene erstellen'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {activeChapterItem.scenes.map((sc) => (
                    <div key={sc.id} className="bg-surface-base border border-line rounded-2xl p-5 shadow-sm flex flex-col gap-3">
                      <div className="flex items-center justify-between text-xs font-mono text-ink border-b border-line pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-indigo-300">{sc.title}</span>
                          <span className="text-[10px] text-ink-muted">({sc.wordCount} w)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedChapterId(activeChapterItem.id);
                            setSelectedSceneId(sc.id);
                            setViewScope('scene');
                            onSelectEntity(sc.id);
                          }}
                          className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-800 rounded-lg text-[10px] font-mono transition cursor-pointer flex items-center gap-1 font-bold"
                        >
                          <Edit3 className="h-3 w-3" />
                          <span>{language === 'en' ? 'Edit Scene' : 'Szene bearbeiten'}</span>
                        </button>
                      </div>

                      <div className="w-full text-ink-bright text-sm font-sans leading-relaxed py-1">
                        {extractManuscriptText(sc.entity.content) ? (
                          <WikiTextRenderer
                            content={extractManuscriptText(sc.entity.content)}
                            entities={entities}
                            looseMedia={looseMedia}
                            onSelectEntity={handleWikiLinkClick}
                            onAddEntity={onAddEntity}
                            onContentChange={(newText) => handleUpdateSceneManuscriptText(sc.id, newText)}
                          />
                        ) : (
                          <span className="text-ink-faint italic">{language === 'en' ? 'No scene text yet.' : 'Kein Szenentext vorhanden.'}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Whole Book View: Continuous Reading Canvas with ONLY Chapter Titles & Fließtext */
            <div className="p-6 md:p-10 max-w-4xl mx-auto w-full flex flex-col gap-10 overflow-y-auto">
              <div className="border-b border-line pb-4 flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-ink-heading tracking-tight">
                    {activeBookItem?.title}
                  </h1>
                  <p className="text-xs font-mono text-ink-secondary mt-1">
                    {activeBookItem?.chapters?.length || 0} {language === 'en' ? 'chapters' : 'Kapitel'} • {activeBookItem?.totalWordCount || 0} {language === 'en' ? 'total words' : 'Gesamtwörter'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCreateChapter}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-mono transition cursor-pointer font-bold flex items-center gap-1.5 shadow-md"
                >
                  <Plus className="h-4 w-4" />
                  <span>{language === 'en' ? 'New Chapter' : 'Neues Kapitel'}</span>
                </button>
              </div>

              {!activeBookItem || activeBookItem.chapters.length === 0 ? (
                <div className="p-10 text-center border border-dashed border-line rounded-2xl bg-surface-base/50 font-mono text-xs text-ink-muted flex flex-col items-center gap-3">
                  <p>{language === 'en' ? 'Your book has no chapters yet.' : 'Dein Buch hat noch keine Kapitel.'}</p>
                  <button
                    type="button"
                    onClick={handleCreateChapter}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition font-bold"
                  >
                    {language === 'en' ? '+ Create First Chapter' : '+ Erstes Kapitel erstellen'}
                  </button>
                </div>
              ) : (
                activeBookItem.chapters.map((ch, chIdx) => {
                  const scenesWithText = ch.scenes.map(sc => extractManuscriptText(sc.entity.content)).filter(Boolean);
                  return (
                    <section key={ch.id} className="flex flex-col gap-4 border-b border-line/80 pb-10 last:border-b-0">
                      <div className="flex items-center justify-between border-b border-line/80 pb-3">
                        <h2 className="text-2xl font-bold text-ink-heading tracking-tight">
                          Kapitel {chIdx + 1}: {ch.title}
                        </h2>
                        <span className="text-xs font-mono text-ink-muted">{ch.totalWordCount} w</span>
                      </div>

                      {scenesWithText.length === 0 ? (
                        <p className="text-xs font-mono text-ink-muted italic py-2">
                          *(Kein Szenentext in diesem Kapitel)*
                        </p>
                      ) : (
                        <div className="flex flex-col gap-6 py-2">
                          {scenesWithText.map((text, idx) => (
                            <div key={idx} className="text-ink-bright text-base font-sans leading-relaxed">
                              <WikiTextRenderer
                                content={text}
                                entities={entities}
                                looseMedia={looseMedia}
                                onSelectEntity={handleWikiLinkClick}
                                onAddEntity={onAddEntity}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>
          )}
        </main>

        {/* Floating Toggle Button when Right Sidebar is Collapsed */}
        {!isRightSidebarOpen && !isFocusMode && (
          <button
            type="button"
            onClick={() => setIsRightSidebarOpen(true)}
            className="absolute right-0 top-12 z-20 bg-surface-card hover:bg-indigo-950 border-l border-t border-b border-line-strong text-indigo-300 px-2 py-3 rounded-l-xl text-xs font-mono shadow-xl transition cursor-pointer flex items-center gap-1.5 [writing-mode:vertical-lr] font-bold"
            title={language === 'en' ? 'Expand side panel' : 'Seitenleiste ausklappen'}
          >
            {rightSidebarTab === 'ai' ? (
              <Sparkles className="h-3.5 w-3.5 text-indigo-400 [writing-mode:horizontal-tb]" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-indigo-400 [writing-mode:horizontal-tb]" />
            )}
            <span>
              {rightSidebarTab === 'ai'
                ? (language === 'en' ? 'AI' : 'KI')
                : (language === 'en' ? 'Dossier Preview' : 'Dossier-Vorschau')}
            </span>
          </button>
        )}

        {/* Right Column: Dossier Preview (Read-Only Lore & Character Companion) */}
        {!isFocusMode && isRightSidebarOpen && (
          <aside className="w-full md:w-[460px] lg:w-[580px] xl:w-[680px] shrink-0 bg-surface-base border-l border-line flex flex-col min-h-0 overflow-hidden">
            {/* Header & Selector */}
            <div className="p-3 bg-surface-card border-b border-line flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRightSidebarTab('dossier')}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer border ${
                      rightSidebarTab === 'dossier'
                        ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/80'
                        : 'bg-transparent text-ink-secondary border-transparent hover:text-ink-heading hover:bg-surface-hover'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {language === 'en' ? 'Dossier' : 'Dossier'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightSidebarTab('ai')}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-mono font-bold uppercase tracking-wider transition cursor-pointer border ${
                      rightSidebarTab === 'ai'
                        ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/80'
                        : 'bg-transparent text-ink-secondary border-transparent hover:text-ink-heading hover:bg-surface-hover'
                    }`}
                    title={language === 'en' ? 'Write and review with the AI' : 'Mit der KI schreiben und prüfen'}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {language === 'en' ? 'AI' : 'KI'}
                    <span className="text-[8px] font-bold uppercase px-1 py-px rounded border border-amber-900/50 bg-amber-950/30 text-amber-400">beta</span>
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {rightSidebarTab === 'dossier' && previewEntity && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryEntity(previewEntity);
                          setIsHistoryModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-400 hover:text-indigo-300 border border-indigo-900/60 transition cursor-pointer flex items-center justify-center"
                        title={language === 'en' ? 'Version History & Snapshots' : 'Schnappschüsse & Versionsverlauf'}
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectEntity(previewEntity.id)}
                        className="p-1.5 rounded-lg bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-400 hover:text-indigo-300 border border-indigo-900/60 transition cursor-pointer flex items-center justify-center"
                        title={language === 'en' ? 'Focus in Chronicles view' : 'In Chronik-Ansicht fokussieren'}
                      >
                        <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                      </button>
                    </>
                  )}
                  <CollapseToggle
                    collapsed={false}
                    onToggle={() => setIsRightSidebarOpen(false)}
                    direction="horizontal-right"
                    variant="ghost"
                    titleExpand=""
                    titleCollapse={language === 'en' ? 'Collapse side panel' : 'Seitenleiste einklappen'}
                  />
                </div>
              </div>

              {/* Searchable Dossier Selector Dropdown */}
              <div className={`relative ${rightSidebarTab === 'dossier' ? '' : 'hidden'}`} ref={dossierSearchRef}>
                <button
                  type="button"
                  onClick={() => setIsDossierSearchOpen(!isDossierSearchOpen)}
                  className="w-full bg-surface-base border border-line hover:border-line-strong text-ink-bright text-xs font-mono rounded-xl p-2.5 flex items-center justify-between gap-2 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <Search className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate font-bold">
                      {previewEntity ? (
                        `[${i18nGetTypeTranslation(previewEntity.type, language)}] ${previewEntity.title}`
                      ) : (
                        (language === 'en' ? '-- Choose dossier --' : '-- Dossier wählen --')
                      )}
                    </span>
                  </div>
                  <ChevronDown className={`h-3.5 w-3.5 text-ink-secondary shrink-0 transition-transform ${isDossierSearchOpen ? 'rotate-180' : ''}`} />
                </button>

                {isDossierSearchOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-surface-elevated border border-line rounded-xl shadow-2xl p-2 flex flex-col gap-2 max-h-72 overflow-hidden">
                    {/* Search Input Field */}
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        autoFocus
                        value={dossierSearchQuery}
                        onChange={(e) => setDossierSearchQuery(e.target.value)}
                        placeholder={language === 'en' ? 'Search dossier...' : 'Dossier suchen...'}
                        className="w-full bg-surface-base border border-line text-ink-heading text-xs font-mono rounded-lg pl-8 pr-7 py-1.5 outline-none focus:border-indigo-500"
                      />
                      {dossierSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setDossierSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Filtered Entity List */}
                    <div className="overflow-y-auto flex flex-col gap-0.5 max-h-52 pr-1">
                      {filteredEntitiesList.length === 0 ? (
                        <p className="p-3 text-[11px] font-mono text-ink-muted text-center italic">
                          {language === 'en' ? 'No dossier found.' : 'Kein Dossier gefunden.'}
                        </p>
                      ) : (
                        filteredEntitiesList.map((ent) => {
                          const isSelected = ent.id === previewEntityId;
                          return (
                            <button
                              key={ent.id}
                              type="button"
                              onClick={() => {
                                setPreviewEntityId(ent.id);
                                setIsDossierSearchOpen(false);
                                setDossierSearchQuery('');
                              }}
                              className={`p-2 rounded-lg text-xs font-mono transition text-left flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-950/90 text-indigo-200 font-bold border border-indigo-800/80'
                                  : 'hover:bg-surface-hover/80 text-ink'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <EntityTypeBadge type={ent.type} language={language} size="xs" />
                                <span className="truncate">{ent.title}</span>
                              </div>
                              {isSelected && <CheckCircle className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {rightSidebarTab === 'dossier' ? (
              /* Read-Only Dossier Content Preview */
              <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-4">
                {previewEntity ? (
                  <EntityDetailView
                    entity={previewEntity}
                    entities={entities}
                    looseMedia={looseMedia}
                    language={language}
                    onSelectEntity={(id) => setPreviewEntityId(id)}
                    onAddEntity={onAddEntity}
                  />
                ) : (
                  <div className="p-8 text-center border border-dashed border-line rounded-2xl bg-surface-card/40 font-mono text-xs text-ink-muted flex flex-col items-center gap-2">
                    <Eye className="h-6 w-6 text-ink-faint" />
                    <p>{language === 'en' ? 'Select a book, chapter, scene, or entity to view.' : 'Wähle links ein Buch, ein Kapitel, eine Szene oder einen Eintrag aus.'}</p>
                  </div>
                )}
              </div>
            ) : (
              <ManuscriptChatPanel
                api={manuscriptChat}
                language={language}
                hasActiveScene={isSceneOpen}
                selectedText={editorSelection.text}
                contradictions={sceneContradictions}
                onAppend={handleAppendAIText}
                onReplaceSelection={handleReplaceSelectionWithAIText}
              />
            )}
          </aside>
        )}
      </div>

      {/* Revision History Modal for Snapshots & Revisions */}
      <RevisionHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        entity={historyEntity || activeSceneEntity}
        onRestoreRevision={(restoredContent, customFields, tags) => {
          const target = historyEntity || activeSceneEntity;
          if (target) {
            onUpdateEntity({
              ...target,
              content: restoredContent,
              customFields: customFields || target.customFields,
              tags: tags || target.tags,
              lastModified: Date.now(),
            });
          }
        }}
        language={language}
      />

      {/* Delete Confirmation Modal */}
      {entityToDelete && (
        <div className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-elevated border border-line rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 text-ink-bright">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold font-mono">
                  {language === 'en' ? 'Delete Confirmation' : 'Löschen bestätigen'}
                </h3>
                <p className="text-xs text-ink-secondary mt-0.5">
                  {entityToDelete.type === 'chapter' ? (language === 'en' ? 'Chapter' : 'Kapitel') : (language === 'en' ? 'Scene' : 'Szene')}: <span className="text-ink-bright font-bold">{entityToDelete.title}</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-ink-secondary leading-relaxed">
              {language === 'en'
                ? `Are you sure you want to delete "${entityToDelete.title}"? This action cannot be undone.`
                : `Möchtest du "${entityToDelete.title}" wirklich unwiderruflich löschen?`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setEntityToDelete(null)}
                className="px-4 py-2 bg-surface-hover hover:bg-surface-active text-ink rounded-xl text-xs font-mono transition cursor-pointer font-bold"
              >
                {language === 'en' ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteEntity && entityToDelete) {
                    onDeleteEntity(entityToDelete.id);
                  }
                  setEntityToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-mono transition cursor-pointer font-bold flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{language === 'en' ? 'Delete Permanently' : 'Endgültig löschen'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
