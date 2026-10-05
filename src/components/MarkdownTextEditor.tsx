/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { LoreEntity, EntityType, LooseMediaAsset } from '../types';
import { Language, getTypeTranslation as i18nGetTypeTranslation } from '../utils/i18n';
import { getTypeIcon, getTypeColor } from './EntityTypeBadge';
import { WikiTextRenderer } from './WikiTextRenderer';
import {
  slugify,
  detectWikiLinkSuggestions,
  applyWikiLinkSuggestions,
  WikiLinkSuggestion
} from '../utils/markdown';
import { compressBase64Image, getImageCompressionSetting } from '../utils/image';
import { countWords } from '../utils/manuscript';
import MediaPickerModal from './MediaPickerModal';
import { BaseModal } from './BaseModal';
import {
  Type,
  Link2,
  ChevronDown,
  Table,
  FileImage,
  Zap,
  Check,
  Info,
  AlertTriangle,
  Lightbulb,
  Quote,
  CheckSquare,
  FileCode,
  Code,
  Bold,
  Italic,
  Heading,
  List,
  ListOrdered,
  Minus,
  Highlighter,
  Strikethrough,
  Plus,
  Search,
  Eye,
  Edit3,
  X,
  Sparkles,
  User,
  MapPin,
  Tag,
  Columns,
  Upload,
  Image as ImageIcon,
  Undo2,
  Redo2
} from 'lucide-react';

/** A range of the editor's text the user has selected. `start === end` means the user
 *  has only placed a caret, not selected anything. */
export interface EditorSelection {
  start: number;
  end: number;
  text: string;
}

/** Imperative handle so a parent (e.g. Editor.tsx's media picker / drag-drop upload flow,
 *  which lives outside this component and has no access to its internal textarea) can
 *  reach the real cursor position instead of blindly appending to the end.
 *
 *  `replaceRange` exists for the manuscript AI companion: rewriting the passage the
 *  author marked means writing back to exactly the offsets that were selected, not
 *  searching for the old text in the document — the same words may well occur twice. */
export interface MarkdownTextEditorHandle {
  insertAtCursor: (text: string) => void;
  getSelection: () => EditorSelection;
  replaceRange: (start: number, end: number, text: string) => void;
}

export interface MarkdownTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  language: Language;
  entities?: Record<string, LoreEntity>;
  currentEntityId?: string;
  onAddEntity?: (type: EntityType, title: string, backlinkId?: string, templateId?: string, initialImageUrl?: string, autoOpen?: boolean) => void;
  onSelectEntity?: (id: string) => void;
  looseMedia?: Record<string, LooseMediaAsset>;
  onAddLooseMedia?: (asset: LooseMediaAsset) => void;
  onUploadImageFile?: (file: File) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  textareaClassName?: string;
  viewMode?: 'write' | 'preview';
  onViewModeChange?: (mode: 'write' | 'preview') => void;
  showToolbar?: boolean;
  showStatsBar?: boolean;
  autoFocus?: boolean;
  missingManuscriptHeaderNotice?: boolean;
  onInsertManuscriptHeader?: () => void;
  /** Fires whenever the caret moves or the selection changes, so a sibling panel can
   *  react to what the author has marked without reaching into the textarea itself. */
  onSelectionChange?: (selection: EditorSelection) => void;
}

