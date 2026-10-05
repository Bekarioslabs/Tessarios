/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import { History, RotateCcw, Clock, FileText, Check, Trash2, ArrowLeftRight, Eye, Camera } from 'lucide-react';
import { LoreEntity } from '../types';
import { Language } from '../utils/i18n';
import { EntityBackupSnapshot, getEntityBackups, deleteEntityBackup, createEntityBackupSnapshot } from '../utils/vaultManager';
import { getStorage } from '../utils/storage';
import { BaseModal } from './BaseModal';

function noteLabel(noteTag: string | undefined, language: Language): string {
  switch (noteTag) {
    case 'deleted': return language === 'en' ? 'Before Deletion' : 'Vor Löschung';
    case 'manual': return language === 'en' ? 'Manual Snapshot' : 'Manueller Schnappschuss';
    case 'restore': return language === 'en' ? 'Before Restore' : 'Vor Wiederherstellung';
    default: return 'Auto-Save';
  }
}

interface RevisionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: LoreEntity | null;
  onRestoreRevision: (restoredContent: string, customFields?: Record<string, string>, tags?: string[]) => void;
  language: Language;
}

export function RevisionHistoryModal({
  isOpen,
  onClose,
  entity,
  onRestoreRevision,
  language,
}: RevisionHistoryModalProps) {
  const [revisions, setRevisions] = useState<EntityBackupSnapshot[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<EntityBackupSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [restoreSuccess, setRestoreSuccess] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'preview' | 'diff'>('preview');

  useEffect(() => {
    if (isOpen && entity) {
      loadRevisions();
    }
  }, [isOpen, entity?.id]);

  const loadRevisions = async () => {
    if (!entity) return;
    setLoading(true);
    const revs = await getEntityBackups(getStorage(), entity.type, entity.id);
    setRevisions(revs);
    if (revs.length > 0) {
      setSelectedRevision(revs[0]);
    } else {
      setSelectedRevision(null);
    }
    setLoading(false);
  };

  if (!isOpen || !entity) return null;

  const handleRestore = async (rev: EntityBackupSnapshot) => {
    if (!rev || !entity) return;

    // First save a backup of current state before restoring
    await createEntityBackupSnapshot(getStorage(), entity, 'restore');

    // Perform restore callback
    onRestoreRevision(rev.content, rev.customFields, rev.tags);

    setRestoreSuccess(true);
    setTimeout(() => setRestoreSuccess(false), 2500);

    // Reload revisions list to show the new snapshot
    await loadRevisions();
  };

  const handleDelete = async (revId: string) => {
    if (!entity) return;
    await deleteEntityBackup(getStorage(), revId);
    const updated = revisions.filter((r) => r.id !== revId);
    setRevisions(updated);
    if (selectedRevision?.id === revId) {
      setSelectedRevision(updated[0] || null);
    }
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleString(language === 'de' ? 'de-DE' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getCharDiff = (revCount: number) => {
    const currentCount = (entity.content || '').length;
    const diff = revCount - currentCount;
    const unit = language === 'en' ? 'chars' : 'Zeichen';
    if (diff === 0) return `0 ${unit}`;
    return diff > 0 ? `+${diff} ${unit}` : `${diff} ${unit}`;
  };

  if (!isOpen || !entity) return null;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      height="h-[85vh]"
      icon={<History className="h-5 w-5" />}
      title={
        <div className="flex items-center gap-2">
          <span>{language === 'en' ? 'Version History & Restores' : 'Versionsverlauf & Backups'}</span>
          <span className="text-[10px] font-mono px-2 py-0.5 bg-surface-hover text-ink rounded-full border border-line-strong font-normal">
            {revisions.length} {revisions.length === 1 ? 'Version' : 'Versionen'}
          </span>
        </div>
      }
      subtitle={
        <>
          {entity.title} <span className="text-ink-faint">({entity.id})</span>
        </>
      }
      headerActions={
        restoreSuccess ? (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-mono animate-fade-in">
            <Check className="h-3.5 w-3.5" />
            <span>{language === 'en' ? 'Version restored!' : 'Version wiederhergestellt!'}</span>
          </div>
        ) : undefined
      }
      className="p-0"
    >
      <div className="h-full flex overflow-hidden">
          {/* Left Sidebar: Revisions List */}
          <div className="w-80 border-r border-line/80 bg-surface-base flex flex-col">
            <div className="p-3 border-b border-line/60 bg-surface-base flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-ink-secondary uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-indigo-400" />
                {language === 'en' ? 'Snapshots' : 'Sicherungspunkte'}
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (entity) {
                    await createEntityBackupSnapshot(getStorage(), entity, 'manual');
                    loadRevisions();
                  }
                }}
                className="text-[10px] font-mono px-2 py-1 bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-700/80 rounded-md transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                title={language === 'en' ? 'Create a snapshot of current state' : 'Schnappschuss des aktuellen Zustands jetzt erstellen'}
              >
                <Camera className="h-3 w-3" />
                <span>{language === 'en' ? '+ Snapshot' : '+ Schnappschuss'}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
              {loading ? (
                <div className="p-8 text-center text-xs font-mono text-ink-muted">
                  {language === 'en' ? 'Loading history...' : 'Lade Verlauf...'}
                </div>
              ) : revisions.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-ink-muted flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-ink-disabled stroke-1" />
                  <span>
                    {language === 'en'
                      ? 'No past snapshots yet. Revisions are created automatically when you edit.'
                      : 'Noch keine Sicherungspunkte. Versionen werden beim Bearbeiten automatisch erstellt.'}
                  </span>
                </div>
              ) : (
                revisions.map((rev, index) => {
                  const isSelected = selectedRevision?.id === rev.id;
                  return (
                    <div
                      key={rev.id}
                      onClick={() => setSelectedRevision(rev)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 relative ${
                        isSelected
                          ? 'bg-indigo-950/40 border-indigo-600/80 text-ink-heading shadow-sm'
                          : 'bg-surface-card border-line/80 hover:border-line-strong text-ink'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-bold text-ink-bright">
                          {formatDate(rev.timestamp)}
                        </span>
                        {index === 0 && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded">
                            {language === 'en' ? 'Latest' : 'Neueste'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-ink-secondary mt-0.5">
                        <span className="text-ink-muted">{noteLabel(rev.noteTag, language)}</span>
                        <span className={rev.charCount > (entity.content || '').length ? 'text-emerald-400' : 'text-ink-secondary'}>
                          {rev.charCount} {language === 'en' ? 'chars' : 'Zeichen'} ({getCharDiff(rev.charCount)})
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(rev.id);
                        }}
                        className="absolute bottom-2 right-2 p-1 text-ink-faint hover:text-rose-400 hover:bg-rose-500/10 rounded transition opacity-0 hover:opacity-100 group-hover:opacity-100"
                        title={language === 'en' ? 'Delete snapshot' : 'Sicherung löschen'}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Main Panel: Revision Details & Diff/Preview */}
          <div className="flex-1 flex flex-col bg-surface-base overflow-hidden">
            {selectedRevision ? (
              <>
                {/* Revision Header Toolbar */}
                <div className="p-4 border-b border-line bg-surface-base flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex bg-surface-control border border-line rounded-lg p-0.5 font-mono text-xs">
                      <button
                        onClick={() => setViewMode('preview')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                          viewMode === 'preview'
                            ? 'bg-surface-hover text-ink-heading font-semibold'
                            : 'text-ink-secondary hover:text-ink-bright'
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>{language === 'en' ? 'Snapshot Preview' : 'Vorschau'}</span>
                      </button>
                      <button
                        onClick={() => setViewMode('diff')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                          viewMode === 'diff'
                            ? 'bg-surface-hover text-ink-heading font-semibold'
                            : 'text-ink-secondary hover:text-ink-bright'
                        }`}
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        <span>{language === 'en' ? 'Compare with Current' : 'Vergleich mit Aktuell'}</span>
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRestore(selectedRevision)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold rounded-lg transition shadow-md shadow-indigo-950/50 cursor-pointer"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>{language === 'en' ? 'Restore This Version' : 'Diese Version wiederherstellen'}</span>
                  </button>
                </div>

                {/* Main View Area */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  {viewMode === 'preview' ? (
                    <div className="space-y-4">
                      <div className="p-3 bg-surface-card border border-line/80 rounded-xl text-xs font-mono text-ink-secondary flex items-center justify-between">
                        <span>Sicherung vom: {formatDate(selectedRevision.timestamp)}</span>
                        <span>{selectedRevision.charCount} Zeichen</span>
                      </div>

                      <div className="p-5 bg-surface-card border border-line rounded-xl font-mono text-xs text-ink-bright whitespace-pre-wrap leading-relaxed">
                        {selectedRevision.content || (
                          <span className="italic text-ink-faint">
                            {language === 'en' ? '(Empty content in this version)' : '(Leerer Inhalt in dieser Version)'}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 h-full">
                      {/* Left: Selected Revision */}
                      <div className="flex flex-col gap-2">
                        <div className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
                          <span>Sicherung ({formatDate(selectedRevision.timestamp)})</span>
                        </div>
                        <div className="flex-1 p-4 bg-surface-card border border-amber-900/40 rounded-xl font-mono text-xs text-ink whitespace-pre-wrap overflow-y-auto leading-relaxed">
                          {selectedRevision.content || '(Leer)'}
                        </div>
                      </div>

                      {/* Right: Current Live Entity Content */}
                      <div className="flex flex-col gap-2">
                        <div className="text-xs font-mono font-bold text-indigo-400 flex items-center gap-1.5">
                          <span>{language === 'en' ? 'Current Live Version' : 'Aktuelle Version'}</span>
                        </div>
                        <div className="flex-1 p-4 bg-surface-card border border-indigo-900/40 rounded-xl font-mono text-xs text-ink whitespace-pre-wrap overflow-y-auto leading-relaxed">
                          {entity.content || '(Leer)'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs font-mono text-ink-muted">
                {language === 'en'
                  ? 'Select a snapshot from the sidebar to preview or restore'
                  : 'Wähle einen Sicherungspunkt aus der linken Leiste zum Vergleichen oder Wiederherstellen'}
              </div>
            )}
          </div>
      </div>
    </BaseModal>
  );
}
