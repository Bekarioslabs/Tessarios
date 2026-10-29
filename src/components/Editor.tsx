/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import { LoreEntity, EntityType, LooseMediaAsset } from '../types';
import MarkdownTextEditor, { MarkdownTextEditorHandle } from './MarkdownTextEditor';
import { DEFAULT_TEMPLATES } from '../data/templates';
import MapEditor from './MapEditor';
import MediaPickerModal from './MediaPickerModal';
import { BaseModal } from './BaseModal';
import { Toast } from './Toast';
import { RevisionHistoryModal } from './RevisionHistoryModal';
import { EntityDetailView } from './EntityDetailView';
import { slugify, inferTypeAndTemplateFromTitle } from '../utils/markdown';
import { ImageUploadModal, ImageUploadResult } from './ImageUploadModal';
import { Language, getTypeTranslation as i18nGetTypeTranslation, getSuggestedTags as i18nGetSuggestedTags, DEFAULT_TEMPLATES_LOCALIZED } from '../utils/i18n';
import { getTypeColor, getTypeIcon } from './EntityTypeBadge';
import CollapseToggle from './ui/CollapseToggle';
import { getManuscriptHierarchy, statusLabel, StatusType } from '../utils/manuscript';
import {
  Edit3,
  Eye,
  Plus,
  Trash2,
  Link2,
  FileText,
  Image as ImageIcon,
  Bot,
  Columns,
  Sliders,
  BookOpen,
  PenTool,
  Map,
  FileImage,
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  Images,
  Star,
  AlertTriangle,
  Check,
  History,
} from 'lucide-react';

interface EditorProps {
  entity: LoreEntity;
  entities: Record<string, LoreEntity>;
  looseMedia?: Record<string, LooseMediaAsset>;
  onUpdateEntity: (entity: LoreEntity) => void;
  onUpdateEntitiesBatch?: (updatedMap: Record<string, LoreEntity>) => void;
  onRenameEntity: (oldId: string, newTitle: string) => void;
  onSelectEntity: (id: string) => void;
  onAddEntity?: (type: EntityType, title: string, backlinkId?: string, templateId?: string, initialImageUrl?: string, autoOpen?: boolean) => void;
  onAddLooseMedia?: (asset: LooseMediaAsset) => void;
  language: Language;
  isCollapsed?: boolean;
  onToggleCollapseEditor?: () => void;
  onOpenManuscriptWorkspace?: () => void;
}

