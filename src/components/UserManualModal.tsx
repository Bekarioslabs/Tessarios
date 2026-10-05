/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState } from 'react';
import { BookOpen, FileText, Map, Share2, Sparkles, ChevronRight, Search, Lightbulb, PenTool, History } from 'lucide-react';
import Logo from './Logo';
import { Language } from '../utils/i18n';
import { USER_MANUAL_DATA } from '../data/userManual';
import { BaseModal } from './BaseModal';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

/**
 * Minimal formatter for manual body text: fenced ``` code blocks render as a
 * monospace block, `inline code` and **bold** render as their HTML equivalents.
 * The manual content isn't user input, so this is only ever formatting our own
 * copy — no sanitization concerns, just enough Markdown to stop showing raw
 * asterisks and backticks to the reader.
 */
function renderFormattedBody(text: string): React.ReactNode[] {
  const blocks = text.split(/```([\s\S]*?)```/g);
  return blocks.map((segment, i) => {
    // Odd indices are the captured contents of a ``` fence.
    if (i % 2 === 1) {
      return (
        <pre
          key={i}
          className="bg-surface-elevated border border-line/80 rounded-lg p-3 my-2 overflow-x-auto text-[11px] text-indigo-200 whitespace-pre"
        >
          {segment.trim()}
        </pre>
      );
    }
    const inline = segment.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return (
      <React.Fragment key={i}>
        {inline.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={j} className="font-bold text-ink-heading">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code key={j} className="text-indigo-300 bg-surface-control px-1 rounded text-[11px]">
                {part.slice(1, -1)}
              </code>
            );
          }
          return part;
        })}
      </React.Fragment>
    );
  });
}

export function UserManualModal({ isOpen, onClose, language }: UserManualModalProps) {
  const [selectedSectionId, setSelectedSectionId] = useState<string>('getting-started');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const currentSection = USER_MANUAL_DATA.find(s => s.id === selectedSectionId) || USER_MANUAL_DATA[0];

  const filteredSections = USER_MANUAL_DATA.filter(section => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const title = section.title[language].toLowerCase();
    const desc = section.description[language].toLowerCase();
    return title.includes(query) || desc.includes(query);
  });

  const renderIcon = (name: string) => {
    switch (name) {
      case 'BookOpen': return <BookOpen className="h-4 w-4 text-indigo-400" />;
      case 'PenTool': return <PenTool className="h-4 w-4 text-rose-400" />;
      case 'FileText': return <FileText className="h-4 w-4 text-emerald-400" />;
      case 'Map': return <Map className="h-4 w-4 text-amber-400" />;
      case 'History': return <History className="h-4 w-4 text-orange-400" />;
      case 'Share2': return <Share2 className="h-4 w-4 text-purple-400" />;
      case 'Sparkles': return <Sparkles className="h-4 w-4 text-cyan-400" />;
      default: return <BookOpen className="h-4 w-4 text-indigo-400" />;
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="4xl"
      height="h-[85vh]"
      zIndex="z-[100]"
      icon={<Logo size={28} showGlow={false} />}
      title={
        <div className="flex items-center gap-2">
          <span>TESSARIOS {language === 'en' ? 'User Manual' : 'Benutzerhandbuch'}</span>
          <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800/60 rounded-full font-normal">
            v1.0.0
          </span>
        </div>
      }
      subtitle={
        language === 'en'
          ? 'Complete guide to worldbuilding, Markdown shortcuts, and vault features.'
          : 'Vollständiges Handbuch für Worldbuilding, Markdown-Kürzel & Tresor-Funktionen.'
      }
      footer={
        <div className="w-full flex items-center justify-between text-xs font-mono text-ink-muted">
          <div className="flex items-center gap-2">
            <span>TESSARIOS Studio</span>
            <span>•</span>
            <span>{language === 'en' ? 'Offline-first Worldbuilding App' : 'Offline-first Worldbuilding App'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition cursor-pointer text-xs"
          >
            {language === 'en' ? 'Got it' : 'Verstanden'}
          </button>
        </div>
      }
      className="p-0"
    >
      <div className="h-full flex min-h-0">
          
          {/* Left Sidebar Navigation */}
          <div className="w-72 border-r border-line/80 bg-surface-base flex flex-col p-3 gap-3">
            
            {/* Search filter */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={language === 'en' ? 'Search manual topics...' : 'Themen suchen...'}
                className="w-full bg-surface-elevated border border-line/80 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-ink-bright placeholder-zinc-500 outline-none focus:border-indigo-600 transition"
              />
            </div>

            {/* List of sections */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
              {filteredSections.map((section) => {
                const isSelected = section.id === selectedSectionId;
                return (
                  <button
                    key={section.id}
                    onClick={() => setSelectedSectionId(section.id)}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-950/80 border border-indigo-800/80 text-ink-heading shadow-sm'
                        : 'bg-surface-control/30 hover:bg-surface-hover/50 text-ink-secondary hover:text-ink-bright border border-transparent'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {renderIcon(section.iconName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono font-semibold truncate">
                        {section.title[language]}
                      </div>
                      <div className="text-[10px] font-mono text-ink-muted line-clamp-2 mt-0.5 leading-snug">
                        {section.description[language]}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Developer Architecture Info note */}
            <div className="p-2.5 bg-surface-card border border-indigo-950 rounded-xl flex items-center justify-between text-[10px] font-mono text-ink-secondary">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span>{language === 'en' ? 'Developer Guide in repo' : 'Entwickler-Doku im Repo'}</span>
              </div>
              <span className="text-[9px] text-indigo-400 bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-800/50 font-bold">
                ARCHITECTURE.md
              </span>
            </div>
          </div>

          {/* Right Main Content Viewer */}
          <div className="flex-1 overflow-y-auto p-6 bg-surface-base flex flex-col gap-6 select-text">
            
            {/* Section Header */}
            <div className="border-b border-line/80 pb-4">
              <div className="flex items-center gap-2 text-xs font-mono text-indigo-400 font-bold uppercase tracking-wider mb-1">
                {renderIcon(currentSection.iconName)}
                <span>{language === 'en' ? 'User Manual Chapter' : 'Handbuch Kapitel'}</span>
              </div>
              <h1 className="text-xl font-mono font-bold text-ink-heading">
                {currentSection.title[language]}
              </h1>
              <p className="text-xs font-mono text-ink-secondary mt-1">
                {currentSection.description[language]}
              </p>
            </div>

            {/* Section Blocks */}
            <div className="flex flex-col gap-5">
              {currentSection.content[language].map((block, idx) => (
                <div key={idx} className="bg-surface-card border border-line/80 rounded-xl p-4 flex flex-col gap-2">
                  <h3 className="text-sm font-mono font-bold text-indigo-300 flex items-center gap-2">
                    <ChevronRight className="h-3.5 w-3.5 text-indigo-500" />
                    <span>{block.heading}</span>
                  </h3>
                  <div className="text-xs font-mono text-ink leading-relaxed whitespace-pre-line pl-5 border-l border-indigo-900/40">
                    {renderFormattedBody(block.body)}
                  </div>
                </div>
              ))}
            </div>

          </div>
      </div>
    </BaseModal>
  );
}