const MarkdownTextEditor = forwardRef<MarkdownTextEditorHandle, MarkdownTextEditorProps>(function MarkdownTextEditor({
  value,
  onChange,
  language,
  entities = {},
  currentEntityId,
  onAddEntity,
  onSelectEntity,
  looseMedia = {},
  onAddLooseMedia,
  onUploadImageFile,
  placeholder,
  minHeight = '300px',
  className = '',
  textareaClassName = '',
  viewMode = 'write',
  onViewModeChange,
  showToolbar = true,
  showStatsBar = true,
  autoFocus = false,
  missingManuscriptHeaderNotice = false,
  onInsertManuscriptHeader,
  onSelectionChange
}: MarkdownTextEditorProps, ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Tracks whether the sticky toolbar has detached from the top of the page, so it can
  // pick up a border and shadow while it floats over the text instead of looking like a
  // bare strip of background. Detected with a zero-height sentinel rendered just above
  // it: once the sentinel scrolls out of view, the toolbar is pinned.
  const toolbarSentinelRef = useRef<HTMLDivElement>(null);
  const [isToolbarStuck, setIsToolbarStuck] = useState<boolean>(false);

  useEffect(() => {
    const sentinel = toolbarSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsToolbarStuck(!entry.isIntersecting),
      { threshold: 1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [showToolbar]);

  // Notifications
  const [notification, setNotification] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Selection & Cursor position state
  const [selectedText, setSelectedText] = useState<string>('');
  const [cursorPos, setCursorPos] = useState<number>(0);

  // Custom Undo / Redo History Stack for Write Mode
  const historyStackRef = useRef<string[]>([value]);
  const historyIndexRef = useRef<number>(0);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const isHistoryChange = useRef<boolean>(false);
  const lastPushedValue = useRef<string>(value);

  // Keep track of current entity or initial load to reset history cleanly
  useEffect(() => {
    if (value !== lastPushedValue.current && !isHistoryChange.current) {
      historyStackRef.current = [value];
      historyIndexRef.current = 0;
      lastPushedValue.current = value;
      setCanUndo(false);
      setCanRedo(false);
    }
    isHistoryChange.current = false;
  }, [currentEntityId]);

  const pushToHistory = (newValue: string) => {
    if (newValue === lastPushedValue.current) return;
    const currentStack = historyStackRef.current.slice(0, historyIndexRef.current + 1);
    currentStack.push(newValue);
    if (currentStack.length > 100) {
      currentStack.shift();
    }
    historyStackRef.current = currentStack;
    historyIndexRef.current = currentStack.length - 1;
    lastPushedValue.current = newValue;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      const newIdx = historyIndexRef.current - 1;
      const prevText = historyStackRef.current[newIdx];
      historyIndexRef.current = newIdx;
      lastPushedValue.current = prevText;
      isHistoryChange.current = true;
      setCanUndo(newIdx > 0);
      setCanRedo(true);
      onChange(prevText);
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyStackRef.current.length - 1) {
      const newIdx = historyIndexRef.current + 1;
      const nextText = historyStackRef.current[newIdx];
      historyIndexRef.current = newIdx;
      lastPushedValue.current = nextText;
      isHistoryChange.current = true;
      setCanUndo(true);
      setCanRedo(newIdx < historyStackRef.current.length - 1);
      onChange(nextText);
    }
  };

  const readSelection = (): EditorSelection => {
    const el = textareaRef.current;
    if (!el) return { start: 0, end: 0, text: '' };
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    return { start, end, text: value.substring(start, end) };
  };

  const updateCursorPos = () => {
    if (textareaRef.current) {
      setCursorPos(textareaRef.current.selectionStart || 0);
    }
    onSelectionChange?.(readSelection());
  };

  // Helper for inserting text at cursor
  const insertTextAtCursor = (textToInsert: string) => {
    if (!textareaRef.current) {
      const newContent = value + textToInsert;
      pushToHistory(newContent);
      onChange(newContent);
      return;
    }
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    const newContent = value.substring(0, start) + textToInsert + value.substring(end);
    pushToHistory(newContent);
    onChange(newContent);

    const newCursor = start + textToInsert.length;
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 50);
  };

  /** Writes over exactly [start, end) and leaves the caret at the end of what was
   *  written, so the author can keep typing where the new passage stops. */
  const replaceRange = (start: number, end: number, text: string) => {
    const safeStart = Math.max(0, Math.min(start, value.length));
    const safeEnd = Math.max(safeStart, Math.min(end, value.length));

    const newContent = value.substring(0, safeStart) + text + value.substring(safeEnd);
    pushToHistory(newContent);
    onChange(newContent);

    const caret = safeStart + text.length;
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(caret, caret);
      }
    }, 50);
  };

  useImperativeHandle(ref, () => ({
    insertAtCursor: insertTextAtCursor,
    getSelection: readSelection,
    replaceRange,
  }));

  // Selection Formatting Helper
  const handleWrapSelection = (prefix: string, suffix: string = prefix, defaultPlaceholder: string = 'Text') => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    const selected = value.substring(start, end) || defaultPlaceholder;
    const replacement = `${prefix}${selected}${suffix}`;

    const newContent = value.substring(0, start) + replacement + value.substring(end);
    pushToHistory(newContent);
    onChange(newContent);
    setFormatDropdownOpen(false);

    const newStart = start + prefix.length;
    const newEnd = newStart + selected.length;

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newStart, newEnd);
      }
    }, 50);
  };

  /**
   * Prefixes whole lines with a list marker (bullet, number, checkbox). Unlike
   * handleWrapSelection this expands the selection to line boundaries first, because
   * markdown list markers are only meaningful at the start of a line — selecting a word
   * mid-sentence marks its line rather than replacing the word.
   *
   * `marker` may be a function so numbered lists can count up. Any existing list marker
   * on the line is stripped first, so the three buttons switch between each other cleanly
   * instead of stacking "- 1. - [ ]" prefixes.
   */
  const handleLinePrefix = (
    marker: string | ((index: number) => string),
    placeholder: string
  ) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;

    const blockStart = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
    let blockEnd = value.indexOf('\n', el.selectionEnd);
    if (blockEnd === -1) blockEnd = value.length;

    const prefixed = value
      .substring(blockStart, blockEnd)
      .split('\n')
      .map((line, i) => {
        const mark = typeof marker === 'function' ? marker(i) : marker;
        const text = line.replace(/^\s*(?:[-*]\s+\[[ xX]\]\s+|[-*]\s+|\d+\.\s+)/, '');
        return `${mark}${text.trim() ? text : placeholder}`;
      })
      .join('\n');

    const newContent = value.substring(0, blockStart) + prefixed + value.substring(blockEnd);
    pushToHistory(newContent);
    onChange(newContent);
    setFormatDropdownOpen(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(blockStart, blockStart + prefixed.length);
      }
    }, 50);
  };

  // Format Dropdown state
  const [formatDropdownOpen, setFormatDropdownOpen] = useState<boolean>(false);

  // Slash Command Menu state
  const [slashMenuOpen, setSlashMenuOpen] = useState<boolean>(false);
  const [slashQuery, setSlashQuery] = useState<string>('');

  const handleCheckSlashCommand = () => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const cursor = el.selectionStart;

    const textBeforeCursor = value.substring(0, cursor);
    const slashMatch = textBeforeCursor.match(/(?:^|\n|\s)\/([a-zA-Z0-9_-]*)$/);

    if (slashMatch) {
      setSlashQuery(slashMatch[1].toLowerCase());
      setSlashMenuOpen(true);
    } else {
      setSlashMenuOpen(false);
    }
  };

  const handleInsertSlashCommand = (insertionText: string) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const cursor = el.selectionStart;

    const textBeforeCursor = value.substring(0, cursor);
    const slashMatch = textBeforeCursor.match(/(?:^|\n|\s)\/([a-zA-Z0-9_-]*)$/);

    if (slashMatch) {
      const matchLength = slashMatch[1].length + 1; // +1 for the '/'
      const replaceStart = cursor - matchLength;
      const newContent = value.substring(0, replaceStart) + insertionText + value.substring(cursor);
      onChange(newContent);
      setSlashMenuOpen(false);

      const newCursor = replaceStart + insertionText.length;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursor, newCursor);
        }
      }, 50);
    } else {
      insertTextAtCursor(insertionText);
      setSlashMenuOpen(false);
    }
  };

  // Live WikiLink Trigger state when typing [[
  const [wikiLinkTriggerOpen, setWikiLinkTriggerOpen] = useState<boolean>(false);
  const [wikiLinkTriggerQuery, setWikiLinkTriggerQuery] = useState<string>('');
  const [wikiLinkSelectedIndex, setWikiLinkSelectedIndex] = useState<number>(0);

  const handleCheckWikiLinkTrigger = () => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const cursor = el.selectionStart;

    const textBeforeCursor = value.substring(0, cursor);
    const match = textBeforeCursor.match(/(?:^|[^!\[])\[\[([^\]\n]*)$/);

    if (match) {
      const query = match[1];
      setWikiLinkTriggerQuery(query);
      setWikiLinkTriggerOpen(true);
    } else {
      if (wikiLinkTriggerOpen) {
        setWikiLinkTriggerOpen(false);
      }
    }
  };

  const filteredEntitiesForTrigger = useMemo(() => {
    if (!wikiLinkTriggerOpen) return [];
    const q = wikiLinkTriggerQuery.trim().toLowerCase();
    const all = Object.values(entities || {}).filter(e => e.id !== currentEntityId);

    let list = all;
    if (q) {
      // Word boundary or prefix matching first to prevent random half-word suggestions
      const prefixMatches = all.filter(e => {
        const titleLower = e.title.toLowerCase();
        const words = titleLower.split(/[\s_\-\/]+/);
        return titleLower.startsWith(q) || words.some(w => w.startsWith(q));
      });

      list = prefixMatches.length > 0
        ? prefixMatches
        : all.filter(e => e.title.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));

      list.sort((a, b) => {
        const aStarts = a.title.toLowerCase().startsWith(q);
        const bStarts = b.title.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.title.localeCompare(b.title);
      });
    } else {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }

    return list.slice(0, 8);
  }, [wikiLinkTriggerOpen, wikiLinkTriggerQuery, entities, currentEntityId]);

  const triggerItems = useMemo(() => {
    const items: Array<{ id: string; title: string; entity?: LoreEntity; isCreate?: boolean }> =
      filteredEntitiesForTrigger.map((e) => ({
        id: e.id,
        title: e.title,
        entity: e
      }));

    const trimmedQ = wikiLinkTriggerQuery.trim();
    if (trimmedQ) {
      const exactMatch = filteredEntitiesForTrigger.some(
        (e) => e.title.toLowerCase() === trimmedQ.toLowerCase()
      );
      if (!exactMatch) {
        items.push({
          id: `create_${trimmedQ}`,
          title: trimmedQ,
          isCreate: true
        });
      }
    }

    return items;
  }, [filteredEntitiesForTrigger, wikiLinkTriggerQuery]);

  useEffect(() => {
    setWikiLinkSelectedIndex(0);
  }, [wikiLinkTriggerQuery]);

  const handleSelectWikiLinkTriggerItem = (item: { id: string; title: string; entity?: LoreEntity; isCreate?: boolean }) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const cursor = el.selectionStart;

    const textBeforeCursor = value.substring(0, cursor);
    const match = textBeforeCursor.match(/(?:^|[^!\[])\[\[([^\]\n]*)$/);

    if (match) {
      const fullMatchText = match[0];
      const isLeading = fullMatchText.startsWith('[[');
      const startIdx = match.index! + (isLeading ? 0 : 1);

      const replacement = `[[${item.title}]]`;
      const newContent = value.substring(0, startIdx) + replacement + value.substring(cursor);
      pushToHistory(newContent);
      onChange(newContent);

      setWikiLinkTriggerOpen(false);

      if (item.isCreate) {
        // Prompt for Category selection
        setTargetSelectionRange({ start: startIdx, end: startIdx + replacement.length });
        setNewEntityTitleInput(item.title);
        setSelectedText(item.title);
        setActiveWordLinkCategory('create');
        setWordLinkModalOpen(true);
      } else {
        showToast(
          language === 'en'
            ? `Inserted WikiLink [[${item.title}]]`
            : `WikiLink [[${item.title}]] eingefügt`
        );

        const newCursor = startIdx + replacement.length;
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(newCursor, newCursor);
          }
        }, 50);
      }
    }
  };

  // Keyboard Shortcuts Handler (Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+Shift+H, etc.)
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (wikiLinkTriggerOpen && triggerItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setWikiLinkSelectedIndex((prev) => (prev + 1) % triggerItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setWikiLinkSelectedIndex((prev) => (prev - 1 + triggerItems.length) % triggerItems.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selectedItem = triggerItems[wikiLinkSelectedIndex] || triggerItems[0];
        if (selectedItem) {
          handleSelectWikiLinkTriggerItem(selectedItem);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setWikiLinkTriggerOpen(false);
        return;
      }
    }
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (mod) {
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      } else if (key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      } else if (key === 'b') {
        e.preventDefault();
        handleWrapSelection('**', '**', language === 'en' ? 'bold' : 'fett');
      } else if (key === 'i') {
        e.preventDefault();
        handleWrapSelection('*', '*', language === 'en' ? 'italic' : 'kursiv');
      } else if (key === 'k') {
        e.preventDefault();
        handleOpenWordLinkModal();
      } else if (key === 'h' && e.shiftKey) {
        e.preventDefault();
        handleWrapSelection('==', '==', language === 'en' ? 'highlight' : 'hervorgehoben');
      } else if (key === 'x' && e.shiftKey) {
        e.preventDefault();
        handleWrapSelection('~~', '~~', language === 'en' ? 'strikethrough' : 'durchgestrichen');
      } else if (key === 'c' && e.shiftKey) {
        e.preventDefault();
        handleWrapSelection('`', '`', 'code');
      }
    }
  };

  // 1. Word Link Modal state
  const [wordLinkModalOpen, setWordLinkModalOpen] = useState<boolean>(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState<string>('');
  const [newEntityTitleInput, setNewEntityTitleInput] = useState<string>('');
  const [activeWordLinkCategory, setActiveWordLinkCategory] = useState<'search' | 'suggestions' | 'create'>('search');
  const [targetSelectionRange, setTargetSelectionRange] = useState<{ start: number; end: number } | null>(null);

  const getWikiLinkOrWordAtCursor = (text: string, posStart: number, posEnd: number) => {
    if (!text) {
      return { start: 0, end: 0, title: '', isWikiLink: false };
    }

    // 1. Check if posStart/posEnd is inside or touching a complete [[...]] tag
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = wikiLinkRegex.exec(text)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;
      if (matchStart > 0 && text[matchStart - 1] === '!') {
        continue; // Skip image embeds ![[...]]
      }
      if (posEnd >= matchStart && posStart <= matchEnd) {
        const rawInside = match[1];
        const targetTitle = rawInside.includes('|') ? rawInside.split('|')[0] : rawInside;
        return {
          start: matchStart,
          end: matchEnd,
          title: targetTitle.trim(),
          isWikiLink: true
        };
      }
    }

    // 2. If user highlighted a non-empty selection
    if (posStart !== posEnd) {
      const rawSel = text.substring(posStart, posEnd).trim();
      const cleanSel = rawSel.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
      return {
        start: posStart,
        end: posEnd,
        title: cleanSel,
        isWikiLink: false
      };
    }

    // 3. If cursor is collapsed on a word (e.g. at "Schu" in "Schule" or "[[Schu")
    const isWordChar = (char: string) => /[\p{L}\p{N}_-]/u.test(char);

    let wStart = posStart;
    while (wStart > 0 && isWordChar(text[wStart - 1])) {
      wStart--;
    }
    let wEnd = posEnd;
    while (wEnd < text.length && isWordChar(text[wEnd])) {
      wEnd++;
    }

    if (wStart < wEnd) {
      let actualStart = wStart;
      let actualEnd = wEnd;

      // Expand to capture leading [[ or trailing ]] if present
      if (actualStart >= 2 && text.substring(actualStart - 2, actualStart) === '[[') {
        actualStart -= 2;
      }
      if (actualEnd <= text.length - 2 && text.substring(actualEnd, actualEnd + 2) === ']]') {
        actualEnd += 2;
      }

      const word = text.substring(wStart, wEnd).trim();
      return {
        start: actualStart,
        end: actualEnd,
        title: word,
        isWikiLink: false
      };
    }

    return {
      start: posStart,
      end: posEnd,
      title: '',
      isWikiLink: false
    };
  };

  const handleOpenWordLinkModal = () => {
    if (!textareaRef.current) {
      setWordLinkModalOpen(true);
      return;
    }
    const posStart = textareaRef.current.selectionStart;
    const posEnd = textareaRef.current.selectionEnd;

    const detected = getWikiLinkOrWordAtCursor(value, posStart, posEnd);

    setTargetSelectionRange({ start: detected.start, end: detected.end });
    setSelectedText(detected.title);
    setNewEntityTitleInput(detected.title);
    setLinkSearchQuery(detected.title);
    setActiveWordLinkCategory(detected.title ? 'create' : 'search');
    setWordLinkModalOpen(true);
  };

  const handleApplyWikiLinkToEntity = (targetEntityTitle: string) => {
    const start = targetSelectionRange ? targetSelectionRange.start : (textareaRef.current?.selectionStart ?? value.length);
    const end = targetSelectionRange ? targetSelectionRange.end : (textareaRef.current?.selectionEnd ?? value.length);

    const rawSubstring = value.substring(start, end).trim();

    let replacement = '';
    if (rawSubstring.startsWith('[[')) {
      replacement = `[[${targetEntityTitle}]]`;
    } else if (rawSubstring && rawSubstring.toLowerCase() !== targetEntityTitle.toLowerCase()) {
      replacement = `[[${targetEntityTitle}|${rawSubstring}]]`;
    } else {
      replacement = `[[${targetEntityTitle}]]`;
    }

    const newContent = value.substring(0, start) + replacement + value.substring(end);
    pushToHistory(newContent);
    onChange(newContent);
    setWordLinkModalOpen(false);
    setTargetSelectionRange(null);

    showToast(
      language === 'en'
        ? `Linked to [[${targetEntityTitle}]]!`
        : `Verlinkung zu [[${targetEntityTitle}]] eingefügt!`
    );

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + replacement.length, start + replacement.length);
      }
    }, 50);
  };

  const handleCreateAndLinkNewEntity = (type: EntityType) => {
    const titleToCreate = newEntityTitleInput.trim() || selectedText.trim() || (language === 'en' ? 'New Entry' : 'Neuer Eintrag');

    // Actively create the entity in app state if onAddEntity is provided
    if (onAddEntity) {
      onAddEntity(type, titleToCreate, currentEntityId, undefined, undefined, false);
    }

    const start = targetSelectionRange ? targetSelectionRange.start : (textareaRef.current?.selectionStart ?? value.length);
    const end = targetSelectionRange ? targetSelectionRange.end : (textareaRef.current?.selectionEnd ?? value.length);

    const rawSubstring = value.substring(start, end).trim();

    let replacement = '';
    if (rawSubstring.startsWith('[[')) {
      replacement = `[[${titleToCreate}]]`;
    } else if (rawSubstring && rawSubstring.toLowerCase() !== titleToCreate.toLowerCase()) {
      replacement = `[[${titleToCreate}|${rawSubstring}]]`;
    } else {
      replacement = `[[${titleToCreate}]]`;
    }

    const newContent = value.substring(0, start) + replacement + value.substring(end);
    pushToHistory(newContent);
    onChange(newContent);

    setWordLinkModalOpen(false);
    setNewEntityTitleInput('');
    setSelectedText('');
    setTargetSelectionRange(null);

    showToast(
      language === 'en'
        ? `Created entity "${titleToCreate}" (${i18nGetTypeTranslation(type, language)}) and inserted WikiLink [[${titleToCreate}]]!`
        : `Entität „${titleToCreate}“ (${i18nGetTypeTranslation(type, language)}) erstellt & WikiLink [[${titleToCreate}]] eingefügt!`
    );

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + replacement.length, start + replacement.length);
      }
    }, 50);
  };

  // 2. Interactive Table Builder Modal state
  const [tableModalOpen, setTableModalOpen] = useState<boolean>(false);
  const [tableRowsCount, setTableRowsCount] = useState<number>(3);
  const [tableColsCount, setTableColsCount] = useState<number>(3);
  const [tableCells, setTableCells] = useState<string[][]>(() =>
    language === 'en'
      ? [
          ['Header 1', 'Header 2', 'Header 3'],
          ['Data 1', 'Data 2', 'Data 3'],
          ['Data 4', 'Data 5', 'Data 6'],
        ]
      : [
          ['Spalte 1', 'Spalte 2', 'Spalte 3'],
          ['Wert 1', 'Wert 2', 'Wert 3'],
          ['Wert 4', 'Wert 5', 'Wert 6'],
        ]
  );

  const handleUpdateTableDimensions = (newRows: number, newCols: number) => {
    const clampedRows = Math.max(2, Math.min(12, newRows));
    const clampedCols = Math.max(1, Math.min(8, newCols));

    setTableRowsCount(clampedRows);
    setTableColsCount(clampedCols);

    setTableCells(prev => {
      const updated: string[][] = [];
      for (let r = 0; r < clampedRows; r++) {
        const row: string[] = [];
        for (let c = 0; c < clampedCols; c++) {
          if (prev[r] && prev[r][c] !== undefined) {
            row.push(prev[r][c]);
          } else {
            if (r === 0) {
              row.push(language === 'en' ? `Header ${c + 1}` : `Spalte ${c + 1}`);
            } else {
              row.push(language === 'en' ? `Data ${r}.${c + 1}` : `Wert ${r}.${c + 1}`);
            }
          }
        }
        updated.push(row);
      }
      return updated;
    });
  };

  const handleTableCellChange = (r: number, c: number, val: string) => {
    setTableCells(prev => {
      const next = prev.map(row => [...row]);
      if (!next[r]) next[r] = [];
      next[r][c] = val;
      return next;
    });
  };

  const handleConfirmInsertTable = () => {
    let md = '\n\n';
    const headerRow = tableCells[0] || [];
    md += '| ' + headerRow.map(cell => cell.trim() || ' ').join(' | ') + ' |\n';
    md += '| ' + headerRow.map(() => '---').join(' | ') + ' |\n';
    for (let r = 1; r < tableRowsCount; r++) {
      const dataRow = tableCells[r] || [];
      md += '| ' + dataRow.map(cell => cell.trim() || ' ').join(' | ') + ' |\n';
    }
    md += '\n';

    insertTextAtCursor(md);
    setTableModalOpen(false);
    showToast(
      language === 'en' ? 'Custom Markdown Table inserted at cursor!' : 'Individuelle Markdown-Tabelle an Cursor-Position eingefügt!'
    );
  };

  // 3. Auto-Detect WikiLinks Modal state
  const [diffModalOpen, setDiffModalOpen] = useState<boolean>(false);
  const [wikiLinkSuggestions, setWikiLinkSuggestions] = useState<WikiLinkSuggestion[]>([]);

  const handleAutoLinkNow = () => {
    const suggestions = detectWikiLinkSuggestions(
      value,
      entities,
      currentEntityId
    );
    if (suggestions.length === 0) {
      showToast(
        language === 'en'
          ? 'No new known entity names found in text.'
          : 'Keine neuen bekannten Entitäts-Namen im Text gefunden.'
      );
      return;
    }
    setWikiLinkSuggestions(suggestions);
    setDiffModalOpen(true);
  };

  const handleToggleSuggestion = (id: string) => {
    setWikiLinkSuggestions(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const handleToggleSelectAllSuggestions = (selectAll: boolean) => {
    setWikiLinkSuggestions(prev => prev.map(s => ({ ...s, selected: selectAll })));
  };

  const handleApplyDiffSuggestions = () => {
    const { updatedContent, appliedCount } = applyWikiLinkSuggestions(
      value,
      wikiLinkSuggestions
    );
    if (appliedCount > 0 && updatedContent !== value) {
      onChange(updatedContent);
      showToast(
        language === 'en'
          ? `Applied ${appliedCount} WikiLink${appliedCount > 1 ? 's' : ''}!`
          : `${appliedCount} WikiLink-Verknüpfung${appliedCount > 1 ? 'en' : ''} übernommen!`
      );
    }
    setDiffModalOpen(false);
  };

  // 4. Media / Image Picker Modal state
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState<boolean>(false);

  // Textarea Clipboard & Drag/Drop image handlers
  const handleTextareaDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      e.preventDefault();
      if (onUploadImageFile) {
        onUploadImageFile(file);
      }
    }
  };

  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          if (onUploadImageFile) {
            onUploadImageFile(file);
          }
          break;
        }
      }
    }
  };

  // Word & Character count calculations
  const wordCount = countWords(value);
  const charCount = (value || '').length;

  return (
    // No overflow-hidden here: it would make this element the scrollport for the sticky
    // toolbar below, pinning it inside a box that scrolls away with the page. Both call
    // sites pass rounded-none and do their own clipping, so nothing is lost.
    <div className={`flex flex-col bg-surface-base border border-line/80 rounded-xl relative ${className}`}>
      {/* Sentinel for the stuck-state detection above — must stay directly before the
          toolbar and outside of it. */}
      {showToolbar && <div ref={toolbarSentinelRef} aria-hidden className="h-px shrink-0" />}

      {/* Top Toolbar — sticks to the top of the surrounding scroll area so the formatting
          controls stay reachable when writing further down a long text. Border stays
          transparent-but-present when docked so gaining the frame causes no layout shift. */}
      {showToolbar && (
        <div
          className={`sticky top-0 flex flex-wrap items-center justify-between gap-1.5 p-2 text-[10px] font-mono select-none z-20 shrink-0 border transition-[border-color,box-shadow,border-radius] duration-150 ${
            isToolbarStuck
              ? 'bg-surface-card/95 backdrop-blur-sm border-line-strong/90 rounded-lg shadow-lg shadow-black/50'
              : 'bg-surface-card border-transparent border-b-zinc-800/80'
          }`}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Undo / Redo Buttons */}
            <div className="flex items-center gap-1 bg-surface-control border border-line/90 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                className={`p-1 rounded transition cursor-pointer ${
                  canUndo ? 'text-ink-bright hover:text-ink-heading hover:bg-surface-hover' : 'text-ink-faint cursor-not-allowed opacity-40'
                }`}
                title={language === 'en' ? 'Undo (Ctrl+Z)' : 'Rückgängig (Strg+Z)'}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                className={`p-1 rounded transition cursor-pointer ${
                  canRedo ? 'text-ink-bright hover:text-ink-heading hover:bg-surface-hover' : 'text-ink-faint cursor-not-allowed opacity-40'
                }`}
                title={language === 'en' ? 'Redo (Ctrl+Y / Ctrl+Shift+Z)' : 'Wiederholen (Strg+Y / Strg+Shift+Z)'}
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* [[ ]] Link Button */}
            <button
              type="button"
              onClick={handleOpenWordLinkModal}
              className="px-2.5 py-1 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-indigo-100 border border-indigo-800/80 rounded-lg flex items-center gap-1 transition cursor-pointer font-semibold shadow-[0_0_10px_rgba(0,96,229,0.15)]"
              title={language === 'en' ? 'Open Word Link menu' : 'Wort / Entität verlinken'}
            >
              <Link2 className="h-3 w-3 text-indigo-400" />
              <span>[[ ]] Link</span>
            </button>

            {/* Einfügen & Format Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setFormatDropdownOpen(!formatDropdownOpen)}
                className="px-2.5 py-1 bg-surface-control hover:bg-surface-hover text-ink-bright hover:text-ink-heading border border-line hover:border-indigo-700/60 rounded-lg flex items-center gap-1 transition cursor-pointer font-medium"
                title={language === 'en' ? 'Insert Markdown & Formatting Tools' : 'Einfügen & Formatierungstools'}
              >
                <Type className="h-3 w-3 text-indigo-400" />
                <span>{language === 'en' ? 'Insert & Format' : 'Einfügen & Format'}</span>
                <ChevronDown className="h-2.5 w-2.5 text-ink-secondary ml-0.5" />
              </button>

              {/* Format Dropdown Popover */}
              {formatDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-72 bg-surface-base border border-line rounded-xl p-3 shadow-2xl z-50 flex flex-col gap-2.5 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-line/80 pb-1.5">
                    <span className="text-[9px] font-mono font-bold tracking-wider text-indigo-400 uppercase">
                      {language === 'en' ? 'INSERT & FORMAT' : 'EINFÜGEN & FORMATIEREN'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFormatDropdownOpen(false)}
                      className="text-ink-muted hover:text-ink-heading font-bold text-xs cursor-pointer"
                    >
                      ×
                    </button>
                  </div>

                  {/* Section 1: Inline Formats */}
                  <div>
                    <span className="block text-[8px] font-mono text-ink-muted uppercase mb-1">
                      {language === 'en' ? 'Inline Formatting' : 'Inline-Formatierung'}
                    </span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => handleWrapSelection('**', '**', language === 'en' ? 'bold' : 'fett')}
                        className="px-2 py-1 bg-surface-control hover:bg-indigo-950/60 border border-line hover:border-indigo-800/80 text-ink rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <strong className="font-bold text-ink-heading">B</strong>
                        <span>{language === 'en' ? 'Bold (**...**)' : 'Fett (**...**)'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWrapSelection('*', '*', language === 'en' ? 'italic' : 'kursiv')}
                        className="px-2 py-1 bg-surface-control hover:bg-indigo-950/60 border border-line hover:border-indigo-800/80 text-ink rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <em className="italic text-ink-bright">I</em>
                        <span>{language === 'en' ? 'Italic (*...*)' : 'Kursiv (*...*)'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWrapSelection('==', '==', language === 'en' ? 'highlighted' : 'hervorgehoben')}
                        className="px-2 py-1 bg-surface-control hover:bg-amber-950/60 border border-line hover:border-amber-800/80 text-amber-300 rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <Highlighter className="h-2.5 w-2.5 text-amber-400" />
                        <span>{language === 'en' ? 'Highlight (==)' : 'Hervorheben (==)'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWrapSelection('~~', '~~', language === 'en' ? 'strikethrough' : 'durchgestrichen')}
                        className="px-2 py-1 bg-surface-control hover:bg-surface-hover border border-line text-ink-secondary rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left line-through"
                      >
                        <Strikethrough className="h-2.5 w-2.5 text-ink-muted" />
                        <span>{language === 'en' ? 'Strikethrough (~~)' : 'Durchstreichen (~~)'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWrapSelection('`', '`', 'code')}
                        className="px-2 py-1 bg-surface-control hover:bg-surface-hover border border-line text-emerald-400 rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <Code className="h-2.5 w-2.5 text-emerald-400" />
                        <span>{language === 'en' ? 'Code (`...`)' : 'Code (`...`)'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Section 2: Callouts & Blocks */}
                  <div>
                    <span className="block text-[8px] font-mono text-ink-muted uppercase mb-1">
                      {language === 'en' ? 'Callouts & Blocks' : 'Callouts & Blöcke'}
                    </span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => insertTextAtCursor(language === 'en' ? '\n> [!note] Note\n> Enter text here...\n' : '\n> [!note] Hinweis\n> Text hier eingeben...\n')}
                        className="px-2 py-1 bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-900/60 text-indigo-200 rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <Info className="h-2.5 w-2.5 text-indigo-400" />
                        <span>{language === 'en' ? 'Note Callout' : 'Hinweis Callout'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTextAtCursor(language === 'en' ? '\n> [!warning] Warning\n> Attention...\n' : '\n> [!warning] Warnung\n> Achtung...\n')}
                        className="px-2 py-1 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-900/60 text-amber-200 rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                        <span>{language === 'en' ? 'Warning Callout' : 'Warnung Callout'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTextAtCursor(language === 'en' ? '\n> [!tip] Tip\n> Useful idea...\n' : '\n> [!tip] Tipp\n> Nützliche Idee...\n')}
                        className="px-2 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-900/60 text-emerald-200 rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <Lightbulb className="h-2.5 w-2.5 text-emerald-400" />
                        <span>{language === 'en' ? 'Tip Callout' : 'Tipp Callout'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTextAtCursor(language === 'en' ? '\n> [!quote] Quote\n> Quote text...\n' : '\n> [!quote] Zitat\n> Zitat-Text...\n')}
                        className="px-2 py-1 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-900/60 text-purple-200 rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <Quote className="h-2.5 w-2.5 text-purple-400" />
                        <span>{language === 'en' ? 'Quote Callout' : 'Zitat Callout'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLinePrefix('- ', language === 'en' ? 'List item' : 'Listenpunkt')}
                        className="px-2 py-1 bg-surface-control hover:bg-surface-hover border border-line text-ink-bright rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <List className="h-2.5 w-2.5 text-indigo-400" />
                        <span>{language === 'en' ? 'Bullet List (-)' : 'Aufzählung (-)'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLinePrefix((i) => `${i + 1}. `, language === 'en' ? 'List item' : 'Listenpunkt')}
                        className="px-2 py-1 bg-surface-control hover:bg-surface-hover border border-line text-ink-bright rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <ListOrdered className="h-2.5 w-2.5 text-indigo-400" />
                        <span>{language === 'en' ? 'Numbered List (1.)' : 'Nummerierte Liste (1.)'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLinePrefix('- [ ] ', language === 'en' ? 'New task' : 'Neue Aufgabe')}
                        className="px-2 py-1 bg-surface-control hover:bg-surface-hover border border-line text-ink-bright rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <CheckSquare className="h-2.5 w-2.5 text-indigo-400" />
                        <span>{language === 'en' ? 'Task Checkbox (- [ ])' : 'Checkbox (- [ ])'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWrapSelection('[^1]', language === 'en' ? '\n\n[^1]: Footnote explanation' : '\n\n[^1]: Erklärung der Fußnote', '')}
                        className="px-2 py-1 bg-surface-control hover:bg-surface-hover border border-line text-ink-bright rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <FileCode className="h-2.5 w-2.5 text-indigo-400" />
                        <span>{language === 'en' ? 'Footnote ([^1])' : 'Fußnote ([^1])'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => insertTextAtCursor('\n```js\n// Code...\n```\n')}
                        className="px-2 py-1 bg-surface-control hover:bg-surface-hover border border-line text-emerald-300 rounded text-[9px] font-mono flex items-center gap-1.5 cursor-pointer text-left"
                      >
                        <Code className="h-2.5 w-2.5 text-emerald-400" />
                        <span>{language === 'en' ? 'Code Block (```)' : 'Code-Block (```)'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="text-[8px] font-mono text-ink-muted pt-1 border-t border-line/60 text-center">
                    {language === 'en'
                      ? <>Tip: Type <code className="text-indigo-400 bg-surface-control px-1 rounded">/</code> or use <code className="text-indigo-400 bg-surface-control px-1 rounded">Ctrl+B</code> / <code className="text-indigo-400 bg-surface-control px-1 rounded">Ctrl+K</code>!</>
                      : <>Tipp: Tippe <code className="text-indigo-400 bg-surface-control px-1 rounded">/</code> oder nutze <code className="text-indigo-400 bg-surface-control px-1 rounded">Strg+B</code> / <code className="text-indigo-400 bg-surface-control px-1 rounded">Strg+K</code>!</>}
                  </div>
                </div>
              )}
            </div>

            {/* Markdown Table Shortcut Button */}
            <button
              type="button"
              onClick={() => {
                updateCursorPos();
                setTableModalOpen(true);
              }}
              className="px-2.5 py-1 bg-surface-control hover:bg-surface-hover text-indigo-300 hover:text-ink-heading border border-line hover:border-indigo-700/60 rounded-lg flex items-center gap-1 transition cursor-pointer font-medium"
              title={language === 'en' ? 'Open Table Builder' : 'Tabelle erstellen'}
            >
              <Table className="h-3 w-3 text-indigo-400" />
              <span>| {language === 'en' ? 'Table' : 'Tabelle'}</span>
            </button>

            {/* Insert Media / Image Button */}
            <button
              type="button"
              onClick={() => {
                updateCursorPos();
                setIsMediaPickerOpen(true);
              }}
              className="px-2.5 py-1 btn-action-indigo rounded-lg flex items-center gap-1 transition cursor-pointer font-medium"
              title={language === 'en' ? 'Insert image at cursor' : 'Bild einfügen'}
            >
              <FileImage className="h-3 w-3" />
              <span>{language === 'en' ? 'Media' : 'Bild'}</span>
            </button>

            {/* Auto Detect All Entities Button */}
            <button
              type="button"
              onClick={handleAutoLinkNow}
              className="px-2.5 py-1 bg-surface-control hover:bg-surface-hover text-amber-300 border border-line hover:border-amber-900/60 rounded-lg flex items-center gap-1 transition cursor-pointer font-semibold"
              title={language === 'en' ? 'Scan text and auto-wrap all entity names in [[WikiLinks]]' : 'Fließtext scannen & alle bekannten Entitätsnamen automatisch in [[WikiLinks]] umwandeln'}
            >
              <Zap className="h-3 w-3 text-amber-400" />
              <span>Auto-Detect</span>
            </button>
          </div>

          {/* Optional View Mode Toggles (Write / Preview) */}
          {onViewModeChange && (
            <div className="flex items-center gap-1 bg-surface-control border border-line p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => onViewModeChange('write')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                  viewMode === 'write' ? 'bg-indigo-600 text-white font-bold' : 'text-ink-secondary hover:text-ink-bright'
                }`}
              >
                {language === 'en' ? 'Write' : 'Schreiben'}
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('preview')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                  viewMode === 'preview' ? 'bg-indigo-600 text-white font-bold' : 'text-ink-secondary hover:text-ink-bright'
                }`}
              >
                {language === 'en' ? 'Read' : 'Lesen'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className="m-2 p-2 bg-indigo-950/90 border border-indigo-700/80 text-indigo-200 rounded-md text-[10px] font-mono flex items-center gap-2 animate-fade-in shadow-lg">
          <Check className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Floating Slash Command Menu */}
      {slashMenuOpen && (
        <div className="m-2 bg-surface-base border border-indigo-800/80 rounded-xl p-2 shadow-2xl z-30 animate-fade-in flex flex-col gap-1 max-h-56 overflow-y-auto">
          <div className="flex justify-between items-center px-1 pb-1 border-b border-line text-[9px] font-mono text-indigo-400 font-bold uppercase tracking-wider">
            <span>{language === 'en' ? '⚡ Quick Commands (Slash Menu)' : '⚡ Schnellauswahl (Slash Command)'}</span>
            <button type="button" onClick={() => setSlashMenuOpen(false)} className="text-ink-muted hover:text-ink-heading cursor-pointer">×</button>
          </div>
          <div className="flex flex-col gap-0.5 mt-1">
            {[
              { id: 'note', name: language === 'en' ? 'Note Callout (> [!note])' : 'Hinweis Callout (> [!note])', text: language === 'en' ? '\n> [!note] Note\n> Text...\n' : '\n> [!note] Hinweis\n> Text...\n', icon: <Info className="h-3 w-3 text-indigo-400" />, tags: ['note', 'hinweis', 'callout', 'info'] },
              { id: 'warning', name: language === 'en' ? 'Warning Callout (> [!warning])' : 'Warnung Callout (> [!warning])', text: language === 'en' ? '\n> [!warning] Warning\n> Attention...\n' : '\n> [!warning] Warnung\n> Achtung...\n', icon: <AlertTriangle className="h-3 w-3 text-amber-400" />, tags: ['warning', 'warnung', 'gefahr', 'danger'] },
              { id: 'tip', name: language === 'en' ? 'Tip Callout (> [!tip])' : 'Tipp Callout (> [!tip])', text: language === 'en' ? '\n> [!tip] Tip\n> Useful idea...\n' : '\n> [!tip] Tipp\n> Nützliche Idee...\n', icon: <Lightbulb className="h-3 w-3 text-emerald-400" />, tags: ['tip', 'tipp', 'idee'] },
              { id: 'quote', name: language === 'en' ? 'Quote Callout (> [!quote])' : 'Zitat Callout (> [!quote])', text: language === 'en' ? '\n> [!quote] Quote\n> Quote text...\n' : '\n> [!quote] Zitat\n> Zitat-Text...\n', icon: <Quote className="h-3 w-3 text-purple-400" />, tags: ['quote', 'zitat'] },
              { id: 'check', name: language === 'en' ? 'Task Checkbox (- [ ])' : 'Checkbox / Aufgabe (- [ ])', text: language === 'en' ? '\n- [ ] New task\n' : '\n- [ ] Neue Aufgabe\n', icon: <CheckSquare className="h-3 w-3 text-indigo-400" />, tags: ['check', 'aufgabe', 'todo', 'task'] },
              { id: 'bullet', name: language === 'en' ? 'Bullet List (-)' : 'Aufzählung (-)', text: language === 'en' ? '\n- List item\n' : '\n- Listenpunkt\n', icon: <List className="h-3 w-3 text-indigo-400" />, tags: ['list', 'liste', 'bullet', 'aufzaehlung'] },
              { id: 'numbered', name: language === 'en' ? 'Numbered List (1.)' : 'Nummerierte Liste (1.)', text: language === 'en' ? '\n1. List item\n' : '\n1. Listenpunkt\n', icon: <ListOrdered className="h-3 w-3 text-indigo-400" />, tags: ['list', 'liste', 'numbered', 'nummeriert', 'ordered'] },
              { id: 'footnote', name: language === 'en' ? 'Footnote ([^1])' : 'Fußnote ([^1])', text: language === 'en' ? '[^1]\n\n[^1]: Footnote explanation' : '[^1]\n\n[^1]: Erklärung der Fußnote', icon: <FileCode className="h-3 w-3 text-indigo-400" />, tags: ['footnote', 'fussnote'] },
              { id: 'code', name: language === 'en' ? 'Code Block (```)' : 'Code-Block (```)', text: '\n```js\n// Code...\n```\n', icon: <Code className="h-3 w-3 text-emerald-400" />, tags: ['code', 'block', 'js'] },
              { id: 'table', name: language === 'en' ? 'Table Builder' : 'Tabelle Generator', text: '', isModalTrigger: 'table', icon: <Table className="h-3 w-3 text-indigo-400" />, tags: ['table', 'tabelle'] },
              { id: 'media', name: language === 'en' ? 'Insert Image / Media' : 'Bild / Medium einfügen', text: '', isModalTrigger: 'media', icon: <FileImage className="h-3 w-3 text-indigo-400" />, tags: ['image', 'bild', 'media'] },
              { id: 'link', name: language === 'en' ? 'Link Selection / WikiLink' : 'Wort / Entität verlinken', text: '', isModalTrigger: 'link', icon: <Link2 className="h-3 w-3 text-indigo-400" />, tags: ['link', 'wikilink', 'verlinken'] },
            ]
            .filter(item => !slashQuery || item.tags.some(t => t.includes(slashQuery)) || item.name.toLowerCase().includes(slashQuery))
            .map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.isModalTrigger === 'table') {
                    setTableModalOpen(true);
                    setSlashMenuOpen(false);
                  } else if (item.isModalTrigger === 'media') {
                    setIsMediaPickerOpen(true);
                    setSlashMenuOpen(false);
                  } else if (item.isModalTrigger === 'link') {
                    handleOpenWordLinkModal();
                    setSlashMenuOpen(false);
                  } else {
                    handleInsertSlashCommand(item.text);
                  }
                }}
                className="px-2 py-1.5 rounded text-left text-[10px] font-mono bg-surface-control/80 hover:bg-indigo-950/60 border border-line/80 hover:border-indigo-800/80 text-ink-bright flex items-center gap-2 cursor-pointer transition"
              >
                {item.icon}
                <span className="font-semibold">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating Live WikiLink Autocomplete Popover */}
      {wikiLinkTriggerOpen && triggerItems.length > 0 && (
        <div className="m-2 bg-surface-card border border-indigo-500/70 rounded-xl p-2.5 shadow-2xl z-30 animate-fade-in flex flex-col gap-1.5 max-h-64 overflow-y-auto">
          <div className="flex justify-between items-center px-1 pb-1.5 border-b border-line/80 text-[10px] font-mono text-indigo-300 font-bold tracking-wide">
            <div className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-indigo-400" />
              <span>
                {language === 'en'
                  ? `WikiLink Suggestions for "[[${wikiLinkTriggerQuery}"`
                  : `WikiLink-Vorschläge für „[[${wikiLinkTriggerQuery}“`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-ink-muted font-normal">
              <span>↑↓ Navigieren</span>
              <span>{language === 'en' ? 'Enter / Tab to select' : 'Enter / Tab Auswählen'}</span>
              <button
                type="button"
                onClick={() => setWikiLinkTriggerOpen(false)}
                className="text-ink-muted hover:text-ink-heading cursor-pointer ml-1 font-bold text-xs"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-0.5">
            {triggerItems.map((item, idx) => {
              const isSelected = idx === wikiLinkSelectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectWikiLinkTriggerItem(item);
                  }}
                  onMouseEnter={() => setWikiLinkSelectedIndex(idx)}
                  className={`px-2.5 py-1.5 rounded-lg text-left text-xs font-mono flex items-center justify-between gap-2 cursor-pointer transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30'
                      : 'bg-surface-control/80 hover:bg-surface-hover/90 text-ink-bright border border-line/80'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                    {item.entity ? (
                      <>
                        <span className={isSelected ? 'text-white' : 'text-indigo-400'}>
                          {getTypeIcon(item.entity.type, 'h-3.5 w-3.5')}
                        </span>
                        <span className="truncate">{item.title}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded uppercase font-bold tracking-wider ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-surface-hover text-ink-secondary'
                          }`}
                        >
                          {i18nGetTypeTranslation(item.entity.type, language)}
                        </span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">
                          {language === 'en'
                            ? `+ Create new entity: "[[${item.title}]]"`
                            : `+ Neue Entität erstellen: „[[${item.title}]]“`}
                        </span>
                      </>
                    )}
                  </div>

                  {isSelected && (
                    <span className="text-[9px] opacity-80 shrink-0 font-bold bg-black/30 px-1.5 py-0.5 rounded">
                      ↵ Enter
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Text Content / Area */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        {viewMode === 'preview' ? (
          <div className={`p-4 md:p-6 overflow-y-auto font-sans text-sm text-ink-bright leading-relaxed max-w-full break-words ${textareaClassName}`}>
            <WikiTextRenderer
              content={value}
              entities={entities}
              looseMedia={looseMedia}
              onSelectEntity={onSelectEntity}
              onAddEntity={onAddEntity}
              onContentChange={(newContent) => {
                pushToHistory(newContent);
                onChange(newContent);
              }}
            />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              const val = e.target.value;
              pushToHistory(val);
              onChange(val);
              handleCheckSlashCommand();
              handleCheckWikiLinkTrigger();
            }}
            onKeyDown={handleEditorKeyDown}
            onClick={() => {
              updateCursorPos();
              handleCheckWikiLinkTrigger();
            }}
            onKeyUp={(e) => {
              updateCursorPos();
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Backspace'].includes(e.key)) {
                handleCheckWikiLinkTrigger();
              }
              handleCheckSlashCommand();
            }}
            onSelect={() => {
              updateCursorPos();
              handleCheckWikiLinkTrigger();
            }}
            onBlur={() => {
              updateCursorPos();
              setTimeout(() => {
                setSlashMenuOpen(false);
                setWikiLinkTriggerOpen(false);
              }, 250);
            }}
            onDrop={handleTextareaDrop}
            onPaste={handleTextareaPaste}
            autoFocus={autoFocus}
            style={{ minHeight }}
            className={`w-full flex-1 bg-transparent p-4 md:p-6 text-ink-heading font-mono text-xs sm:text-sm outline-none resize-none leading-relaxed select-text overflow-y-auto break-words whitespace-pre-wrap max-w-full ${textareaClassName}`}
            placeholder={placeholder || (
              language === 'en'
                ? `Begin writing here...\n- Type '/' for quick elements or use Ctrl+B, Ctrl+I, Ctrl+K\n- Drag & drop images directly into text`
                : `Schreibe hier deinen Text...\n- Tippe '/' für Schnellauswahl oder nutze Strg+B, Strg+I, Strg+K\n- Bilder per Drag & Drop oder Button direkt einfügen`
            )}
          />
        )}
      </div>

      {/* Bottom Stats Bar */}
      {showStatsBar && (
        <div className="p-2 shrink-0 border-t border-line/80 bg-surface-card flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-ink-muted select-none">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-indigo-400/90 font-semibold">
              {wordCount} {language === 'en' ? 'words' : 'Wörter'}
            </span>
            <span className="text-ink-disabled">•</span>
            <span>
              {charCount} {language === 'en' ? 'chars' : 'Zeichen'}
            </span>
            {missingManuscriptHeaderNotice && (
              <>
                <span className="text-ink-disabled">•</span>
                <span className="text-amber-400/90 flex items-center gap-1 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/50 text-[9px]">
                  <span>⚠️ {language === 'en' ? 'Missing "## Manuscript"' : '„## Manuskript“ fehlt'}</span>
                  {onInsertManuscriptHeader && (
                    <button
                      type="button"
                      onClick={onInsertManuscriptHeader}
                      className="underline hover:text-amber-200 transition font-bold ml-1 cursor-pointer"
                    >
                      {language === 'en' ? '+ Add' : '+ Einfügen'}
                    </button>
                  )}
                </span>
              </>
            )}
          </div>

          <div className="text-[9px] text-ink-faint">
            {language === 'en' ? 'Markdown enabled • [[WikiLinks]] supported' : 'Markdown aktiv • [[WikiLinks]] unterstützt'}
          </div>
        </div>
      )}

      {/* --- EMBEDDED MODALS --- */}

      {/* 1. Word Link / WikiLink Modal */}
      {wordLinkModalOpen && (
        <BaseModal
          isOpen={wordLinkModalOpen}
          onClose={() => setWordLinkModalOpen(false)}
          icon={<Link2 className="h-5 w-5" />}
          title={language === 'en' ? 'Insert WikiLink' : 'WikiLink / Verknüpfung einfügen'}
          maxWidth="lg"
        >
          <div className="flex flex-col gap-4">
            {/* Modal Tabs */}
            <div className="flex items-center gap-1 bg-surface-control p-1 rounded-xl border border-line font-mono text-xs">
              <button
                type="button"
                onClick={() => setActiveWordLinkCategory('search')}
                className={`flex-1 py-1.5 rounded-lg transition cursor-pointer font-bold ${
                  activeWordLinkCategory === 'search' ? 'bg-indigo-600 text-white shadow' : 'text-ink-secondary hover:text-ink-bright'
                }`}
              >
                {language === 'en' ? 'Search' : 'Suchen'}
              </button>
              {selectedText && (
                <button
                  type="button"
                  onClick={() => setActiveWordLinkCategory('suggestions')}
                  className={`flex-1 py-1.5 rounded-lg transition cursor-pointer font-bold ${
                    activeWordLinkCategory === 'suggestions' ? 'bg-indigo-600 text-white shadow' : 'text-ink-secondary hover:text-ink-bright'
                  }`}
                >
                  {language === 'en' ? 'Suggestions' : 'Vorschläge'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveWordLinkCategory('create')}
                className={`flex-1 py-1.5 rounded-lg transition cursor-pointer font-bold ${
                  activeWordLinkCategory === 'create' ? 'bg-indigo-600 text-white shadow' : 'text-ink-secondary hover:text-ink-bright'
                }`}
              >
                {language === 'en' ? 'Create New' : 'Neu erstellen'}
              </button>
            </div>

            {/* Tab 1: Search Existing Entities */}
            {activeWordLinkCategory === 'search' && (
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search className="h-4 w-4 text-ink-muted absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={linkSearchQuery}
                    onChange={(e) => setLinkSearchQuery(e.target.value)}
                    placeholder={language === 'en' ? 'Search entries...' : 'Entitäten suchen...'}
                    className="w-full bg-surface-control border border-line rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-ink-heading outline-none focus:border-indigo-500"
                    autoFocus
                  />
                </div>

                <div className="max-h-56 overflow-y-auto flex flex-col gap-1 pr-1">
                  {Object.values(entities)
                    .filter(e => e.id !== currentEntityId)
                    .filter(e => !linkSearchQuery || e.title.toLowerCase().includes(linkSearchQuery.toLowerCase()))
                    .map(ent => (
                      <button
                        key={ent.id}
                        type="button"
                        onClick={() => handleApplyWikiLinkToEntity(ent.title)}
                        className="p-2 rounded-xl bg-surface-card hover:bg-indigo-950/70 border border-line/80 hover:border-indigo-600/70 text-left transition cursor-pointer flex items-center justify-between text-xs font-mono group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <span className={`p-1.5 rounded-lg border flex-shrink-0 ${getTypeColor(ent.type)}`}>
                            {getTypeIcon(ent.type, "h-3.5 w-3.5")}
                          </span>
                          <div className="min-w-0">
                            <span className="block text-xs font-mono font-bold text-ink-bright group-hover:text-indigo-300 truncate">
                              {ent.title}
                            </span>
                            <span className="block text-[9px] font-mono text-ink-muted">
                              {i18nGetTypeTranslation(ent.type, language)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-mono bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 px-2 py-0.5 rounded-md font-semibold">
                            {selectedText && selectedText.toLowerCase() !== ent.title.toLowerCase()
                              ? `[[${ent.title}|${selectedText}]]`
                              : `[[${ent.title}]]`}
                          </span>
                        </div>
                      </button>
                    ))}
                  {Object.values(entities).filter(e => e.id !== currentEntityId).length === 0 && (
                    <p className="text-xs font-mono text-ink-muted italic p-3 text-center">
                      {language === 'en' ? 'No entries found.' : 'Keine Entitäten vorhanden.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Selection Suggestions */}
            {activeWordLinkCategory === 'suggestions' && selectedText && (
              <div className="flex flex-col gap-3 font-mono text-xs">
                <p className="text-ink-secondary">
                  {language === 'en' ? 'Linking selected text:' : 'Ausgewählter Text:'} <strong className="text-indigo-300 font-bold">"{selectedText}"</strong>
                </p>
                <div className="max-h-56 overflow-y-auto flex flex-col gap-1 pr-1">
                  {Object.values(entities)
                    .filter(e => e.id !== currentEntityId)
                    .filter(e => {
                      if (!selectedText) return false;
                      const st = selectedText.trim().toLowerCase();
                      if (!st || st.length < 2) return false;
                      const et = e.title.trim().toLowerCase();
                      const titleWords = et.split(/[\s_\-\/]+/);
                      return et === st || titleWords.some(w => w === st || (st.length >= 3 && w.startsWith(st)));
                    })
                    .map(ent => (
                      <button
                        key={ent.id}
                        type="button"
                        onClick={() => handleApplyWikiLinkToEntity(ent.title)}
                        className="p-2 rounded-xl bg-surface-card hover:bg-indigo-950/70 border border-line/80 hover:border-indigo-600/70 text-left transition cursor-pointer flex items-center justify-between text-xs font-mono group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <span className={`p-1.5 rounded-lg border flex-shrink-0 ${getTypeColor(ent.type)}`}>
                            {getTypeIcon(ent.type, "h-3.5 w-3.5")}
                          </span>
                          <div className="min-w-0">
                            <span className="block text-xs font-mono font-bold text-ink-bright group-hover:text-indigo-300 truncate">
                              {ent.title}
                            </span>
                            <span className="block text-[9px] font-mono text-ink-muted">
                              {i18nGetTypeTranslation(ent.type, language)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] font-mono bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 px-2 py-0.5 rounded-md font-semibold">
                            {selectedText.toLowerCase() !== ent.title.toLowerCase()
                              ? `[[${ent.title}|${selectedText}]]`
                              : `[[${ent.title}]]`}
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Tab 3: Create & Link New Entity */}
            {activeWordLinkCategory === 'create' && (
              <div className="flex flex-col gap-3 font-mono text-xs">
                <div>
                  <label className="block text-[10px] text-ink-secondary mb-1 font-bold uppercase">
                    {language === 'en' ? 'Title for new WikiLink' : 'Titel der neuen Entität'}
                  </label>
                  <input
                    type="text"
                    value={newEntityTitleInput}
                    onChange={(e) => setNewEntityTitleInput(e.target.value)}
                    placeholder={language === 'en' ? 'e.g. Master Elian' : 'z.B. Meister Elian'}
                    className="w-full bg-surface-control border border-line rounded-xl px-3 py-2 text-xs text-ink-heading outline-none focus:border-indigo-500"
                    autoFocus
                  />
                </div>

                <label className="block text-[10px] text-ink-secondary font-bold uppercase mt-1">
                  {language === 'en' ? 'Select Category / Type' : 'Kategorie wählen'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {[
                    { type: 'character' as EntityType, descDe: 'Personen & Helden', descEn: 'Characters, NPCs' },
                    { type: 'place' as EntityType, descDe: 'Orte, Städte, Welten', descEn: 'Locations, cities' },
                    { type: 'lore' as EntityType, descDe: 'Mythos, Magie, Gesetze', descEn: 'Lore, magic, rules' },
                    { type: 'item' as EntityType, descDe: 'Objekte & Artefakte', descEn: 'Items, artifacts' },
                    { type: 'organization' as EntityType, descDe: 'Fraktionen, Bündnisse', descEn: 'Factions, guilds' },
                    { type: 'power' as EntityType, descDe: 'Kräfte, Zauber, Skills', descEn: 'Spells, abilities' },
                    { type: 'book' as EntityType, descDe: 'Bücher, Bände, Werke', descEn: 'Books, works' },
                    { type: 'chapter' as EntityType, descDe: 'Kapitel', descEn: 'Chapters' },
                    { type: 'scene' as EntityType, descDe: 'Szenen, Abschnitte', descEn: 'Scenes' },
                    { type: 'storyline' as EntityType, descDe: 'Handlungsstränge', descEn: 'Storylines' },
                    { type: 'map' as EntityType, descDe: 'Karten, Regionen', descEn: 'Maps, regions' },
                    { type: 'brainstorm' as EntityType, descDe: 'Ideen & Konzepte', descEn: 'Ideas & concepts' },
                    { type: 'note' as EntityType, descDe: 'Notizen, Memos', descEn: 'Notes & memos' },
                    { type: 'relationship' as EntityType, descDe: 'Beziehungen', descEn: 'Relationships' },
                    { type: 'visual' as EntityType, descDe: 'Visuelles & Medien', descEn: 'Visuals & media' },
                  ].map((cat) => {
                    const colorClass = getTypeColor(cat.type);
                    return (
                      <button
                        key={cat.type}
                        type="button"
                        onClick={() => handleCreateAndLinkNewEntity(cat.type)}
                        className="p-2.5 rounded-xl bg-surface-card hover:bg-indigo-950/80 border border-line/80 hover:border-indigo-600/80 text-left transition cursor-pointer flex items-center gap-2.5 group"
                      >
                        <span className={`p-1.5 rounded-lg border flex-shrink-0 ${colorClass}`}>
                          {getTypeIcon(cat.type, "h-4 w-4")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="block text-xs font-mono font-bold text-ink-bright group-hover:text-indigo-300 truncate">
                            {i18nGetTypeTranslation(cat.type, language)}
                          </span>
                          <span className="block text-[9px] font-mono text-ink-muted truncate">
                            {language === 'en' ? cat.descEn : cat.descDe}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </BaseModal>
      )}

      {/* 2. Interactive Markdown Table Builder Modal */}
      {tableModalOpen && (
        <BaseModal
          isOpen={tableModalOpen}
          onClose={() => setTableModalOpen(false)}
          icon={<Table className="h-5 w-5" />}
          title={language === 'en' ? 'Markdown Table Generator' : 'Markdown-Tabelle konfigurieren'}
          maxWidth="2xl"
          footer={
            <>
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="px-4 py-2 bg-surface-control hover:bg-surface-hover text-ink-secondary rounded-xl font-bold cursor-pointer transition"
              >
                {language === 'en' ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                type="button"
                onClick={handleConfirmInsertTable}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold cursor-pointer transition shadow-md"
              >
                {language === 'en' ? 'Insert table' : 'Tabelle einfügen'}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {/* Dimension Selectors */}
            <div className="flex items-center gap-4 bg-surface-control/60 p-3 rounded-xl border border-line font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="text-ink-secondary font-bold">{language === 'en' ? 'Rows:' : 'Zeilen:'}</span>
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={tableRowsCount}
                  onChange={(e) => handleUpdateTableDimensions(parseInt(e.target.value, 10) || 2, tableColsCount)}
                  className="w-14 bg-surface-control border border-line rounded-lg px-2 py-1 text-ink-heading text-center font-bold"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-ink-secondary font-bold">{language === 'en' ? 'Columns:' : 'Spalten:'}</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={tableColsCount}
                  onChange={(e) => handleUpdateTableDimensions(tableRowsCount, parseInt(e.target.value, 10) || 1)}
                  className="w-14 bg-surface-control border border-line rounded-lg px-2 py-1 text-ink-heading text-center font-bold"
                />
              </div>
            </div>

            {/* Interactive Grid Input Matrix */}
            <div className="max-h-60 overflow-auto border border-line rounded-xl bg-surface-base p-2 flex flex-col gap-1.5">
              {Array.from({ length: tableRowsCount }).map((_, rIdx) => (
                <div key={rIdx} className="flex items-center gap-1.5">
                  {Array.from({ length: tableColsCount }).map((_, cIdx) => (
                    <input
                      key={cIdx}
                      type="text"
                      value={tableCells[rIdx]?.[cIdx] || ''}
                      onChange={(e) => handleTableCellChange(rIdx, cIdx, e.target.value)}
                      placeholder={rIdx === 0 ? `Header ${cIdx + 1}` : `Cell ${rIdx}.${cIdx + 1}`}
                      className={`flex-1 min-w-[100px] border rounded-lg px-2 py-1 text-xs font-mono outline-none transition ${
                        rIdx === 0
                          ? 'bg-indigo-950/60 border-indigo-800/80 font-bold text-indigo-200'
                          : 'bg-surface-control border-line text-ink-bright focus:border-indigo-500'
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </BaseModal>
      )}

      {/* 3. Auto-Detect WikiLinks Diff Modal */}
      {diffModalOpen && (
        <BaseModal
          isOpen={diffModalOpen}
          onClose={() => setDiffModalOpen(false)}
          icon={<Zap className="h-5 w-5" />}
          title={language === 'en' ? 'Auto-Detect WikiLinks' : 'Automatische WikiLink-Erkennung'}
          maxWidth="xl"
          footer={
            <>
              <button
                type="button"
                onClick={() => setDiffModalOpen(false)}
                className="px-4 py-2 bg-surface-control hover:bg-surface-hover text-ink-secondary rounded-xl font-bold cursor-pointer transition"
              >
                {language === 'en' ? 'Cancel' : 'Abbrechen'}
              </button>
              <button
                type="button"
                onClick={handleApplyDiffSuggestions}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold cursor-pointer transition shadow-md"
              >
                {language === 'en' ? 'Apply WikiLinks' : 'WikiLinks anwenden'} ({wikiLinkSuggestions.filter(s => s.selected).length})
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-4">

            <p className="text-xs font-mono text-ink">
              {language === 'en'
                ? `Found ${wikiLinkSuggestions.length} potential entity names in text. Select which ones to convert to WikiLinks:`
                : `${wikiLinkSuggestions.length} bekannte Entitätsnamen im Fließtext erkannt. Wähle aus, welche in [[WikiLinks]] umgewandelt werden sollen:`}
            </p>

            <div className="flex items-center justify-between font-mono text-xs text-ink-secondary">
              <button
                type="button"
                onClick={() => handleToggleSelectAllSuggestions(true)}
                className="text-indigo-400 hover:underline cursor-pointer font-bold"
              >
                {language === 'en' ? 'Select All' : 'Alle auswählen'}
              </button>
              <button
                type="button"
                onClick={() => handleToggleSelectAllSuggestions(false)}
                className="text-ink-muted hover:underline cursor-pointer"
              >
                {language === 'en' ? 'Deselect All' : 'Alle abwählen'}
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto border border-line rounded-xl p-2 flex flex-col gap-1.5 bg-surface-card">
              {wikiLinkSuggestions.map(sugg => (
                <div
                  key={sugg.id}
                  onClick={() => handleToggleSuggestion(sugg.id)}
                  className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-between text-xs font-mono ${
                    sugg.selected
                      ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
                      : 'bg-surface-control/60 border-line/80 text-ink-secondary opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={sugg.selected}
                      onChange={() => handleToggleSuggestion(sugg.id)}
                      className="accent-amber-500 cursor-pointer"
                    />
                    <span className="font-bold">{sugg.matchText}</span>
                    <span className="text-[10px] text-ink-muted">→ [[{sugg.entityTitle}]]</span>
                  </div>
                  {sugg.entityType && (
                    <span className="text-[10px] text-ink-muted font-mono">
                      {i18nGetTypeTranslation(sugg.entityType, language)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </BaseModal>
      )}

      {/* 4. Media Picker Modal */}
      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelectImage={(url) => {
          const filename = url.split('/').pop() || 'Bild';
          insertTextAtCursor(`\n![[${filename}]]\n`);
          setIsMediaPickerOpen(false);
        }}
        entities={entities}
        looseMedia={looseMedia}
        language={language}
      />
    </div>
  );
});

export default MarkdownTextEditor;