export default function Editor({
  entity,
  entities,
  looseMedia,
  onUpdateEntity,
  onUpdateEntitiesBatch,
  onRenameEntity,
  onSelectEntity,
  onAddEntity,
  onAddLooseMedia,
  language,
  isCollapsed = false,
  onToggleCollapseEditor,
  onOpenManuscriptWorkspace,
}: EditorProps) {
  const getTypeTranslation = (type: EntityType) => i18nGetTypeTranslation(type, language);
  const getSuggestedTags = (type: EntityType) => i18nGetSuggestedTags(type, language);
  const currentTemplates = DEFAULT_TEMPLATES_LOCALIZED[language] || DEFAULT_TEMPLATES;

  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [editorViewMode, setEditorViewMode] = useState<'split' | 'metadata' | 'prose'>(() => {
    const saved = localStorage.getItem('editor_view_mode');
    return (saved === 'split' || saved === 'metadata' || saved === 'prose') ? saved : 'split';
  });

  const handleSetEditorViewMode = (mode: 'split' | 'metadata' | 'prose') => {
    setEditorViewMode(mode);
    localStorage.setItem('editor_view_mode', mode);
  };
  const [newFieldName, setNewFieldName] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [linkingFieldKey, setLinkingFieldKey] = useState<string | null>(null);
  const [dossierSearchTerm, setDossierSearchTerm] = useState('');
  const [relSearchTerm, setRelSearchTerm] = useState('');
  const [showRelSuggestions, setShowRelSuggestions] = useState(false);
  const [localTitle, setLocalTitle] = useState(entity.title);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [mapModalReadOnly, setMapModalReadOnly] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'portrait' | 'text' | 'gallery'>('portrait');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
  const [enlargedImageIndex, setEnlargedImageIndex] = useState<number>(0);
  
  const [uploadModalFile, setUploadModalFile] = useState<File | null>(null);
  const [uploadModalBase64, setUploadModalBase64] = useState<string | undefined>(undefined);

  const swapEntityMainImage = (targetEntity: LoreEntity, newImageUrl: string): LoreEntity => {
    const oldMain = targetEntity.imageUrl;
    let gallery = targetEntity.galleryImageUrls ? [...targetEntity.galleryImageUrls] : [];

    // Filter out new main image from gallery list if present
    gallery = gallery.filter((u) => u !== newImageUrl);

    // Prepend old main image to gallery if present and unique
    if (oldMain && oldMain !== newImageUrl && !gallery.includes(oldMain)) {
      gallery.unshift(oldMain);
    }

    return {
      ...targetEntity,
      imageUrl: newImageUrl,
      galleryImageUrls: gallery,
      lastModified: Date.now(),
    };
  };

  const allLightboxImages = React.useMemo(() => {
    return [entity.imageUrl, ...(entity.galleryImageUrls || [])].filter((u): u is string => !!u && u.trim() !== '');
  }, [entity.imageUrl, entity.galleryImageUrls]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (enlargedImageUrl) {
        if (e.key === 'Escape') {
          setEnlargedImageUrl(null);
        } else if (e.key === 'ArrowLeft' && allLightboxImages.length > 1) {
          setEnlargedImageIndex((prev) => {
            const next = (prev - 1 + allLightboxImages.length) % allLightboxImages.length;
            setEnlargedImageUrl(allLightboxImages[next]);
            return next;
          });
        } else if (e.key === 'ArrowRight' && allLightboxImages.length > 1) {
          setEnlargedImageIndex((prev) => {
            const next = (prev + 1) % allLightboxImages.length;
            setEnlargedImageUrl(allLightboxImages[next]);
            return next;
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enlargedImageUrl, allLightboxImages]);

  const handleTextChange = (content: string) => {
    setAutosaveStatus('saving');
    onUpdateEntity({
      ...entity,
      content,
      lastModified: Date.now(),
    });
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  // The actual textarea lives inside the child MarkdownTextEditor, not here — this ref
  // reaches into it via forwardRef/useImperativeHandle so image inserts (media picker,
  // drag-drop, paste) land at the real cursor position instead of always appending to the
  // end of the content (which is what happened before this had no live textarea to target).
  const markdownEditorRef = React.useRef<MarkdownTextEditorHandle>(null);

  const insertTextAtCursor = (insertionText: string) => {
    if (markdownEditorRef.current) {
      markdownEditorRef.current.insertAtCursor(insertionText);
    } else {
      handleTextChange((entity.content || '') + insertionText);
    }
  };

  useEffect(() => {
    (window as any).insertTextAtEditorCursor = (textToInsert: string) => {
      insertTextAtCursor(textToInsert);
    };
  }, [entity.content]);

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
      insertTextAtCursor(`\n![[${result.title}]]\n`);
      setLinkNotification(
        language === 'en' ? `Image "${result.title}" inserted!` : `Bild „${result.title}“ eingefügt!`
      );
      setTimeout(() => setLinkNotification(null), 3000);
    } else if (result.mode === 'active') {
      onUpdateEntity(swapEntityMainImage(entity, result.url));
    }
  };

  const [linkNotification, setLinkNotification] = useState<string | null>(null);

  // Custom Field Delete Warning Modal state
  const [deleteFieldConfirmKey, setDeleteFieldConfirmKey] = useState<string | null>(null);

  // Trigger brief saving animation on modifications
  useEffect(() => {
    setAutosaveStatus('saved');
    setLocalTitle(entity.title);
  }, [entity.id]);

  // Sync local title if external title changes
  useEffect(() => {
    setLocalTitle(entity.title);
  }, [entity.title]);

  const handleCommitTitleChange = () => {
    const trimmed = localTitle.trim();
    if (!trimmed) {
      setLocalTitle(entity.title);
      return;
    }
    if (trimmed === entity.title) return;

    setAutosaveStatus('saving');

    // Auto-update content if it starts with # Buchtitel or # <oldTitle>
    let updatedContent = entity.content || '';
    if (updatedContent.startsWith('# Buchtitel')) {
      updatedContent = updatedContent.replace(/^# Buchtitel/m, `# ${trimmed}`);
      onUpdateEntity({
        ...entity,
        title: trimmed,
        content: updatedContent,
        customFields: {
          ...entity.customFields,
          ...(entity.type === 'book' && (!entity.customFields['Arbeitstitel'] || entity.customFields['Arbeitstitel'] === entity.title) ? { 'Arbeitstitel': trimmed } : {})
        },
        lastModified: Date.now()
      });
    }

    onRenameEntity(entity.id, trimmed);
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  // Add a customizable metadata attribute (Custom character sheets)
  const handleAddCustomField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldName.trim()) return;
    
    setAutosaveStatus('saving');
    onUpdateEntity({
      ...entity,
      customFields: {
        ...entity.customFields,
        [newFieldName.trim()]: '',
      },
      lastModified: Date.now(),
    });
    setNewFieldName('');
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  const handleUpdateCustomField = (key: string, value: string) => {
    setAutosaveStatus('saving');
    let updatedContent = entity.content || '';

    // If updating Arbeitstitel on a book entity and content has # Buchtitel or # <oldArbeitstitel>, sync header
    if (entity.type === 'book' && (key === 'Arbeitstitel' || key === 'Working Title')) {
      if (updatedContent.startsWith('# Buchtitel')) {
        updatedContent = updatedContent.replace(/^# Buchtitel/m, `# ${value || 'Buchtitel'}`);
      } else if (entity.customFields['Arbeitstitel'] && updatedContent.startsWith(`# ${entity.customFields['Arbeitstitel']}`)) {
        const escaped = entity.customFields['Arbeitstitel'].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        updatedContent = updatedContent.replace(new RegExp(`^# ${escaped}`, 'm'), `# ${value}`);
      }
    }

    onUpdateEntity({
      ...entity,
      content: updatedContent,
      customFields: {
        ...entity.customFields,
        [key]: value,
      },
      lastModified: Date.now(),
    });
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  const handleDeleteCustomField = (key: string) => {
    setAutosaveStatus('saving');
    const updated = { ...entity.customFields };
    delete updated[key];
    onUpdateEntity({
      ...entity,
      customFields: updated,
      lastModified: Date.now(),
    });
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  // Add YAML Tag-pill
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = newTagInput.trim().toLowerCase().replace(/[^a-z0-9\-]/g, '');
    if (!tag || entity.tags.includes(tag)) return;

    setAutosaveStatus('saving');
    onUpdateEntity({
      ...entity,
      tags: [...entity.tags, tag],
      lastModified: Date.now(),
    });
    setNewTagInput('');
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  const handleDeleteTag = (tagToRemove: string) => {
    setAutosaveStatus('saving');
    onUpdateEntity({
      ...entity,
      tags: entity.tags.filter(t => t !== tagToRemove),
      lastModified: Date.now(),
    });
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  // Relationship Builder
  const [relTargetId, setRelTargetId] = useState('');
  const [relType, setRelType] = useState('Ally');

  const handleAddRelation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!relTargetId || relTargetId === entity.id) return;
    
    // Check if duplicate relationship already modeled
    if (entity.relations.some(r => r.targetId === relTargetId && r.type === relType)) return;

    setAutosaveStatus('saving');
    onUpdateEntity({
      ...entity,
      relations: [...entity.relations, { targetId: relTargetId, type: relType }],
      lastModified: Date.now(),
    });
    setRelTargetId('');
    setRelSearchTerm('');
    setShowRelSuggestions(false);
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  const handleDeleteRelation = (targetId: string, type: string) => {
    setAutosaveStatus('saving');
    onUpdateEntity({
      ...entity,
      relations: entity.relations.filter(r => !(r.targetId === targetId && r.type === type)),
      lastModified: Date.now(),
    });
    setTimeout(() => setAutosaveStatus('saved'), 600);
  };

  // Preset Template selector
  const handleApplyTemplate = (templateId: string) => {
    setPendingTemplateId(templateId);
  };

  // Inject a global router dispatcher for Markdown clicks
  useEffect(() => {
    (window as any).dispatchSelectEntity = (slug: string, rawTitle: string) => {
      if (entities[slug]) {
        onSelectEntity(slug);
      } else {
        if (onAddEntity) {
          const inferred = inferTypeAndTemplateFromTitle(rawTitle, entity.type);
          onAddEntity(inferred.type, inferred.cleanTitle, entity.id, inferred.templateId);
        }
      }
    };
  }, [entities, entity.id, entity.type, onAddEntity]);

  // Helper to calculate dynamic manuscript word progress (Book/Chapter sum scenes; Scene counts text after ## Manuskript)
  const getProgressStats = () => {
    const cleanStr = (s: string) => s.replace(/^\[\[|\]\]$/g, '').trim().toLowerCase();

    // Helper to count words strictly after ## Manuskript or ## Manuscript
    const countManuscriptWords = (text: string | undefined): number => {
      if (!text) return 0;
      const regex = /(?:^|\n)#+\s*(?:manuskript|manuscript)\b/i;
      const match = text.match(regex);
      if (!match || match.index === undefined) {
        return 0; // No ## Manuskript heading present
      }
      const manuscriptPart = text.slice(match.index + match[0].length);
      return manuscriptPart.trim().split(/\s+/).filter(Boolean).length;
    };

    if (entity.type === 'book') {
      const bookTitle = cleanStr(entity.title);
      const chapters = Object.values(entities).filter(e => {
        if (e.type !== 'chapter') return false;
        const linkedBook = cleanStr(e.customFields['Buch'] || e.customFields['Book'] || '');
        const isRel = e.relations.some(r => r.targetId === entity.id);
        return isRel || (bookTitle && linkedBook.includes(bookTitle));
      });

      let currentWords = 0;
      let totalScenes = 0;

      for (const chap of chapters) {
        const chapTitle = cleanStr(chap.title);
        const scenes = Object.values(entities).filter(s => {
          if (s.type !== 'scene') return false;
          const linkedChap = cleanStr(s.customFields['Kapitel'] || s.customFields['Chapter'] || '');
          const isRel = s.relations.some(r => r.targetId === chap.id);
          return isRel || (chapTitle && linkedChap.includes(chapTitle));
        });

        totalScenes += scenes.length;
        for (const sc of scenes) {
          currentWords += countManuscriptWords(sc.content);
        }
      }

      let infoText = '';
      if (totalScenes > 0) {
        infoText = language === 'en' 
          ? `Sum from ${chapters.length} chapter(s) & ${totalScenes} scene(s)` 
          : `Summe aus ${chapters.length} Kapitel(n) (${totalScenes} Szenen)`;
      } else if (chapters.length > 0) {
        infoText = language === 'en' 
          ? `${chapters.length} chapter(s) (0 scenes)` 
          : `${chapters.length} Kapitel (0 Szenen)`;
      } else {
        infoText = language === 'en' ? '0 scenes in book' : '0 Szenen im Buch';
      }

      const rawTarget = entity.customFields['Wortziel'] || entity.customFields['WordGoal'] || entity.customFields['Target Word Count'] || '10000';
      const targetWords = parseInt(rawTarget.replace(/\D/g, ''), 10) || 10000;
      const percentage = targetWords > 0 ? Math.round((currentWords / targetWords) * 100) : 0;

      return {
        currentWords,
        targetWords,
        percentage,
        infoText
      };
    } else if (entity.type === 'chapter') {
      const chapTitle = cleanStr(entity.title);
      const scenes = Object.values(entities).filter(s => {
        if (s.type !== 'scene') return false;
        const linkedChap = cleanStr(s.customFields['Kapitel'] || s.customFields['Chapter'] || '');
        const isRel = s.relations.some(r => r.targetId === entity.id);
        return isRel || (chapTitle && linkedChap.includes(chapTitle));
      });

      let currentWords = 0;
      for (const sc of scenes) {
        currentWords += countManuscriptWords(sc.content);
      }

      let infoText = '';
      if (scenes.length > 0) {
        infoText = language === 'en' 
          ? `Sum from ${scenes.length} scene(s)` 
          : `Summe aus ${scenes.length} Szene(n)`;
      } else {
        infoText = language === 'en' ? '0 scenes in this chapter' : '0 Szenen in diesem Kapitel';
      }

      const rawTarget = entity.customFields['Wortziel'] || entity.customFields['WordGoal'] || entity.customFields['Target Word Count'] || '2000';
      const targetWords = parseInt(rawTarget.replace(/\D/g, ''), 10) || 2000;
      const percentage = targetWords > 0 ? Math.round((currentWords / targetWords) * 100) : 0;

      return {
        currentWords,
        targetWords,
        percentage,
        infoText
      };
    } else if (entity.type === 'scene') {
      const currentWords = countManuscriptWords(entity.content);
      const hasManuscriptHeader = /(?:^|\n)#+\s*(?:manuskript|manuscript)\b/i.test(entity.content || '');

      const rawTarget = entity.customFields['Wortziel'] || entity.customFields['WordGoal'] || entity.customFields['Target Word Count'] || '500';
      const targetWords = parseInt(rawTarget.replace(/\D/g, ''), 10) || 500;
      const percentage = targetWords > 0 ? Math.round((currentWords / targetWords) * 100) : 0;

      const infoText = hasManuscriptHeader
        ? (language === 'en' ? 'Text after ## Manuscript' : 'Text nach ## Manuskript')
        : (language === 'en' ? 'Requires ## Manuscript section' : 'Benötigt ## Manuskript Überschrift');

      return {
        currentWords,
        targetWords,
        percentage,
        infoText,
        hasManuscriptHeader
      };
    }

    return null;
  };

  const handleInsertManuscriptHeader = () => {
    const current = entity.content || '';
    const addition = current.endsWith('\n') ? '\n## Manuskript\n' : '\n\n## Manuskript\n';
    onUpdateEntity({
      ...entity,
      content: current + addition
    });
  };

  const renderWordProgressBar = () => {
    if (!['book', 'chapter', 'scene'].includes(entity.type)) return null;
    const stats = getProgressStats();
    if (!stats) return null;
    const barPercent = Math.min(100, Math.max(0, stats.percentage));
    const isComplete = stats.percentage >= 100;
    const isSceneOrChapter = ['scene', 'chapter'].includes(entity.type);
    const isMissingHeader = isSceneOrChapter && stats.hasManuscriptHeader === false;

    return (
      <div className="rounded-xl border border-indigo-900/60 bg-surface-base p-3 flex flex-col gap-2 shadow-lg mb-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
            {language === 'en' ? 'WORD GOAL & PROGRESS' : 'WORTZIEL & FORTSCHRITT'}
          </span>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
            isComplete 
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
              : 'bg-indigo-950/80 text-indigo-300 border-indigo-800/80'
          }`}>
            {stats.percentage}% {isComplete ? '🎉' : ''}
          </span>
        </div>

        {/* Numerical Stats */}
        <div className="flex items-baseline justify-between text-xs font-mono">
          <span className="text-ink-bright font-bold">
            {stats.currentWords.toLocaleString(language === 'en' ? 'en-US' : 'de-DE')}{' '}
            <span className="text-ink-muted font-normal">/ {stats.targetWords.toLocaleString(language === 'en' ? 'en-US' : 'de-DE')} {language === 'en' ? 'words' : 'Wörter'}</span>
          </span>
          <span className="text-[9px] font-mono text-ink-secondary">
            {stats.infoText}
          </span>
        </div>

        {/* Horizontal Progress Bar */}
        <div className="w-full bg-surface-control/90 rounded-full h-2.5 overflow-hidden border border-line/80 relative p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isComplete
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                : 'bg-gradient-to-r from-indigo-600 via-purple-500 to-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.4)]'
            }`}
            style={{ width: `${barPercent}%` }}
          />
        </div>

        {/* Alert & Restore Button if ## Manuskript header is missing */}
        {isMissingHeader && (
          <div className="mt-1 p-2 rounded-lg bg-amber-950/40 border border-amber-800/60 flex flex-col gap-1.5 text-[10px] font-mono">
            <div className="flex items-center gap-1.5 text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>
                {language === 'en' 
                  ? 'Missing "## Manuscript" header!' 
                  : '„## Manuskript“ Überschrift fehlt!'}
              </span>
            </div>
            <p className="text-[9px] text-amber-400/80 leading-tight">
              {language === 'en'
                ? 'Text in scenes only counts towards word goal after the ## Manuscript section.'
                : 'Erst Text unter der Überschrift ## Manuskript fließt in die Wortzählung ein.'}
            </p>
            <button
              type="button"
              onClick={handleInsertManuscriptHeader}
              className="mt-0.5 self-start px-2 py-1 rounded bg-amber-900/80 hover:bg-amber-800 text-amber-100 border border-amber-700/80 font-bold transition cursor-pointer flex items-center gap-1"
            >
              <Plus className="h-3 w-3" />
              <span>{language === 'en' ? '+ Add ## Manuscript' : '+ ## Manuskript einfügen'}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-surface-card border border-line rounded-xl overflow-hidden" id="editor-workspace">
      {/* Image insert/upload feedback toast. linkNotification was previously set but never
          rendered anywhere, so the confirmation silently never appeared. */}
      {linkNotification && (
        <Toast
          className="fixed bottom-6 right-6"
          icon={<Check className="h-3.5 w-3.5 text-emerald-400" />}
          message={linkNotification}
        />
      )}

      {/* Header bar */}
      <div className="px-3 py-2 md:px-4 md:py-2.5 bg-surface-card border-b border-line/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Entity Type Badge (fixed at creation — not changeable here, since switching the
              category alone would leave the dossier fields belonging to the old type) */}
          <div
            className={`flex items-center gap-1.5 shrink-0 border p-1.5 rounded-lg text-xs font-mono font-semibold select-none ${getTypeColor(entity.type)}`}
          >
            {getTypeIcon(entity.type, 'h-3.5 w-3.5')}
            <span>{getTypeTranslation(entity.type as any)}</span>
          </div>
          {/* Interactive Title Field */}
          <input
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleCommitTitleChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCommitTitleChange();
                e.currentTarget.blur();
              }
            }}
            className="bg-transparent border-none outline-none font-mono text-xs md:text-sm font-bold text-ink-heading focus:border-b focus:border-indigo-500 pb-0.5 min-w-[100px] max-w-[200px] sm:max-w-[300px] truncate"
          />
        </div>

        {/* Tab Selection & Autosave indicator */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {/* Autosave status indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-ink-muted shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${autosaveStatus === 'saved' ? 'bg-green-500' : 'bg-indigo-500 animate-pulse'}`} />
            <span className="hidden md:inline">
              {autosaveStatus === 'saved' 
                ? (language === 'en' ? 'Auto-saved' : 'Gespeichert')
                : (language === 'en' ? 'Saving...' : 'Speichern...')}
            </span>
          </div>

          {/* Version History Button */}
          <button
            type="button"
            onClick={() => setIsHistoryModalOpen(true)}
            className="w-[30px] h-[30px] flex items-center justify-center bg-surface-elevated hover:bg-indigo-950/60 text-ink hover:text-ink-heading border border-line hover:border-indigo-700/80 rounded-md text-[11px] font-mono transition cursor-pointer shadow-sm shrink-0"
            title={language === 'en' ? 'Version History & Restores' : 'Versionsverlauf & Wiederherstellen'}
          >
            <History className="h-3.5 w-3.5 text-indigo-400" />
          </button>

          {/* Bearbeiten / Betrachten Switcher */}
          <div className="flex bg-surface-base rounded-md p-0.5 border border-line/80 shrink-0 shadow-sm">
            <button
              onClick={() => setActiveTab('edit')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono transition cursor-pointer ${
                activeTab === 'edit' ? 'bg-indigo-600 text-white shadow-[0_0_8px_rgba(0,96,229,0.3)] font-semibold' : 'text-ink-secondary hover:text-ink-bright'
              }`}
              title={language === 'en' ? 'Edit Mode' : 'Bearbeiten-Modus'}
            >
              <Edit3 className="h-3 w-3" />
              <span>{language === 'en' ? 'Edit' : 'Bearbeiten'}</span>
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono transition cursor-pointer ${
                activeTab === 'preview' ? 'bg-indigo-600 text-white shadow-[0_0_8px_rgba(0,96,229,0.3)] font-semibold' : 'text-ink-secondary hover:text-ink-bright'
              }`}
              title={language === 'en' ? 'View Mode' : 'Betrachten-Modus'}
            >
              <Eye className="h-3 w-3" />
              <span>{language === 'en' ? 'View' : 'Betrachten'}</span>
            </button>
          </div>

          {/* Collapse Dossier Button */}
          {onToggleCollapseEditor && (
            <CollapseToggle
              collapsed={isCollapsed}
              onToggle={onToggleCollapseEditor}
              direction="vertical"
              titleExpand={language === 'en' ? 'Expand Dossier' : 'Dossier ausklappen'}
              titleCollapse={language === 'en' ? 'Collapse Dossier' : 'Dossier einklappen'}
            />
          )}
        </div>
      </div>

      {/* Everything below the header collapses together (height-animated), so the header —
          which already shows the entity name/type and its own buttons — stays visible and
          useful even while collapsed, instead of being swapped for a separate summary bar. */}
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out min-h-0 ${isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr] flex-1'}`}>
      <div className="overflow-hidden min-h-0 flex flex-col">

      {/* Persistent sub-header View Mode Switcher bar - directly under character name and header */}
      {activeTab === 'edit' && (
        <div className="px-4 py-2 bg-surface-base border-b border-line/80 flex items-center justify-between">
          <div className="flex bg-surface-card rounded-lg p-0.5 border border-line/80" title={language === 'en' ? 'View Mode' : 'Ansichtsmodus'}>
            <button
              type="button"
              onClick={() => handleSetEditorViewMode('metadata')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono transition cursor-pointer ${
                editorViewMode === 'metadata' ? 'bg-indigo-800 text-ink-heading shadow-[0_0_8px_rgba(0,63,152,0.4)]' : 'text-ink-secondary hover:text-ink-bright'
              }`}
              title={language === 'en' ? 'Manage Dossier & Tags only' : 'Nur Dossier & Tags verwalten'}
            >
              <Sliders className="h-3 w-3" />
              <span>Dossier</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetEditorViewMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono transition cursor-pointer ${
                editorViewMode === 'split' ? 'bg-indigo-800 text-ink-heading shadow-[0_0_8px_rgba(0,63,152,0.4)]' : 'text-ink-secondary hover:text-ink-bright'
              }`}
              title={language === 'en' ? 'Split View (Dossier + Prose)' : 'Geteilte Ansicht (Dossier + Text)'}
            >
              <Columns className="h-3 w-3" />
              <span>Split</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetEditorViewMode('prose')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono transition cursor-pointer ${
                editorViewMode === 'prose' ? 'bg-indigo-800 text-ink-heading shadow-[0_0_8px_rgba(0,63,152,0.4)]' : 'text-ink-secondary hover:text-ink-bright'
              }`}
              title={language === 'en' ? 'Edit text only (A4 layout)' : 'Nur Fließtext bearbeiten (A4-Seitenansicht)'}
            >
              <FileText className="h-3 w-3" />
              <span>{language === 'en' ? 'Text' : 'Text'}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-ink-muted uppercase tracking-wider hidden sm:inline">
              {language === 'en' ? 'Focus:' : 'Fokus:'}{' '}
              <span className="text-indigo-400">
                {editorViewMode === 'metadata' 
                  ? (language === 'en' ? 'Dossier Fields' : 'Dossier-Steckbrief') 
                  : editorViewMode === 'split' 
                    ? (language === 'en' ? 'Dossier & Text split' : 'Dossier + Text geteilt') 
                    : (language === 'en' ? 'Prose (A4)' : 'Fließtext (A4)')}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Workspace Inner View */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'edit' ? (
          /* Dual pane (Attributes vs Text Editor) */
          <div className="flex flex-col md:flex-row flex-1 h-full min-h-0 overflow-hidden">
            {/* Metadata / Attributes pane */}
            {(editorViewMode === 'split' || editorViewMode === 'metadata') && (
              <div className={`border-line/80 bg-surface-card overflow-y-auto p-4 flex flex-col gap-5 ${
                editorViewMode === 'metadata'
                  ? 'w-full h-full'
                  : 'w-full md:w-72 lg:w-80 h-1/2 md:h-full shrink-0 border-b md:border-b-0 md:border-r'
              }`}>

              {/* Open in Manuscript Shortcut (above portrait) */}
              {['book', 'chapter', 'scene'].includes(entity.type) && onOpenManuscriptWorkspace && (
                <button
                  type="button"
                  onClick={onOpenManuscriptWorkspace}
                  className="w-full py-2.5 px-3 bg-surface-control/90 hover:bg-surface-hover border border-line-strong/80 hover:border-indigo-500/80 text-ink-bright rounded-xl font-mono text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 shadow-md shrink-0 btn-interactive"
                >
                  <PenTool className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>{language === 'en' ? 'Open in Manuscript' : 'Im Manuskript öffnen'}</span>
                </button>
              )}

              {/* Profile Illustration / Map Preview slot */}
              {entity.type === 'map' ? (
                <div className="rounded-lg border border-indigo-800/80 bg-indigo-950/20 p-3 flex flex-col gap-2.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase flex items-center gap-1">
                      <Map className="h-3.5 w-3.5" />
                      {language === 'en' ? 'WORLD MAP PREVIEW' : 'WELTKARTEN-VORSCHAU'}
                    </span>
                    <span className="text-[9px] font-mono text-ink-muted">
                      {entity.mapMarkers?.length || 0} Pins
                    </span>
                  </div>

                  {entity.imageUrl ? (
                    <div
                      onClick={() => {
                        setMapModalReadOnly(false);
                        setIsMapModalOpen(true);
                      }}
                      className="relative aspect-square w-full rounded-xl overflow-hidden border border-line bg-surface-base cursor-pointer group flex items-center justify-center"
                      title={language === 'en' ? 'Click to open Fullscreen Map Studio' : 'Klicken zum Öffnen der interaktiven Karte im Vollbild'}
                    >
                      <img src={entity.imageUrl} alt="Map Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      {(entity.mapMarkers || [])
                        .filter((m) => !m.floorId || m.floorId === 'main' || m.floorId === entity.mapFloors?.[0]?.id)
                        .map((m) => (
                          <div
                            key={m.id}
                            className="absolute w-2.5 h-2.5 rounded-full bg-amber-400 border border-black transform -translate-x-1/2 -translate-y-1/2 shadow-sm"
                            style={{ left: `${m.x}%`, top: `${m.y}%` }}
                          />
                        ))}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center p-2 text-center">
                        <span className="text-[10px] font-mono font-bold text-white bg-indigo-600 px-2.5 py-1 rounded-lg shadow">
                          {language === 'en' ? '▶ Open Interactive Map' : '▶ Interaktive Karte öffnen'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMapModalReadOnly(false);
                        setIsMapModalOpen(true);
                      }}
                      className="w-full py-3 px-2 rounded-xl border border-dashed border-indigo-700/80 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 hover:text-ink-heading transition cursor-pointer flex flex-col items-center justify-center gap-1.5 group"
                      title={language === 'en' ? 'Click to open Map Studio' : 'Klicken, um den Karten-Editor zu öffnen'}
                    >
                      <Map className="h-5 w-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-mono font-bold">
                        {language === 'en' ? '▶ Open Map Studio' : '▶ Karten-Studio öffnen'}
                      </span>
                      <span className="text-[9px] font-mono text-indigo-400/70">
                        {language === 'en' ? 'Add images, floors & pins' : 'Bilder, Etagen & Pins hinzufügen'}
                      </span>
                    </button>
                  )}
                </div>
              ) : entity.imageUrl ? (
                <div className="relative w-44 h-44 sm:w-48 sm:h-48 aspect-square rounded-xl overflow-hidden border border-line bg-surface-base group shadow-lg shrink-0">
                  <img
                    src={entity.imageUrl}
                    alt={language === 'en' ? 'Portrait' : 'Porträt'}
                    className="w-full h-full object-cover cursor-pointer"
                    referrerPolicy="no-referrer"
                    onClick={() => {
                      setEnlargedImageIndex(0);
                      setEnlargedImageUrl(entity.imageUrl!);
                    }}
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 backdrop-blur-[1px]">
                    <button
                      type="button"
                      onClick={() => {
                        setEnlargedImageIndex(0);
                        setEnlargedImageUrl(entity.imageUrl!);
                      }}
                      className="p-1.5 rounded-md bg-indigo-600/90 hover:bg-indigo-500 text-white text-[10px] font-mono font-bold transition cursor-pointer flex items-center gap-1 shadow"
                      title={language === 'en' ? 'Enlarge image' : 'Bild vergrößern'}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>{language === 'en' ? 'Enlarge' : 'Vergrößern'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateEntity({ ...entity, imageUrl: undefined, lastModified: Date.now() })}
                      className="p-1.5 rounded-md bg-surface-base/80 hover:bg-rose-950 text-ink-secondary hover:text-rose-400 transition cursor-pointer"
                      title={language === 'en' ? 'Remove main picture' : 'Hauptbild entfernen'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-surface-base/50 p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 text-ink-secondary text-xs font-mono">
                    <ImageIcon className="h-4 w-4 text-indigo-400" />
                    <span>{language === 'en' ? 'Portrait / Illustration' : 'Portrait / Illustration'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Select from Media Gallery button */}
                    <button
                      onClick={() => {
                        setMediaPickerTarget('portrait');
                        setIsMediaPickerOpen(true);
                      }}
                      className="py-1.5 px-2 bg-surface-control hover:bg-surface-hover text-ink border border-line hover:border-indigo-800/80 rounded text-xs font-mono transition cursor-pointer flex items-center justify-center gap-1.5"
                      title={language === 'en' ? "Select image from media gallery" : "Bild aus Medien-Galerie wählen"}
                    >
                      <FileImage className="h-3.5 w-3.5 text-indigo-400" />
                      <span>{language === 'en' ? 'Media' : 'Mediathek'}</span>
                    </button>

                    {/* File upload button */}
                    <label className="py-1.5 px-2 bg-surface-control hover:bg-surface-hover text-ink border border-line rounded text-xs font-mono transition cursor-pointer flex items-center justify-center gap-1.5 text-center">
                      <Plus className="h-3.5 w-3.5 text-ink-secondary" />
                      <span>Upload</span>
                      <input
                        type="file"
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
                    </label>
                  </div>
                </div>
              )}

              {/* Additional Gallery Images Manager */}
              {entity.type !== 'map' && (
                <div className="mt-2 pt-2 border-t border-line/80 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-ink-secondary font-bold uppercase flex items-center gap-1">
                      <Images className="h-3 w-3 text-indigo-400" />
                      {language === 'en' ? 'GALLERY' : 'GALERIE'}
                      {entity.galleryImageUrls && entity.galleryImageUrls.length > 0 && (
                        <span className="text-ink-muted font-normal">({entity.galleryImageUrls.length})</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMediaPickerTarget('gallery');
                          setIsMediaPickerOpen(true);
                        }}
                        className="text-[9px] font-mono btn-action-indigo px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1 shadow-sm"
                      >
                        <Plus className="h-3 w-3" />
                        {language === 'en' ? 'Add image' : 'Bild hinzufügen'}
                      </button>
                    </div>
                  </div>

                  {entity.galleryImageUrls && entity.galleryImageUrls.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {entity.galleryImageUrls.map((gUrl, gIdx) => {
                        const lightboxIdx = entity.imageUrl ? gIdx + 1 : gIdx;
                        return (
                          <div
                            key={gIdx}
                            className="relative w-20 h-20 sm:w-24 sm:h-24 aspect-square rounded-lg overflow-hidden border border-line bg-surface-base group cursor-pointer shrink-0 shadow-sm"
                            onClick={() => {
                              setEnlargedImageIndex(lightboxIdx);
                              setEnlargedImageUrl(gUrl);
                            }}
                          >
                            <img src={gUrl} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-around p-0.5 backdrop-blur-[1px]">
                              {/* Set as main image */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateEntity(swapEntityMainImage(entity, gUrl));
                                }}
                                className="p-1 rounded bg-amber-950/90 hover:bg-amber-800 text-amber-300 border border-amber-700/80 transition cursor-pointer"
                                title={language === 'en' ? 'Set as main portrait' : 'Als Hauptbild setzen'}
                              >
                                <Star className="h-2.5 w-2.5 fill-amber-300" />
                              </button>

                              {/* View / Enlarge */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEnlargedImageIndex(lightboxIdx);
                                  setEnlargedImageUrl(gUrl);
                                }}
                                className="p-1 rounded bg-indigo-950/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/80 transition cursor-pointer"
                                title={language === 'en' ? 'Enlarge image' : 'Bild vergrößern'}
                              >
                                <Eye className="h-2.5 w-2.5" />
                              </button>

                              {/* Remove */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newList = (entity.galleryImageUrls || []).filter((_, i) => i !== gIdx);
                                  onUpdateEntity({ ...entity, galleryImageUrls: newList, lastModified: Date.now() });
                                }}
                                className="p-1 rounded bg-black/80 hover:bg-rose-950 text-ink-secondary hover:text-rose-400 transition cursor-pointer"
                                title={language === 'en' ? 'Remove from gallery' : 'Aus Galerie entfernen'}
                              >
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-[9px] font-mono text-ink-faint italic">
                      {language === 'en' ? 'No additional gallery images linked.' : 'Keine zusätzlichen Galerie-Bilder verlinkt.'}
                    </span>
                  )}
                </div>
              )}

              {/* Tags panel */}
              <div>
                <span className="block text-[10px] font-mono font-bold tracking-wider text-ink-secondary uppercase mb-2 border-b border-line/80 pb-1">
                  {language === 'en' ? 'YAML TAGS' : 'YAML-TAGS'}
                </span>
                <div className="flex flex-wrap gap-1 mb-2">
                  {entity.tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono yaml-tag shadow-sm">
                      #{tag}
                      <button onClick={() => handleDeleteTag(tag)} className="hover:text-ink-heading font-bold ml-0.5 cursor-pointer">×</button>
                    </span>
                  ))}
                </div>
                <form onSubmit={handleAddTag} className="flex">
                  <input
                    type="text"
                    placeholder={language === 'en' ? "Add tag (e.g., antagonist)..." : "Tag hinzufügen (z.B. antagonist)..."}
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    className="w-full bg-surface-base border border-line/80 rounded px-2 py-1 text-[10px] text-ink-heading outline-none focus:border-indigo-500 font-mono"
                  />
                </form>
                {/* Tag suggestions */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="text-[8px] font-mono text-ink-muted self-center">
                    {language === 'en' ? 'Recommended:' : 'Empfohlen:'}
                  </span>
                  {getSuggestedTags(entity.type)
                    .filter(t => !entity.tags.includes(t))
                    .map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setAutosaveStatus('saving');
                          onUpdateEntity({
                            ...entity,
                            tags: [...entity.tags, t],
                            lastModified: Date.now(),
                          });
                          setTimeout(() => setAutosaveStatus('saved'), 600);
                        }}
                        className="px-1.5 py-0.5 rounded bg-surface-control hover:bg-indigo-950/40 text-[8px] font-mono text-ink-secondary hover:text-indigo-300 border border-line/80 transition cursor-pointer"
                      >
                        +{t}
                      </button>
                    ))
                  }
                </div>
              </div>

              {/* Customizable Fields / Dossier Builder */}
              <div>
                <div className="flex items-center justify-between mb-3 border-b border-line/80 pb-1">
                  <span className="text-[10px] font-mono font-bold tracking-wider text-ink-secondary uppercase">
                    {entity.type === 'character' 
                      ? (language === 'en' ? 'CHARACTER DOSSIER' : 'CHARAKTER-DOSSIER')
                      : (language === 'en' ? 'ATTRIBUTES SHEET' : 'ATTRIBUT-BLATT')}
                  </span>
                  <form onSubmit={handleAddCustomField} className="flex gap-1">
                    <input
                      type="text"
                      placeholder={language === 'en' ? "+ Field" : "+ Feld"}
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      className="bg-surface-base border border-line/80 rounded px-1.5 py-0.5 text-[9px] text-ink-heading outline-none focus:border-indigo-500 font-mono w-20"
                    />
                  </form>
                </div>

                {/* Dynamic Word Goal & Progress Bar Banner for Book, Chapter, Scene */}
                {renderWordProgressBar()}

                <div className="flex flex-col gap-2.5">
                  {Object.entries(entity.customFields)
                    .filter(([key]) => {
                      const lower = key.toLowerCase();
                      return !['basisbild', 'markerdaten', 'loretyp', 'schauplatz', 'beteiligte', 'zugehöriges system', 'base image', 'marker data', 'lore type', 'setting', 'participants', 'associated system', 'fortschritt', 'progress', 'wortanzahl', 'word count', 'zeitpunkt', 'time'].includes(lower);
                    })
                    .map(([key, val]) => {
                      const displayKey = key === 'Hauptschauplatz' ? 'Schauplätze' : key === 'Primary Setting' ? 'Locations' : key;
                      const matchingTemplate = currentTemplates.find(t => t.type === entity.type);
                      const fieldDef = matchingTemplate?.fieldConfig?.[key];
                      const isSelectType = fieldDef?.type === 'select' && Array.isArray(fieldDef.options) && fieldDef.options.length > 0;
                      const isReadonlyType = fieldDef?.type === 'readonly' || fieldDef?.readonly === true;
                      const isStatusKey = key.toLowerCase().includes('status');
                      const isBookOrChapter = ['book', 'chapter'].includes(entity.type);
                      const statusPresets = ['Planung', 'Entwurf', 'In Überarbeitung', 'Korrektur', 'Abgeschlossen', 'Pausiert'];

                      // Calculate auto status for Book or Chapter
                      let autoStatus: StatusType = 'Entwurf';
                      let statusDetail = '';
                      if (isStatusKey && isBookOrChapter) {
                        const hierarchy = getManuscriptHierarchy(entities);
                        if (entity.type === 'chapter') {
                          for (const bk of hierarchy) {
                            const found = bk.chapters.find(c => c.id === entity.id);
                            if (found) {
                              autoStatus = found.status;
                              const ready = found.scenes.filter(s => s.status === 'Fertig').length;
                              statusDetail = `${ready}/${found.scenes.length} ${language === 'en' ? 'ready' : 'fertig'}`;
                              break;
                            }
                          }
                        } else if (entity.type === 'book') {
                          const bkItem = hierarchy.find(b => b.id === entity.id) || hierarchy[0];
                          if (bkItem) {
                            autoStatus = bkItem.status;
                            const ready = bkItem.chapters.filter(c => c.status === 'Fertig').length;
                            statusDetail = `${ready}/${bkItem.chapters.length} ${language === 'en' ? 'chapters ready' : 'Kapitel fertig'}`;
                          }
                        }
                      }

                      return (
                        <div key={key} className="flex flex-col gap-1 border-b border-line-subtle/20 pb-2 last:border-0 group">
                          <div className="flex items-center gap-2">
                            <span className="w-24 text-[10px] font-mono text-ink-muted truncate" title={displayKey}>
                              {displayKey}:
                            </span>
                            <div className="flex-1 flex gap-1 relative">
                              {isReadonlyType ? (
                                <div className="flex-1 bg-surface-base border border-line/80 rounded px-2 py-1 text-xs text-ink-secondary font-mono select-none">
                                  {val || '-'}
                                </div>
                              ) : isSelectType ? (
                                <select
                                  value={val}
                                  onChange={(e) => handleUpdateCustomField(key, e.target.value)}
                                  className="flex-1 bg-surface-base border border-indigo-900/60 rounded px-2 py-1 text-xs text-indigo-300 font-bold outline-none focus:border-indigo-500 transition font-mono cursor-pointer"
                                >
                                  {!fieldDef!.options!.includes(val) && val && (
                                    <option value={val}>✨ {val}</option>
                                  )}
                                  {fieldDef!.options!.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : isStatusKey && isBookOrChapter ? (
                                <div
                                  className="flex-1 bg-surface-base border border-emerald-800/80 rounded px-2.5 py-1 text-xs font-mono font-bold text-emerald-300 flex items-center justify-between shadow-sm select-none"
                                  title={language === 'en' ? 'Calculated automatically from scenes/chapters' : 'Automatisch aus Szenen/Kapiteln berechnet'}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span>{statusLabel(autoStatus, language)}</span>
                                  </span>
                                  <span className="text-[9px] text-emerald-500 font-mono font-normal">
                                    {statusDetail || 'AUTO'}
                                  </span>
                                </div>
                              ) : isStatusKey ? (
                                <select
                                  value={statusPresets.includes(val) ? val : val}
                                  onChange={(e) => handleUpdateCustomField(key, e.target.value)}
                                  className="flex-1 bg-surface-base border border-line/80 rounded px-2 py-1 text-xs text-indigo-300 font-bold outline-none focus:border-indigo-500 transition font-mono cursor-pointer"
                                >
                                  <option value="Planung">📌 {language === 'en' ? 'Planning' : 'Planung'}</option>
                                  <option value="Entwurf">📝 {language === 'en' ? 'Draft' : 'Entwurf'}</option>
                                  <option value="In Bearbeitung">⏳ {language === 'en' ? 'In Progress' : 'In Bearbeitung'}</option>
                                  <option value="In Überarbeitung">🔄 {language === 'en' ? 'In Revision' : 'In Überarbeitung'}</option>
                                  <option value="Fertig">✅ {language === 'en' ? 'Done' : 'Fertig / Abgeschlossen'}</option>
                                  {!statusPresets.includes(val) && val && (
                                    <option value={val}>✨ {val}</option>
                                  )}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(e) => handleUpdateCustomField(key, e.target.value)}
                                  className="flex-1 bg-surface-base border border-line/80 rounded px-2 py-1 text-xs text-ink-bright outline-none focus:border-indigo-500 transition font-mono"
                                  placeholder={language === 'en' ? "Value or [[WikiLink]]..." : "Wert oder [[Verlinkung]]..."}
                                />
                              )}
                          <button
                            onClick={() => {
                              if (linkingFieldKey === key) {
                                setLinkingFieldKey(null);
                                setDossierSearchTerm('');
                              } else {
                                setLinkingFieldKey(key);
                                setDossierSearchTerm('');
                              }
                            }}
                            className={`p-1 rounded border transition cursor-pointer flex items-center justify-center ${
                              linkingFieldKey === key
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-surface-base border-line text-ink-secondary hover:text-ink-heading hover:border-line-strong'
                            }`}
                            title={language === 'en' ? "Link other entry" : "Anderen Eintrag verlinken"}
                            type="button"
                          >
                            <Link2 className="h-3 w-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => setDeleteFieldConfirmKey(key)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-surface-hover rounded text-rose-400 hover:text-rose-300 transition cursor-pointer"
                          title={language === 'en' ? "Delete field" : "Feld löschen"}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>

                      {linkingFieldKey === key && (
                        <div className="ml-24 mt-1 bg-surface-base border border-line rounded-lg p-1.5 max-h-48 overflow-y-auto flex flex-col gap-1 z-10 shadow-2xl relative">
                          <div className="text-[9px] font-mono text-ink-muted px-1 border-b border-line/80 pb-1 flex justify-between items-center sticky top-0 bg-surface-base z-10">
                            <span>{language === 'en' ? 'Search & link entry:' : 'Eintrag suchen & verlinken:'}</span>
                            <button onClick={() => { setLinkingFieldKey(null); setDossierSearchTerm(''); }} className="hover:text-ink-heading font-bold px-1" type="button">×</button>
                          </div>
                          
                          <div className="sticky top-5 bg-surface-base pb-1 pt-0.5 z-10">
                            <input
                              type="text"
                              placeholder={language === 'en' ? "Search..." : "Suche..."}
                              value={dossierSearchTerm}
                              onChange={(e) => setDossierSearchTerm(e.target.value)}
                              className="w-full bg-surface-control border border-line rounded px-1.5 py-0.5 text-[9px] text-ink-heading outline-none focus:border-indigo-500 font-mono"
                              autoFocus
                            />
                          </div>

                          <div className="flex flex-col gap-0.5 mt-1">
                            {Object.values(entities)
                              .filter(e => e.id !== entity.id)
                              .filter(e => {
                                if (!dossierSearchTerm) return true;
                                const term = dossierSearchTerm.toLowerCase();
                                return e.title.toLowerCase().includes(term) || getTypeTranslation(e.type).toLowerCase().includes(term);
                              })
                              .sort((a, b) => {
                                if (fieldDef?.targetTypes) {
                                  const aMatches = fieldDef.targetTypes.includes(a.type);
                                  const bMatches = fieldDef.targetTypes.includes(b.type);
                                  if (aMatches && !bMatches) return -1;
                                  if (!aMatches && bMatches) return 1;
                                }
                                return 0;
                              })
                              .map(e => (
                                <button
                                  key={e.id}
                                  onClick={() => {
                                    const newVal = val ? `${val} [[${e.title}]]` : `[[${e.title}]]`;
                                    handleUpdateCustomField(key, newVal);
                                    setLinkingFieldKey(null);
                                    setDossierSearchTerm('');
                                  }}
                                  className="text-left px-2 py-1 hover:bg-indigo-950/50 hover:text-indigo-400 rounded text-[9px] font-mono text-ink transition-colors cursor-pointer flex justify-between items-center"
                                  type="button"
                                >
                                  <span className="truncate mr-2">{e.title}</span>
                                  <span className="text-[7px] text-ink-muted font-mono whitespace-nowrap">({getTypeTranslation(e.type)})</span>
                                </button>
                              ))}
                            
                            {Object.values(entities)
                              .filter(e => e.id !== entity.id)
                              .filter(e => {
                                if (!dossierSearchTerm) return true;
                                const term = dossierSearchTerm.toLowerCase();
                                return e.title.toLowerCase().includes(term) || getTypeTranslation(e.type).toLowerCase().includes(term);
                              }).length === 0 && (
                                <span className="text-[9px] font-mono text-ink-faint italic px-1 py-1">
                                  {language === 'en' ? 'No matching entries.' : 'Keine passenden Einträge.'}
                                </span>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                  {Object.keys(entity.customFields).length === 0 && (
                    <div className="text-[10px] font-mono text-ink-faint italic">
                      {language === 'en' 
                        ? 'No attributes defined. Enter a field name above to begin.'
                        : 'Keine Attribute definiert. Trage oben ein Feld ein, um zu beginnen.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Explicit Narrative Relationships Panel */}
              <div>
                <span className="block text-[10px] font-mono font-bold tracking-wider text-ink-secondary uppercase mb-2 border-b border-line/80 pb-1">
                  {language === 'en' ? 'YAML RELATIONSHIPS' : 'YAML-BEZIEHUNGEN'}
                </span>
                <div className="flex flex-col gap-1.5 mb-3">
                  {entity.relations.map((rel, idx) => {
                    const target = entities[rel.targetId];
                    return (
                      <div key={idx} className="flex items-center justify-between bg-surface-base p-1.5 rounded border border-line/80 text-[10px] font-mono">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <Link2 className="h-3 w-3 text-indigo-400 flex-shrink-0" />
                          <span className="text-indigo-400 hover:text-indigo-300 truncate font-semibold cursor-pointer" onClick={() => onSelectEntity(rel.targetId)}>
                            {target ? target.title : rel.targetId}
                          </span>
                          <span className="text-ink-muted">({rel.type})</span>
                        </div>
                        <button
                          onClick={() => handleDeleteRelation(rel.targetId, rel.type)}
                          className="text-rose-400 hover:text-rose-300 cursor-pointer font-bold"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleAddRelation} className="flex flex-col gap-1.5 relative">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={language === 'en' ? "Search entry to link..." : "Eintrag suchen zum Verlinken..."}
                      value={relSearchTerm}
                      onChange={(e) => {
                        setRelSearchTerm(e.target.value);
                        setShowRelSuggestions(true);
                        if (!e.target.value) {
                          setRelTargetId('');
                        }
                      }}
                      onFocus={() => setShowRelSuggestions(true)}
                      className="w-full bg-surface-base border border-line/80 rounded px-2 py-1 text-[10px] text-ink-heading outline-none focus:border-indigo-500 font-mono"
                    />
                    
                    {showRelSuggestions && (
                      <div className="absolute left-0 right-0 mt-1 bg-surface-base border border-line rounded-lg max-h-36 overflow-y-auto z-20 shadow-2xl flex flex-col p-1 gap-0.5">
                        <div className="text-[9px] font-mono text-ink-muted px-1.5 py-1 border-b border-line/80 flex justify-between items-center bg-surface-base">
                          <span>{language === 'en' ? 'Matching entries:' : 'Passende Einträge:'}</span>
                          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowRelSuggestions(false); }} className="hover:text-ink-heading font-bold px-1 text-xs" type="button">×</button>
                        </div>
                        {Object.values(entities)
                          .filter(e => e.id !== entity.id && 
                            (e.title.toLowerCase().includes(relSearchTerm.toLowerCase()) || 
                             getTypeTranslation(e.type).toLowerCase().includes(relSearchTerm.toLowerCase()))
                          )
                          .map(e => (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => {
                                setRelTargetId(e.id);
                                setRelSearchTerm(e.title);
                                setShowRelSuggestions(false);
                              }}
                              className={`text-left px-2 py-1.5 rounded text-[10px] font-mono transition-colors cursor-pointer flex justify-between items-center ${
                                relTargetId === e.id 
                                  ? 'bg-indigo-900 text-ink-heading font-semibold' 
                                  : 'hover:bg-indigo-950/40 text-ink hover:text-indigo-400'
                              }`}
                            >
                              <span>{e.title}</span>
                              <span className="text-[8px] text-ink-muted">({getTypeTranslation(e.type)})</span>
                            </button>
                          ))}
                        {Object.values(entities).filter(e => e.id !== entity.id && 
                          (e.title.toLowerCase().includes(relSearchTerm.toLowerCase()) || 
                           getTypeTranslation(e.type).toLowerCase().includes(relSearchTerm.toLowerCase()))
                        ).length === 0 && (
                          <span className="text-[9px] font-mono text-ink-faint italic px-2 py-1">{language === 'en' ? 'No entries found.' : 'Keine Einträge gefunden.'}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder={language === 'en' ? "Relationship (e.g., Ally)..." : "Beziehung (z.B. Mentor)..."}
                      value={relType}
                      onChange={(e) => setRelType(e.target.value)}
                      className="flex-1 bg-surface-base border border-line/80 rounded px-2 py-1 text-[10px] text-ink-heading outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="submit"
                      disabled={!relTargetId}
                      className="px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-mono transition disabled:opacity-50 cursor-pointer shadow-[0_0_10px_rgba(0,96,229,0.3)] font-semibold"
                    >
                      {language === 'en' ? 'Connect' : 'Verbinden'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Template Appliers */}
              <div>
                <span className="block text-[10px] font-mono font-bold tracking-wider text-ink-secondary uppercase mb-2 border-b border-line/80 pb-1">
                  {language === 'en' ? 'TEMPLATES' : 'MUSTER-VORLAGEN'}
                </span>
                <div className="flex flex-col gap-1.5">
                  {currentTemplates
                    .filter(t => t.type === entity.type || t.type === 'lore')
                    .sort((a, b) => {
                      if (a.type === entity.type && b.type !== entity.type) return -1;
                      if (a.type !== entity.type && b.type === entity.type) return 1;
                      return 0;
                    })
                    .map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleApplyTemplate(t.id)}
                      className="w-full text-left p-1.5 bg-surface-control/50 hover:bg-surface-base rounded border border-line text-[10px] font-mono text-ink flex items-center justify-between cursor-pointer"
                    >
                      <span>{t.name}</span>
                      <Plus className="h-3 w-3 text-indigo-400" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            )}

            {/* Markdown Text Editor Area */}
            {(editorViewMode === 'split' || editorViewMode === 'prose') && (
              <div className={`flex flex-col bg-surface-base relative h-full min-h-0 overflow-y-auto p-3 sm:p-4 md:p-6 custom-scrollbar ${
                editorViewMode === 'prose' ? 'w-full items-center justify-start' : 'flex-1 w-full items-center justify-start'
              }`}>
                {/* A4 Page layout wrapper */}
                <div className={`w-full bg-surface-card border border-line/80 rounded-xl shadow-2xl flex flex-col min-h-0 ${
                  editorViewMode === 'prose'
                    ? 'max-w-[800px] aspect-[1/1.414] min-h-[850px] md:min-h-[1130px] p-6 md:p-10 my-2'
                    : 'max-w-[850px] h-full min-h-[500px] md:min-h-[700px] my-1 p-2 sm:p-3'
                }`}>
                  <MarkdownTextEditor
                    ref={markdownEditorRef}
                    value={entity.content}
                    onChange={handleTextChange}
                    language={language}
                    entities={entities}
                    currentEntityId={entity.id}
                    onAddEntity={onAddEntity}
                    onSelectEntity={onSelectEntity}
                    looseMedia={looseMedia}
                    onAddLooseMedia={onAddLooseMedia}
                    onUploadImageFile={(file) => setUploadModalFile(file)}
                    placeholder={
                      language === 'en'
                        ? `# ${entity.title}\n\nBegin weaving your story here...`
                        : `# ${entity.title}\n\nBeginne hier deine Geschichte zu weben...`
                    }
                    missingManuscriptHeaderNotice={['scene', 'chapter'].includes(entity.type) && !(/(?:^|\n)#+\s*(?:manuskript|manuscript)\b/i.test(entity.content || ''))}
                    onInsertManuscriptHeader={handleInsertManuscriptHeader}
                    className="h-full border-none rounded-none"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <EntityDetailView
            entity={entity}
            entities={entities}
            looseMedia={looseMedia}
            language={language}
            onSelectEntity={onSelectEntity}
            onAddEntity={onAddEntity}
            onEnlargeImage={(url, idx) => {
              setEnlargedImageIndex(idx || 0);
              setEnlargedImageUrl(url);
            }}
            onOpenMapModal={(readOnly) => {
              setMapModalReadOnly(readOnly);
              setIsMapModalOpen(true);
            }}
            onContentChange={handleTextChange}
          />
        )}
      </div>

      </div>
      </div>

      {pendingTemplateId && (
        <BaseModal
          isOpen={!!pendingTemplateId}
          onClose={() => setPendingTemplateId(null)}
          icon={<Bot className="h-4 w-4" />}
          title={language === 'en' ? 'Apply Template?' : 'Vorlage anwenden?'}
          maxWidth="sm"
          footer={
            <>
              <button
                onClick={() => setPendingTemplateId(null)}
                className="px-3 py-1.5 bg-surface-control hover:bg-surface-hover text-ink-secondary hover:text-ink-heading border border-line rounded text-xs font-mono transition cursor-pointer"
              >
                {language === 'en' ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                onClick={() => {
                  const template = currentTemplates.find(t => t.id === pendingTemplateId) || DEFAULT_TEMPLATES.find(t => t.id === pendingTemplateId);
                  if (template) {
                    setAutosaveStatus('saving');

                    // Intelligent, non-destructive content merge
                    const current = entity.content || '';
                    const title = entity.title || '';
                    const templateContent = template.defaultContent || '';
                    
                    let mergedContent = current;
                    const isPlaceholder = current.trim() === '' || 
                                          current.trim() === `## ${title}` ||
                                          current.includes('Hier eine fesselnde Beschreibung verfassen...') ||
                                          current.includes('Verfasse hier Details für diesen neu geschmiedeten Wissenseintrag.') ||
                                          current.includes('Write a captivating description here...') ||
                                          current.includes('Write details here for this newly forged lore entry.');
                    
                    if (isPlaceholder) {
                      mergedContent = `## ${title}\n\n${templateContent}`;
                    } else {
                      const sections = templateContent.split(/(?=^## )/m);
                      for (const section of sections) {
                        if (!section.trim()) continue;
                        const match = section.match(/^##\s+(.+)$/m);
                        if (match) {
                           const headerTitle = match[1].trim();
                           const escapedHeader = headerTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                           const headerRegex = new RegExp(`^##\\s+${escapedHeader}`, 'mi');
                           if (!headerRegex.test(mergedContent)) {
                             mergedContent = mergedContent.trim() + '\n\n' + section.trim();
                           }
                        }
                      }
                    }

                    const today = new Date().toISOString().split('T')[0];
                    const nextFields = { ...template.defaultFields };
                    Object.entries(entity.customFields).forEach(([key, val]) => {
                      if (val !== undefined && val !== null && val.trim() !== '') {
                        nextFields[key] = val;
                      }
                    });
                    if (!nextFields.created) nextFields.created = today;
                    if (!nextFields.lastModified) nextFields.lastModified = today;

                    onUpdateEntity({
                      ...entity,
                      content: mergedContent,
                      customFields: nextFields,
                      tags: Array.from(new Set([...entity.tags, ...template.defaultTags])),
                      lastModified: Date.now(),
                    });
                    setTimeout(() => setAutosaveStatus('saved'), 600);
                  }
                  setPendingTemplateId(null);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-mono transition cursor-pointer shadow-[0_0_12px_rgba(0,96,229,0.3)] font-semibold"
              >
                {language === 'en' ? 'Apply' : 'Anwenden'}
              </button>
            </>
          }
        >
          <p className="text-[11px] font-mono text-ink-secondary leading-normal">
            {language === 'en'
              ? `Would you like to apply the template "${currentTemplates.find(t => t.id === pendingTemplateId)?.name}" to this entry? The default fields, tags, and outline will be appended to your content.`
              : `Möchtest du die Vorlage „${currentTemplates.find(t => t.id === pendingTemplateId)?.name}“ auf diesen Eintrag anwenden? Die Standard-Felder, Tags und Gliederung werden an das Ende deines Eintrags angehängt.`}
          </p>
        </BaseModal>
      )}

      {/* Media Picker Modal */}
      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelectImage={(url) => {
          if (mediaPickerTarget === 'text') {
            const filename = url.split('/').pop() || 'Bild';
            insertTextAtCursor(`\n![[${filename}]]\n`);
            setLinkNotification(
              language === 'en' ? `Inserted image "${filename}" at cursor!` : `Bild „${filename}“ an Cursor-Position eingefügt!`
            );
            setTimeout(() => setLinkNotification(null), 3000);
          } else if (mediaPickerTarget === 'gallery') {
            const currentList = entity.galleryImageUrls || [];
            if (!currentList.includes(url) && entity.imageUrl !== url) {
              onUpdateEntity({
                ...entity,
                galleryImageUrls: [...currentList, url],
                lastModified: Date.now()
              });
            }
          } else {
            onUpdateEntity(swapEntityMainImage(entity, url));
          }
        }}
        entities={entities}
        looseMedia={looseMedia}
        language={language}
      />

      {/* Fullscreen Interactive Map Modal */}
      {isMapModalOpen && entity.type === 'map' && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[1200] flex flex-col p-2 sm:p-5 overflow-hidden">
          <div className="bg-surface-card border border-line rounded-2xl w-full h-full flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-surface-card border-b border-line/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-950/80 border border-indigo-800/80 text-indigo-400">
                  <Map className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-mono font-bold text-ink-heading flex items-center gap-2">
                    {entity.title}
                    <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800/80">
                      {mapModalReadOnly ? (language === 'en' ? 'Viewer' : 'Ansicht') : (language === 'en' ? 'Editor' : 'Bearbeiten')}
                    </span>
                  </h3>
                  <p className="text-[10px] font-mono text-ink-secondary">
                    {language === 'en'
                      ? 'Interactive World Map Studio (Pan, Zoom, Markers & Links)'
                      : 'Interaktives Karten Studio (Zoomen, Ziehen, Markierungen & Verknüpfungen)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMapModalReadOnly(!mapModalReadOnly)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer border ${
                    mapModalReadOnly
                      ? 'bg-surface-control text-ink border-line hover:bg-surface-hover'
                      : 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                  }`}
                >
                  {mapModalReadOnly
                    ? (language === 'en' ? 'Switch to Edit Mode' : 'In Bearbeiten-Modus wechseln')
                    : (language === 'en' ? 'Switch to View Mode' : 'In Ansichts-Modus wechseln')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsMapModalOpen(false)}
                  className="p-2 rounded-xl bg-surface-control hover:bg-surface-hover text-ink-secondary hover:text-ink-heading border border-line transition cursor-pointer"
                  title={language === 'en' ? 'Close Modal' : 'Modal schließen'}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Full Map Editor */}
            <div className="flex-1 p-3 sm:p-4 overflow-hidden bg-surface-base">
              <MapEditor
                entity={entity}
                entities={entities}
                looseMedia={looseMedia}
                onUpdateEntity={onUpdateEntity}
                onSelectEntity={(id) => {
                  setIsMapModalOpen(false);
                  onSelectEntity(id);
                }}
                onAddEntity={onAddEntity}
                onAddLooseMedia={onAddLooseMedia}
                language={language}
                readOnly={mapModalReadOnly}
              />
            </div>
          </div>
        </div>
      )}

      {/* Revision History Modal */}
      <RevisionHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        entity={entity}
        onRestoreRevision={(restoredContent, customFields, tags) => {
          setAutosaveStatus('saving');
          onUpdateEntity({
            ...entity,
            content: restoredContent,
            customFields: customFields || entity.customFields,
            tags: tags || entity.tags,
            lastModified: Date.now(),
          });
          setTimeout(() => setAutosaveStatus('saved'), 600);
        }}
        language={language}
      />

      {/* Enlarged Image Lightbox Modal */}
      {enlargedImageUrl && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 z-[100] animate-fade-in select-none"
          onClick={() => setEnlargedImageUrl(null)}
        >
          {/* Top action bar */}
          <div 
            className="absolute top-4 right-4 flex items-center gap-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {enlargedImageUrl !== entity.imageUrl && (
              <button
                type="button"
                onClick={() => {
                  if (enlargedImageUrl) {
                    onUpdateEntity(swapEntityMainImage(entity, enlargedImageUrl));
                    setEnlargedImageIndex(0);
                  }
                }}
                className="p-2.5 bg-amber-950/90 hover:bg-amber-900 text-amber-200 border border-amber-700/80 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-mono shadow-2xl"
                title={language === 'en' ? 'Set as primary portrait' : 'Als Hauptbild übernehmen'}
              >
                <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                <span className="hidden sm:inline">{language === 'en' ? 'Set as Main' : 'Als Hauptbild'}</span>
              </button>
            )}
            <a
              href={enlargedImageUrl}
              download={`${slugify(entity.title || 'bild')}.png`}
              className="p-2.5 bg-surface-control/90 hover:bg-surface-hover text-ink hover:text-ink-heading border border-line-strong/80 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-mono shadow-2xl"
              title={language === 'en' ? 'Download Image' : 'Bild herunterladen'}
            >
              <Download className="h-4 w-4 text-indigo-400" />
              <span className="hidden sm:inline">{language === 'en' ? 'Download' : 'Herunterladen'}</span>
            </a>
            <button
              type="button"
              onClick={() => setEnlargedImageUrl(null)}
              className="p-2.5 bg-surface-control/90 hover:bg-rose-950/80 text-ink hover:text-ink-heading border border-line-strong/80 hover:border-rose-600 rounded-xl transition cursor-pointer shadow-2xl"
              title={language === 'en' ? 'Close (Esc)' : 'Schließen (Esc)'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Left Arrow Button */}
          {allLightboxImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextIdx = (enlargedImageIndex - 1 + allLightboxImages.length) % allLightboxImages.length;
                setEnlargedImageIndex(nextIdx);
                setEnlargedImageUrl(allLightboxImages[nextIdx]);
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-surface-control/90 hover:bg-surface-hover text-ink-heading border border-line-strong/80 rounded-2xl transition cursor-pointer shadow-2xl z-20 group"
              title={language === 'en' ? 'Previous Image (←)' : 'Vorheriges Bild (←)'}
            >
              <ChevronLeft className="h-6 w-6 text-ink group-hover:text-ink-heading" />
            </button>
          )}

          {/* Right Arrow Button */}
          {allLightboxImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextIdx = (enlargedImageIndex + 1) % allLightboxImages.length;
                setEnlargedImageIndex(nextIdx);
                setEnlargedImageUrl(allLightboxImages[nextIdx]);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-surface-control/90 hover:bg-surface-hover text-ink-heading border border-line-strong/80 rounded-2xl transition cursor-pointer shadow-2xl z-20 group"
              title={language === 'en' ? 'Next Image (→)' : 'Nächstes Bild (→)'}
            >
              <ChevronRight className="h-6 w-6 text-ink group-hover:text-ink-heading" />
            </button>
          )}

          {/* Center Image Display */}
          <div 
            className="relative max-w-[92vw] max-h-[85vh] flex flex-col items-center justify-center cursor-default gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={enlargedImageUrl}
              alt={entity.title}
              className="max-w-full max-h-[72vh] object-contain rounded-2xl border border-line shadow-2xl"
              referrerPolicy="no-referrer"
            />

            {/* Sub-label & Gallery Thumbnail Bar */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-mono font-bold text-ink bg-surface-base/90 border border-line/90 px-3 py-1 rounded-full shadow-lg flex items-center gap-2">
                <span>{entity.title}</span>
                {allLightboxImages.length > 1 && (
                  <span className="text-[10px] text-indigo-400 font-normal border-l border-line-strong pl-2">
                    {enlargedImageIndex + 1} / {allLightboxImages.length}
                  </span>
                )}
              </span>

              {/* Gallery Thumbnails inside Lightbox */}
              {allLightboxImages.length > 1 && (
                <div className="flex items-center justify-center gap-2 mt-1 overflow-x-auto max-w-[80vw] p-1.5 bg-surface-base/80 border border-line/80 rounded-xl backdrop-blur-md">
                  {allLightboxImages.map((imgUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setEnlargedImageIndex(idx);
                        setEnlargedImageUrl(imgUrl);
                      }}
                      className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition cursor-pointer flex-shrink-0 ${
                        idx === enlargedImageIndex
                          ? 'border-indigo-500 ring-2 ring-indigo-500/50 scale-105'
                          : 'border-line opacity-60 hover:opacity-100 hover:border-line-highlight'
                      }`}
                    >
                      <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Field Delete Warning Modal */}
      {deleteFieldConfirmKey && (() => {
        const fieldKey = deleteFieldConfirmKey;
        const fieldValue = entity.customFields[fieldKey] || '';
        const templatesForType = (DEFAULT_TEMPLATES_LOCALIZED[language] || DEFAULT_TEMPLATES).filter(t => t.type === entity.type);
        const isPresetField = templatesForType.some(t => t.defaultFields && Object.keys(t.defaultFields).includes(fieldKey));

        return (
          <div 
            className="fixed inset-0 z-[100] bg-overlay backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setDeleteFieldConfirmKey(null)}
          >
            <div 
              className="bg-surface-card border border-rose-900/60 rounded-2xl max-w-md w-full p-5 shadow-2xl flex flex-col gap-4 text-ink-heading relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Glow accent bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600" />

              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-400 shrink-0">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-mono font-bold text-ink-heading flex items-center justify-between">
                    <span>{language === 'en' ? 'Delete Attribute Field?' : 'Attribut-Feld löschen?'}</span>
                    <button
                      type="button"
                      onClick={() => setDeleteFieldConfirmKey(null)}
                      className="text-ink-muted hover:text-ink p-1 rounded-lg transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </h3>
                  <p className="text-xs font-mono text-ink mt-1 leading-relaxed">
                    {language === 'en'
                      ? `Are you sure you want to remove the field "${fieldKey}" from this dossier?`
                      : `Möchtest du das Feld „${fieldKey}“ wirklich aus diesem Dossier entfernen?`}
                  </p>
                </div>
              </div>

              {/* Highlight Banner if Preset or has value */}
              <div className="flex flex-col gap-2">
                {isPresetField && (
                  <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs font-mono flex items-start gap-2">
                    <span className="text-base shrink-0">⚠️</span>
                    <div>
                      <span className="font-bold block mb-0.5">
                        {language === 'en' ? 'Standard Template Preset Field' : 'Standard-Feld des Vorlagen-Presets'}
                      </span>
                      <span className="text-[11px] text-amber-300/80 leading-relaxed">
                        {language === 'en'
                          ? `"${fieldKey}" is part of the default template structure for ${getTypeTranslation(entity.type)}.`
                          : `„${fieldKey}“ gehört zur Standard-Struktur von ${getTypeTranslation(entity.type)}.`}
                      </span>
                    </div>
                  </div>
                )}

                {fieldValue.trim() && (
                  <div className="p-2.5 rounded-xl bg-surface-control/90 border border-line text-xs font-mono flex flex-col gap-1">
                    <span className="text-[10px] text-ink-secondary uppercase font-bold tracking-wider">
                      {language === 'en' ? 'Current Value Content:' : 'Enthaltener Inhalt:'}
                    </span>
                    <div className="text-xs text-indigo-300 italic truncate bg-surface-base px-2.5 py-1.5 rounded border border-line/60">
                      "{fieldValue}"
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/80">
                <button
                  type="button"
                  onClick={() => setDeleteFieldConfirmKey(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-surface-control hover:bg-surface-hover text-ink border border-line text-xs font-mono transition cursor-pointer"
                >
                  {language === 'en' ? 'Cancel' : 'Abbrechen'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteCustomField(fieldKey);
                    setDeleteFieldConfirmKey(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs font-mono transition cursor-pointer shadow-[0_0_12px_rgba(225,29,72,0.4)] flex items-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{language === 'en' ? 'Delete Field' : 'Feld löschen'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Unified Image Upload Modal */}
      <ImageUploadModal
        isOpen={uploadModalFile !== null || uploadModalBase64 !== undefined}
        onClose={() => {
          setUploadModalFile(null);
          setUploadModalBase64(undefined);
        }}
        file={uploadModalFile}
        base64DataUrl={uploadModalBase64}
        activeEntity={entity}
        language={language}
        onUploadComplete={handleUploadComplete}
      />
    </div>
  );
}
