/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import { Settings, Sun, Moon, Laptop, Palette, Shield, ShieldCheck, Database, Sliders, Globe, Check, HelpCircle, Key, FileText, Link2, Zap, Code, CheckSquare, BookOpen, ExternalLink, FileImage, History, RotateCcw, Trash2, Camera, Folder, FolderPlus, FolderOpen, RefreshCw, UploadCloud, Unlink, HardDrive, AlertTriangle, Download, Archive, Plus, Cpu, Bot, Sparkles, Info } from 'lucide-react';
import Logo from './Logo';
import { Language } from '../utils/i18n';
import { LoreEntity, LooseMediaAsset } from '../types';
import { UserManualModal } from './UserManualModal';
import { getImageCompressionSetting, setImageCompressionSetting } from '../utils/image';
import { getFileBackupCount, setFileBackupCount, getOrphanRetentionDays, setOrphanRetentionDays } from '../utils/vaultManager';
import {
  CONTEXT_BUDGETS,
  ContextBudgetKey,
  getContextBudgetKey,
  setContextBudgetKey,
  estimateTokens,
  getModelContextTokens,
  setModelContextTokens,
} from '../utils/aiSettings';
import { BaseModal } from './BaseModal';

export type ThemeMode = 'dark' | 'light';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  initialTab?: 'appearance' | 'general' | 'storage' | 'ai' | 'help' | 'about';
  entities?: Record<string, LoreEntity>;
  looseMedia?: Record<string, LooseMediaAsset>;
  onRestoreVault?: (restoredEntities: Record<string, LoreEntity>) => void;
  // Local File System Vault props
  localVaultName?: string | null;
  isStorageActive?: boolean;
  autoSyncLocal?: boolean;
  onOpenLocalFolder?: () => Promise<void>;
  onCreateLocalFolder?: () => Promise<void>;
  onReloadLocalFolder?: () => Promise<void>;
  onSyncToLocalFolder?: () => Promise<void>;
  onDisconnectLocalFolder?: () => void;
  onToggleAutoSyncLocal?: (enabled: boolean) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  initialTab = 'appearance',
  entities = {},
  looseMedia,
  onRestoreVault,
  localVaultName,
  isStorageActive = false,
  autoSyncLocal = false,
  onOpenLocalFolder,
  onCreateLocalFolder,
  onReloadLocalFolder,
  onSyncToLocalFolder,
  onDisconnectLocalFolder,
  onToggleAutoSyncLocal,
}: SettingsModalProps) {
  const [thirdPartyNotices, setThirdPartyNotices] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'appearance' | 'general' | 'storage' | 'ai' | 'help' | 'about'>(initialTab);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [compressImages, setCompressImages] = useState<boolean>(getImageCompressionSetting);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);

  // Per-entry retention settings (on-disk backups double as Version History, so there is
  // only one count to configure — see EntityBackupSnapshot in vaultManager.ts)
  const [fileBackupCount, setFileBackupCountState] = useState<number>(getFileBackupCount);
  const [orphanRetentionDays, setOrphanRetentionDaysState] = useState<number>(getOrphanRetentionDays);

  const handleFileBackupCountChange = (value: number) => {
    const clamped = Math.max(1, Math.min(100, Math.round(value) || 1));
    setFileBackupCountState(clamped);
    setFileBackupCount(clamped);
  };

  const handleOrphanRetentionDaysChange = (value: number) => {
    const clamped = Math.max(1, Math.min(365, Math.round(value) || 1));
    setOrphanRetentionDaysState(clamped);
    setOrphanRetentionDays(clamped);
  };

  // Local AI Settings State
  const [aiProvider, setAiProvider] = useState<string>(() => localStorage.getItem('aiProvider') || 'lmstudio');
  const [aiBaseUrl, setAiBaseUrl] = useState<string>(() => localStorage.getItem('aiBaseUrl') || 'http://127.0.0.1:1234/v1');
  const [aiModel, setAiModel] = useState<string>(() => localStorage.getItem('aiModel') || '');
  const [contextBudgetKey, setContextBudgetKeyState] = useState<ContextBudgetKey>(() => getContextBudgetKey());
  const [modelContextTokens, setModelContextTokensState] = useState<number>(() => getModelContextTokens());
  const [isDetectingContext, setIsDetectingContext] = useState(false);
  const [contextDetectMsg, setContextDetectMsg] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);

  const fetchModels = async (provider: string, baseUrl: string) => {
    setIsLoadingModels(true);
    setModelFetchError(null);
    try {
      const globalVault = (window as any).vault;
      if (!globalVault || typeof globalVault.listAiModels !== 'function') {
        throw new Error(language === 'en' ? 'IPC bridge for AI model listing unavailable.' : 'IPC-Bridge zum Abrufen der Modelle nicht verfügbar.');
      }

      const models: string[] = await globalVault.listAiModels(provider, baseUrl);
      if (models && models.length > 0) {
        setAvailableModels(models);
        // If current model is not in fetched list, pick the first available model
        const selectedModel = models.includes(aiModel) ? aiModel : models[0];
        setAiModel(selectedModel);
        localStorage.setItem('aiModel', selectedModel);
      } else {
        setAvailableModels([]);
        setModelFetchError(language === 'en' ? 'No models returned by local AI server.' : 'Keine Modelle vom lokalen KI-Server zurückgegeben.');
      }
    } catch (err: any) {
      console.error(err);
      setAvailableModels([]);
      setModelFetchError(err.message || (language === 'en' ? 'Failed to fetch models from AI server.' : 'Verbindung zum KI-Server fehlgeschlagen.'));
    } finally {
      setIsLoadingModels(false);
    }
  };

  // The modal stays mounted (it returns null instead of unmounting when closed), so the
  // useState(initialTab) seed only ever applies once, on the very first open — this resets
  // the tab to whatever the caller asked for every time the modal actually opens again.
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen && activeTab === 'ai') {
      fetchModels(aiProvider, aiBaseUrl);
    }
  }, [isOpen, activeTab]);

  const handleProviderChange = (provider: string) => {
    setAiProvider(provider);
    localStorage.setItem('aiProvider', provider);

    let defaultUrl = aiBaseUrl;
    if (provider === 'lmstudio' && (aiBaseUrl.includes('11434') || !aiBaseUrl)) {
      defaultUrl = 'http://127.0.0.1:1234/v1';
    } else if (provider === 'ollama' && (aiBaseUrl.includes('1234') || !aiBaseUrl)) {
      defaultUrl = 'http://127.0.0.1:11434/v1';
    }

    setAiBaseUrl(defaultUrl);
    localStorage.setItem('aiBaseUrl', defaultUrl);
    fetchModels(provider, defaultUrl);
  };

  const handleBaseUrlChange = (url: string) => {
    setAiBaseUrl(url);
    localStorage.setItem('aiBaseUrl', url);
  };

  const handleModelChange = (model: string) => {
    setAiModel(model);
    localStorage.setItem('aiModel', model);
  };

  const handleContextBudgetChange = (key: ContextBudgetKey) => {
    setContextBudgetKeyState(key);
    setContextBudgetKey(key);
  };

  const handleContextLengthChange = (tokens: number) => {
    if (!Number.isFinite(tokens) || tokens <= 0) return;
    setModelContextTokensState(tokens);
    setModelContextTokens(tokens);
    setContextDetectMsg('');
  };

  /**
   * Best effort: not every server reports its loaded context length, and the field name
   * differs between them. A miss is reported plainly rather than guessing a number —
   * a wrong denominator would make the gauge lie.
   */
  const handleDetectContextLength = async () => {
    setIsDetectingContext(true);
    setContextDetectMsg('');
    try {
      const globalWindow = window as any;
      if (typeof globalWindow.vault?.aiContextLength !== 'function') {
        throw new Error('unavailable');
      }
      const detected = await globalWindow.vault.aiContextLength(aiProvider, aiBaseUrl, aiModel);
      if (typeof detected === 'number' && detected > 0) {
        handleContextLengthChange(detected);
        setContextDetectMsg(
          language === 'en'
            ? `Server reports ${detected.toLocaleString()} tokens.`
            : `Der Server meldet ${detected.toLocaleString()} Token.`
        );
      } else {
        setContextDetectMsg(
          language === 'en'
            ? 'The server does not report a context length. Please enter it by hand.'
            : 'Der Server meldet keine Kontextlänge. Bitte von Hand eintragen.'
        );
      }
    } catch {
      setContextDetectMsg(
        language === 'en'
          ? 'Could not reach the server. Please enter the value by hand.'
          : 'Server nicht erreichbar. Bitte den Wert von Hand eintragen.'
      );
    } finally {
      setIsDetectingContext(false);
    }
  };

  const handleCreateManualBackup = async () => {
    if (!entities || Object.keys(entities).length === 0) return;
    try {
      const globalWindow = window as any;
      if (globalWindow.vault && globalWindow.vault.createFullBackup) {
        await globalWindow.vault.createFullBackup();
        setBackupNotice(language === 'en' ? 'Backup saved to .tessarios/full-backups!' : 'Backup in .tessarios/full-backups/ gespeichert!');
      } else {
        setBackupNotice(language === 'en' ? 'Error: backup service unavailable.' : 'Fehler: Backup-Service nicht verfügbar.');
      }
    } catch (e) {
      console.error(e);
      setBackupNotice(language === 'en' ? 'Error creating the backup.' : 'Fehler beim Erstellen des Backups.');
    }
    setTimeout(() => setBackupNotice(null), 3000);
  };

  const handleToggleCompressImages = (enabled: boolean) => {
    setImageCompressionSetting(enabled);
    setCompressImages(enabled);
  };

  if (!isOpen) return null;

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="2xl"
        height="max-h-[85vh]"
        icon={<Logo size={24} showGlow={false} />}
        title={language === 'en' ? 'TESSARIOS Settings' : 'TESSARIOS Einstellungen'}
        subtitle={language === 'en' ? 'Manage application preferences' : 'Anwendungseinstellungen verwalten'}
        footer={
          <div className="w-full flex items-center justify-between text-[10px] font-mono text-ink-muted">
            <span>TESSARIOS v1.0.0 • Settings Engine</span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono transition cursor-pointer font-semibold shadow-[0_0_10px_rgba(0,96,229,0.3)]"
            >
              {language === 'en' ? 'Done' : 'Fertig'}
            </button>
          </div>
        }
        className="p-0"
      >
        <div className="flex-1 flex overflow-hidden min-h-[380px] h-full">
          {/* Settings Sub-Navigation */}
          <div className="w-48 bg-surface-base/80 border-r border-line/80 p-3 flex flex-col gap-1 select-none">
            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition cursor-pointer text-left ${
                activeTab === 'appearance'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-ink-secondary hover:bg-surface-hover/50 hover:text-ink-bright'
              }`}
            >
              <Palette className="h-3.5 w-3.5" />
              <span>{language === 'en' ? 'Appearance' : 'Erscheinungsbild'}</span>
            </button>

            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition cursor-pointer text-left ${
                activeTab === 'general'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-ink-secondary hover:bg-surface-hover/50 hover:text-ink-bright'
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{language === 'en' ? 'General' : 'Allgemein'}</span>
            </button>

            <button
              onClick={() => setActiveTab('storage')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition cursor-pointer text-left ${
                activeTab === 'storage'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-ink-secondary hover:bg-surface-hover/50 hover:text-ink-bright'
              }`}
            >
              <Database className="h-3.5 w-3.5" />
              <span>{language === 'en' ? 'Storage & Vault' : 'Speicher & Tresor'}</span>
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition cursor-pointer text-left ${
                activeTab === 'ai'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-ink-secondary hover:bg-surface-hover/50 hover:text-ink-bright'
              }`}
            >
              <Bot className="h-3.5 w-3.5 text-indigo-400" />
              <span>{language === 'en' ? 'Local AI' : 'Lokale KI'}</span>
            </button>

            <button
              onClick={() => setActiveTab('help')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition cursor-pointer text-left ${
                activeTab === 'help'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-ink-secondary hover:bg-surface-hover/50 hover:text-ink-bright'
              }`}
            >
              <HelpCircle className="h-3.5 w-3.5 text-indigo-400" />
              <span>{language === 'en' ? 'Help & Shortcuts' : 'Hilfe & Tastenkürzel'}</span>
            </button>

            <button
              onClick={() => setActiveTab('about')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition cursor-pointer text-left ${
                activeTab === 'about'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-ink-secondary hover:bg-surface-hover/50 hover:text-ink-bright'
              }`}
            >
              <Info className="h-3.5 w-3.5 text-indigo-400" />
              <span>{language === 'en' ? 'About & Legal' : 'Info & Rechtliches'}</span>
            </button>
          </div>

          {/* Settings Section Panel */}
          <div className="flex-1 p-5 overflow-y-auto bg-surface-card">
            {/* APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="flex flex-col gap-6">
                <div>
                  <h4 className="text-xs font-mono font-bold uppercase text-ink-heading tracking-wider flex items-center gap-2">
                    <Palette className="h-4 w-4 text-indigo-400" />
                    <span>{language === 'en' ? 'Theme & Color Mode' : 'Farbschema & Modus'}</span>
                  </h4>
                  <p className="text-[11px] font-mono text-ink-muted mt-1">
                    {language === 'en'
                      ? 'Choose your preferred visual theme for writing and world building.'
                      : 'Wähle dein bevorzugtes Erscheinungsbild für das Erstellen und Gestalten deiner Welten.'}
                  </p>
                </div>

                {/* Theme Selector Cards. The two previews are deliberately painted with
                    literal colors rather than tokens — each has to show what the *other*
                    theme looks like while you are still in the current one. */}
                <div className="grid grid-cols-2 gap-4">
                  {([
                    {
                      mode: 'dark' as ThemeMode,
                      icon: <Moon className="h-4 w-4 text-indigo-400" />,
                      label: language === 'en' ? 'Dark Mode' : 'Dunkelmodus',
                      caption: language === 'en' ? 'Classic dark cybernetic theme' : 'Klassisches dunkles Cyber-Design',
                      shell: 'bg-[#09090b] border-[#27272a]',
                      bars: ['bg-[#27272a]', 'bg-[#18181b]', 'bg-[#18181b]'],
                    },
                    {
                      mode: 'light' as ThemeMode,
                      icon: <Sun className="h-4 w-4 text-amber-500" />,
                      label: language === 'en' ? 'Light Mode' : 'Hellmodus',
                      caption: language === 'en' ? 'Bright paper theme for daylight' : 'Helles Papier-Design für Tageslicht',
                      shell: 'bg-[#eeeef0] border-[#d4d4d8]',
                      bars: ['bg-[#d4d4d8]', 'bg-[#fafafa]', 'bg-[#fafafa]'],
                    },
                  ]).map((opt) => {
                    const isActive = theme === opt.mode;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        onClick={() => onThemeChange(opt.mode)}
                        className={`relative p-4 rounded-xl border text-left flex flex-col gap-3 transition cursor-pointer ${
                          isActive
                            ? 'bg-indigo-950/30 border-indigo-500 shadow-[0_0_15px_rgba(0,96,229,0.2)]'
                            : 'bg-surface-base border-line hover:border-line-strong'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-ink-heading font-mono text-xs font-bold">
                            {opt.icon}
                            <span>{opt.label}</span>
                          </div>
                          {isActive && (
                            <div className="h-4 w-4 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                        <div className={`h-20 border rounded-lg p-2 flex flex-col gap-1.5 overflow-hidden ${opt.shell}`}>
                          <div className={`h-2.5 w-1/3 rounded ${opt.bars[0]}`} />
                          <div className={`h-2 w-full rounded ${opt.bars[1]}`} />
                          <div className={`h-2 w-4/5 rounded ${opt.bars[2]}`} />
                          <div className="h-4 w-12 bg-indigo-600/80 rounded mt-auto" />
                        </div>
                        <span className="text-[10px] font-mono text-ink-muted">{opt.caption}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="flex flex-col gap-5">
                <div>
                  <h4 className="text-xs font-mono font-bold uppercase text-ink-heading tracking-wider flex items-center gap-2">
                    <Globe className="h-4 w-4 text-indigo-400" />
                    <span>{language === 'en' ? 'Language & Region' : 'Sprache & Region'}</span>
                  </h4>
                  <p className="text-[11px] font-mono text-ink-muted mt-1">
                    {language === 'en'
                      ? 'Select your interface language for prompts and labels.'
                      : 'Wähle die Sprache für Benutzeroberfläche und Vorlagen.'}
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 bg-surface-base border border-line rounded-lg">
                  <span className="text-xs font-mono text-ink">
                    {language === 'en' ? 'Application Language' : 'Anwendungssprache'}
                  </span>
                  <div className="flex bg-surface-card rounded-lg p-0.5 border border-line">
                    <button
                      onClick={() => onLanguageChange('de')}
                      className={`px-3 py-1 rounded text-xs font-mono transition cursor-pointer ${
                        language === 'de' ? 'bg-indigo-600 text-white font-semibold' : 'text-ink-secondary hover:text-ink-heading'
                      }`}
                    >
                      Deutsch
                    </button>
                    <button
                      onClick={() => onLanguageChange('en')}
                      className={`px-3 py-1 rounded text-xs font-mono transition cursor-pointer ${
                        language === 'en' ? 'bg-indigo-600 text-white font-semibold' : 'text-ink-secondary hover:text-ink-heading'
                      }`}
                    >
                      English
                    </button>
                  </div>
                </div>

                {/* Media & Image Upload Settings */}
                <div className="pt-2">
                  <h4 className="text-xs font-mono font-bold uppercase text-ink-heading tracking-wider flex items-center gap-2">
                    <FileImage className="h-4 w-4 text-indigo-400" />
                    <span>{language === 'en' ? 'Media & Image Processing' : 'Medien & Bild-Verarbeitung'}</span>
                  </h4>
                  <p className="text-[11px] font-mono text-ink-muted mt-1">
                    {language === 'en'
                      ? 'Configure automatic image optimization and quality settings for uploads.'
                      : 'Konfiguriere automatische Bild-Optimierung und Qualitäts-Einstellungen beim Upload.'}
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 bg-surface-base border border-line rounded-lg">
                  <div className="flex flex-col gap-0.5 pr-4">
                    <span className="text-xs font-mono font-semibold text-ink-bright">
                      {language === 'en' ? 'Compress Images on Import' : 'Bilder beim Import komprimieren'}
                    </span>
                    <span className="text-[10px] font-mono text-ink-muted leading-normal">
                      {language === 'en'
                        ? 'Automatically optimizes uploaded images (max 1920px, High-Quality). Disable to keep raw uncompressed originals.'
                        : 'Optimiert hochgeladene Bilder automatisch (max. 1920px, High Quality). Deaktivieren für unkomprimierte Originale.'}
                    </span>
                  </div>

                  <button
                    onClick={() => handleToggleCompressImages(!compressImages)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer shrink-0 border ${
                      compressImages
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-surface-control text-ink-secondary border-line hover:text-ink-heading'
                    }`}
                  >
                    {compressImages
                      ? (language === 'en' ? 'Enabled (Default)' : 'Aktiviert (Standard)')
                      : (language === 'en' ? 'Disabled (Originals)' : 'Deaktiviert (Originale)')}
                  </button>
                </div>
              </div>
            )}

            {/* STORAGE TAB */}
            {activeTab === 'storage' && (
              <div className="flex flex-col gap-5">
                <div>
                  <h4 className="text-xs font-mono font-bold uppercase text-ink-heading tracking-wider flex items-center gap-2 mb-2">
                    <Database className="h-4 w-4 text-indigo-400" />
                    <span>{language === 'en' ? 'Local Vault Folder' : 'Lokaler Tresor-Ordner'}</span>
                  </h4>
                  <div className="p-4 bg-surface-base border border-line rounded-xl flex flex-col gap-4 font-mono text-xs">
                    <div className="flex flex-col gap-1 text-ink">
                      <span className="text-ink-muted font-semibold uppercase tracking-wider text-[10px]">
                        {language === 'en' ? 'Active Vault' : 'Aktiver Tresor'}
                      </span>
                      <span className="text-indigo-400 font-bold text-sm">
                        {isStorageActive && localVaultName ? localVaultName : (language === 'en' ? 'None selected' : 'Keiner ausgewählt')}
                      </span>
                      {isStorageActive && (
                        <span className="text-ink-secondary">
                          {Object.keys(entities).length} {language === 'en' ? 'entries loaded' : 'Einträge geladen'}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={onOpenLocalFolder}
                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-sm transition flex justify-center items-center gap-2"
                      >
                        <FolderOpen className="h-4 w-4" />
                        <span>{language === 'en' ? 'Select Vault Folder' : 'Tresor-Ordner auswählen'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Vault Backups & Rolling Snapshots Section */}
                <div className="pt-2 border-t border-line/80">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-xs font-mono font-bold uppercase text-ink-heading tracking-wider flex items-center gap-2">
                        <History className="h-4 w-4 text-indigo-400" />
                        <span>{language === 'en' ? 'Vault Snapshots & Backups' : 'Archiv-Sicherungen & Backups'}</span>
                      </h4>
                      <p className="text-xs text-ink-secondary max-w-md">
                        {language === 'en'
                          ? 'Automatic rolled-over ZIP backups of your entire vault are created locally in your .tessarios/full-backups folder.'
                          : 'Automatische rolled-over ZIP-Backups deines gesamten Archivs werden lokal in deinem .tessarios/full-backups Ordner abgelegt.'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-surface-hover/30 border border-line rounded-xl p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-semibold text-ink-bright flex items-center gap-2">
                        <Archive className="h-4 w-4 text-indigo-400" />
                        {language === 'en' ? 'Vault Snapshots' : 'Tresor-Backups'}
                      </h4>
                      <button
                        onClick={handleCreateManualBackup}
                        className="px-3 py-1.5 bg-surface-hover hover:bg-surface-active border border-line-strong text-ink-bright rounded-lg text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-2"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{language === 'en' ? 'Create ZIP Backup Now' : 'ZIP-Sicherung jetzt erstellen'}</span>
                      </button>
                    </div>
                  </div>

                  {backupNotice && (
                    <div className="p-2.5 mb-3 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-mono flex items-center gap-2 animate-fade-in mt-4">
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span>{backupNotice}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                  </div>
                </div>

                {/* Per-Entry Retention Settings */}
                <div className="pt-2 border-t border-line/80">
                  <h4 className="text-xs font-mono font-bold uppercase text-ink-heading tracking-wider flex items-center gap-2 mb-1">
                    <History className="h-4 w-4 text-indigo-400" />
                    <span>{language === 'en' ? 'Retention per Entry' : 'Aufbewahrung pro Eintrag'}</span>
                  </h4>
                  <p className="text-[11px] font-mono text-ink-muted mb-3">
                    {language === 'en'
                      ? 'How many checkpoints are kept per entry, and how long a deleted entry\'s backups survive.'
                      : 'Wie viele Zwischenstände pro Eintrag aufbewahrt werden, und wie lange Backups eines gelöschten Eintrags erhalten bleiben.'}
                  </p>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between p-3 bg-surface-base border border-line rounded-lg">
                      <div className="flex flex-col gap-0.5 pr-4">
                        <span className="text-xs font-mono font-semibold text-ink-bright">
                          {language === 'en' ? 'Checkpoints per entry' : 'Sicherungspunkte pro Eintrag'}
                        </span>
                        <span className="text-[10px] font-mono text-ink-muted leading-normal">
                          {language === 'en'
                            ? 'On-disk backups in .tessarios/backups/, before the oldest is overwritten. Also controls how many entries the "Version History" panel shows.'
                            : 'Backups auf der Festplatte in .tessarios/backups/, bevor der älteste überschrieben wird. Bestimmt auch, wie viele Einträge das Versionsverlauf-Fenster zeigt.'}
                        </span>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={fileBackupCount}
                        onChange={(e) => handleFileBackupCountChange(parseInt(e.target.value, 10))}
                        className="w-16 px-2 py-1.5 bg-surface-control border border-line-strong rounded-lg text-xs font-mono text-center text-ink-heading focus:outline-none focus:border-indigo-500 shrink-0"
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-surface-base border border-line rounded-lg">
                      <div className="flex flex-col gap-0.5 pr-4">
                        <span className="text-xs font-mono font-semibold text-ink-bright">
                          {language === 'en' ? 'Keep deleted entries\' backups for (days)' : 'Backups gelöschter Einträge behalten für (Tage)'}
                        </span>
                        <span className="text-[10px] font-mono text-ink-muted leading-normal">
                          {language === 'en'
                            ? 'File backups of a deleted entry are removed automatically after this many days.'
                            : 'Datei-Backups eines gelöschten Eintrags werden nach dieser Anzahl Tage automatisch entfernt.'}
                        </span>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={orphanRetentionDays}
                        onChange={(e) => handleOrphanRetentionDaysChange(parseInt(e.target.value, 10))}
                        className="w-16 px-2 py-1.5 bg-surface-control border border-line-strong rounded-lg text-xs font-mono text-center text-ink-heading focus:outline-none focus:border-indigo-500 shrink-0"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI TAB */}
            {activeTab === 'ai' && (
              <div className="flex flex-col gap-6">
                <div>
                  <h4 className="text-xs font-mono font-bold uppercase text-ink-heading tracking-wider flex items-center gap-2">
                    <Bot className="h-4 w-4 text-indigo-400" />
                    <span>{language === 'en' ? 'Local AI Integration (LM Studio / Ollama)' : 'Lokale KI-Schnittstelle (LM Studio / Ollama)'}</span>
                  </h4>
                  <p className="text-[11px] font-mono text-ink-muted mt-1">
                    {language === 'en'
                      ? 'Configure local OpenAI-compatible endpoints for privacy-focused offline AI assistance.'
                      : 'Konfiguriere lokale OpenAI-kompatible Schnittstellen für datenschutzsichere Offline-Unterstützung.'}
                  </p>
                </div>

                {/* Provider selection cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div
                    onClick={() => handleProviderChange('lmstudio')}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 ${
                      aiProvider === 'lmstudio'
                        ? 'bg-indigo-950/30 border-indigo-500 shadow-[0_0_15px_rgba(0,96,229,0.2)]'
                        : 'bg-surface-base border-line hover:border-line-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-ink-heading font-mono text-xs font-bold">
                        <Cpu className="h-4 w-4 text-indigo-400" />
                        <span>LM Studio</span>
                      </div>
                      {aiProvider === 'lmstudio' && (
                        <div className="h-4 w-4 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-ink-secondary">
                      Standard Port: 1234
                    </span>
                    <span className="text-[10px] font-mono text-ink-muted">
                      http://127.0.0.1:1234/v1
                    </span>
                  </div>

                  <div
                    onClick={() => handleProviderChange('ollama')}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 ${
                      aiProvider === 'ollama'
                        ? 'bg-indigo-950/30 border-indigo-500 shadow-[0_0_15px_rgba(0,96,229,0.2)]'
                        : 'bg-surface-base border-line hover:border-line-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-ink-heading font-mono text-xs font-bold">
                        <Bot className="h-4 w-4 text-emerald-400" />
                        <span>Ollama</span>
                      </div>
                      {aiProvider === 'ollama' && (
                        <div className="h-4 w-4 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-ink-secondary">
                      Standard Port: 11434
                    </span>
                    <span className="text-[10px] font-mono text-ink-muted">
                      http://127.0.0.1:11434/v1
                    </span>
                  </div>
                </div>

                {/* Server Endpoint URL */}
                <div className="flex flex-col gap-2 p-4 bg-surface-base border border-line rounded-xl">
                  <label className="text-xs font-mono font-semibold text-ink-bright flex items-center justify-between">
                    <span>{language === 'en' ? 'Server Endpoint Base URL' : 'Server Endpoint-Adresse (Base URL)'}</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleBaseUrlChange(aiProvider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1')}
                        className="px-2 py-0.5 bg-surface-hover hover:bg-surface-active text-[10px] font-mono text-ink rounded border border-line-strong cursor-pointer"
                      >
                        127.0.0.1 Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBaseUrlChange(aiProvider === 'ollama' ? 'http://localhost:11434/v1' : 'http://localhost:1234/v1')}
                        className="px-2 py-0.5 bg-surface-hover hover:bg-surface-active text-[10px] font-mono text-ink rounded border border-line-strong cursor-pointer"
                      >
                        localhost Standard
                      </button>
                    </div>
                  </label>
                  <input
                    type="text"
                    value={aiBaseUrl}
                    onChange={(e) => handleBaseUrlChange(e.target.value)}
                    placeholder="http://127.0.0.1:1234/v1"
                    className="w-full px-3 py-2 bg-surface-card border border-line rounded-lg text-xs font-mono text-ink-heading focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Dynamic Model Dropdown Selection (Keine manuelle Eingabe) */}
                <div className="flex flex-col gap-2 p-4 bg-surface-base border border-line rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono font-semibold text-ink-bright flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                      <span>{language === 'en' ? 'Active AI Model' : 'Aktives KI-Modell'}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => fetchModels(aiProvider, aiBaseUrl)}
                      disabled={isLoadingModels}
                      className="px-2.5 py-1 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
                      <span>{language === 'en' ? 'Refresh Models' : 'Modelle abrufen'}</span>
                    </button>
                  </div>

                  {isLoadingModels ? (
                    <div className="p-3 bg-surface-card border border-line rounded-lg text-xs font-mono text-ink-secondary flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                      <span>{language === 'en' ? 'Connecting to server and fetching available models...' : 'Verbinde mit Server und rufe geladene Modelle ab...'}</span>
                    </div>
                  ) : availableModels.length > 0 ? (
                    <select
                      value={aiModel}
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="w-full px-3 py-2.5 bg-surface-card border border-indigo-500/50 rounded-lg text-xs font-mono font-semibold text-indigo-200 focus:outline-none focus:border-indigo-400 cursor-pointer"
                    >
                      {availableModels.map((m) => (
                        <option key={m} value={m} className="bg-surface-base text-ink-heading">
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-lg text-xs font-mono text-amber-300 flex flex-col gap-1">
                      <span className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        <span>{language === 'en' ? 'No active models detected' : 'Keine geladenen Modelle erkannt'}</span>
                      </span>
                      <span className="text-[11px] text-ink-secondary leading-relaxed">
                        {modelFetchError || (language === 'en'
                          ? 'Please make sure LM Studio or Ollama is running with local server enabled.'
                          : 'Stelle sicher, dass LM Studio oder Ollama läuft und der lokale Server aktiviert ist.')}
                      </span>
                    </div>
                  )}
                </div>

                {/* How much dossier context travels with each request */}
                <div className="flex flex-col gap-2 p-4 bg-surface-base border border-line rounded-xl">
                  <label className="text-xs font-mono font-semibold text-ink-bright flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                    <span>{language === 'en' ? 'Context budget' : 'Kontext-Budget'}</span>
                  </label>
                  <p className="text-[11px] text-ink-secondary leading-relaxed">
                    {language === 'en'
                      ? 'How much linked-dossier text may travel with each request. More means the AI knows more figures at once — but every request takes longer, and a small model uses a long context less carefully. Must fit the context length configured in your server; if it does not, the server silently drops the front of the prompt.'
                      : 'Wie viel Text aus verlinkten Dossiers pro Anfrage mitgeht. Mehr heißt, die KI kennt mehr Figuren gleichzeitig — aber jede Anfrage dauert länger, und ein kleines Modell nutzt einen langen Kontext unaufmerksamer. Muss zur eingestellten Kontextlänge deines Servers passen; sonst wirft der Server stillschweigend den Anfang des Prompts weg.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {(Object.keys(CONTEXT_BUDGETS) as ContextBudgetKey[]).map((key) => {
                      const chars = CONTEXT_BUDGETS[key];
                      const labels: Record<ContextBudgetKey, { en: string; de: string }> = {
                        small: { en: 'Small', de: 'Klein' },
                        medium: { en: 'Medium', de: 'Mittel' },
                        large: { en: 'Large', de: 'Groß' },
                        huge: { en: 'Very large', de: 'Sehr groß' },
                      };
                      const isActive = contextBudgetKey === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleContextBudgetChange(key)}
                          className={`px-3 py-2 rounded-lg border text-left transition cursor-pointer ${
                            isActive
                              ? 'bg-indigo-600/25 border-indigo-500/80 text-indigo-200'
                              : 'bg-surface-card border-line text-ink-secondary hover:text-ink-heading hover:bg-surface-hover'
                          }`}
                        >
                          <span className="block text-xs font-mono font-semibold">
                            {language === 'en' ? labels[key].en : labels[key].de}
                          </span>
                          <span className="block text-[10px] font-mono text-ink-muted mt-0.5">
                            ~{estimateTokens(chars).toLocaleString()} {language === 'en' ? 'tokens' : 'Token'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] font-mono text-ink-muted mt-1">
                    {language === 'en'
                      ? 'Rule of thumb: a well-filled character dossier is around 1,700 tokens.'
                      : 'Faustregel: Ein gut gefülltes Charakterdossier sind etwa 1.700 Token.'}
                  </p>
                </div>

                {/* The denominator for the context gauge — the app cannot know it. */}
                <div className="flex flex-col gap-2 p-4 bg-surface-base border border-line rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono font-semibold text-ink-bright flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                      <span>{language === 'en' ? "Model's context length" : 'Kontextlänge des Modells'}</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleDetectContextLength}
                      disabled={isDetectingContext}
                      className="px-2.5 py-1 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${isDetectingContext ? 'animate-spin' : ''}`} />
                      <span>{language === 'en' ? 'Ask server' : 'Server fragen'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-ink-secondary leading-relaxed">
                    {language === 'en'
                      ? 'Set this to the same value you configured for the model in LM Studio or Ollama. It is only used to show how full the context is — the app cannot read it reliably, so a wrong number here makes the gauge wrong, nothing else.'
                      : 'Trage hier denselben Wert ein, den du für das Modell in LM Studio oder Ollama eingestellt hast. Er dient nur der Füllstandsanzeige — die App kann ihn nicht zuverlässig auslesen, eine falsche Zahl macht also nur den Balken falsch, sonst nichts.'}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={512}
                      step={1024}
                      value={modelContextTokens}
                      onChange={(e) => handleContextLengthChange(Number(e.target.value))}
                      className="flex-1 px-3 py-2 bg-surface-card border border-line rounded-lg text-xs font-mono text-ink-heading focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-[11px] font-mono text-ink-muted shrink-0">
                      {language === 'en' ? 'tokens' : 'Token'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[4096, 8192, 16384, 32768, 131072].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleContextLengthChange(preset)}
                        className={`px-2 py-1 rounded border text-[10px] font-mono transition cursor-pointer ${
                          modelContextTokens === preset
                            ? 'bg-indigo-600/25 border-indigo-500/80 text-indigo-200'
                            : 'bg-surface-card border-line text-ink-secondary hover:text-ink-heading hover:bg-surface-hover'
                        }`}
                      >
                        {preset >= 1024 ? `${preset / 1024}k` : preset}
                      </button>
                    ))}
                  </div>
                  {contextDetectMsg && (
                    <p className="text-[11px] font-mono text-ink-secondary">{contextDetectMsg}</p>
                  )}
                </div>
              </div>
            )}

            {/* HELP & SHORTCUTS TAB */}
            {activeTab === 'help' && (
              <div className="flex flex-col gap-5">
                {/* Full Interactive User Manual Banner */}
                <div id="user-manual-banner" className="bg-gradient-to-r from-indigo-950/80 via-[#0e0e16] to-[#09090c] border border-indigo-800/80 rounded-xl p-4 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/40 rounded-xl text-indigo-400">
                      <BookOpen className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-mono font-bold text-ink-heading flex items-center gap-2">
                        <span>{language === 'en' ? 'Interactive User Manual' : 'Interaktives Benutzerhandbuch'}</span>
                      </h4>
                      <p className="text-[11px] font-mono text-ink mt-0.5">
                        {language === 'en'
                          ? 'Complete guide covering vaults, maps, graph view, AI tools & shortcuts.'
                          : 'Vollständiges Handbuch mit Guides zu Tresoren, Karten, Beziehungs-Graph, KI & Tastenkürzeln.'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsManualOpen(true)}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-semibold transition cursor-pointer shrink-0 flex items-center gap-1.5 shadow-md hover:shadow-indigo-500/20"
                  >
                    <span>{language === 'en' ? 'Open Manual' : 'Handbuch öffnen'}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div>
                  <h4 className="text-xs font-mono font-bold uppercase text-ink-heading tracking-wider flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-indigo-400" />
                    <span>{language === 'en' ? 'Editor Keyboard Shortcuts' : 'Editor-Tastenkürzel'}</span>
                  </h4>
                  <p className="text-[11px] font-mono text-ink-muted mt-1">
                    {language === 'en'
                      ? 'The full Markdown reference and a worked example live in the manual above.'
                      : 'Die vollständige Markdown-Referenz und ein durchgerechnetes Beispiel stehen im Handbuch oben.'}
                  </p>
                </div>

                {/* Keyboard Shortcuts Table */}
                <div className="bg-surface-base border border-line rounded-xl p-3 flex flex-col gap-2">
                  <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Key className="h-3 w-3 text-indigo-400" />
                    <span>{language === 'en' ? 'Keyboard Shortcuts' : 'Tastenkürzel im Editor'}</span>
                  </span>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="flex items-center justify-between p-2 bg-surface-card border border-line/80 rounded-lg">
                      <span className="text-ink">{language === 'en' ? 'Bold' : 'Fett'}</span>
                      <kbd className="px-1.5 py-0.5 bg-surface-control border border-line-strong text-indigo-300 rounded text-[10px] font-bold">Ctrl + B</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-surface-card border border-line/80 rounded-lg">
                      <span className="text-ink">{language === 'en' ? 'Italics' : 'Kursiv'}</span>
                      <kbd className="px-1.5 py-0.5 bg-surface-control border border-line-strong text-indigo-300 rounded text-[10px] font-bold">Ctrl + I</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-surface-card border border-line/80 rounded-lg">
                      <span className="text-ink">{language === 'en' ? 'Link Selection' : 'Wort verlinken'}</span>
                      <kbd className="px-1.5 py-0.5 bg-surface-control border border-line-strong text-indigo-300 rounded text-[10px] font-bold">Ctrl + K</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-surface-card border border-line/80 rounded-lg">
                      <span className="text-ink">{language === 'en' ? 'Quick Commands' : 'Schnellmenü'}</span>
                      <kbd className="px-1.5 py-0.5 bg-surface-control border border-line-strong text-indigo-300 rounded text-[10px] font-bold">/</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-surface-card border border-line/80 rounded-lg">
                      <span className="text-ink">{language === 'en' ? 'Highlight' : 'Hervorheben'}</span>
                      <kbd className="px-1.5 py-0.5 bg-surface-control border border-line-strong text-amber-300 rounded text-[10px] font-bold">Ctrl + Shift + H</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-surface-card border border-line/80 rounded-lg">
                      <span className="text-ink">{language === 'en' ? 'Strikethrough' : 'Durchstreichen'}</span>
                      <kbd className="px-1.5 py-0.5 bg-surface-control border border-line-strong text-ink-secondary rounded text-[10px] font-bold">Ctrl + Shift + X</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-surface-card border border-line/80 rounded-lg">
                      <span className="text-ink">{language === 'en' ? 'Inline Code' : 'Inline-Code'}</span>
                      <kbd className="px-1.5 py-0.5 bg-surface-control border border-line-strong text-emerald-300 rounded text-[10px] font-bold">Ctrl + Shift + C</kbd>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-surface-card border border-line/80 rounded-lg">
                      <span className="text-ink">{language === 'en' ? 'Undo / Redo' : 'Rückgängig / Wiederholen'}</span>
                      <kbd className="px-1.5 py-0.5 bg-surface-control border border-line-strong text-ink-secondary rounded text-[10px] font-bold">Ctrl + Z / Ctrl + Shift + Z</kbd>
                    </div>
                  </div>
                </div>

                {/* WikiLinks — the one piece of syntax worth having in arm's reach here too */}
                <div className="bg-surface-base border border-line rounded-xl p-3 flex flex-col gap-2 text-xs font-mono">
                  <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Link2 className="h-3 w-3 text-indigo-400" />
                    <span>WikiLinks</span>
                  </span>
                  <div className="p-2 bg-surface-card border border-line/80 rounded-lg flex flex-col gap-1">
                    <span className="text-ink-heading">
                      <code className="text-indigo-300 bg-surface-control px-1 rounded">{language === 'en' ? '[[Title]]' : '[[Titel]]'}</code>
                    </span>
                    <span className="text-ink-secondary text-[10px]">
                      {language === 'en'
                        ? 'Links to another entry. "Auto-Detect WikiLinks" connects mentioned names automatically.'
                        : 'Verlinkt einen anderen Eintrag. „Auto-Detect WikiLinks" verlinkt erwähnte Namen automatisch.'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ABOUT & LEGAL TAB */}
            {activeTab === 'about' && (
              <div className="flex flex-col gap-5">
                <div>
                  <h4 className="text-xs font-mono font-bold uppercase text-ink-heading tracking-wider flex items-center gap-2">
                    <Info className="h-4 w-4 text-indigo-400" />
                    <span>Tessarios {__APP_VERSION__}</span>
                  </h4>
                  <p className="text-[11px] font-mono text-ink-muted mt-1">
                    {language === 'en'
                      ? 'Final version: no updates, no support. Your notes are plain Markdown files in the vault folder you chose. The AI features are beta; the app works completely without them.'
                      : 'Endgültige Version: keine Updates, kein Support. Deine Notizen sind einfache Markdown-Dateien im gewählten Tresor-Ordner. Die KI-Funktionen sind Beta; die App funktioniert vollständig ohne sie.'}
                  </p>
                </div>

                <div className="bg-surface-base border border-line rounded-xl p-3 flex flex-col gap-2 text-xs font-mono">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-indigo-400" />
                    <span>{language === 'en' ? 'Privacy' : 'Datenschutz'}</span>
                  </span>
                  <ul className="list-disc pl-4 flex flex-col gap-1 text-ink">
                    <li>
                      {language === 'en'
                        ? 'Tessarios has no account, no telemetry and no update check. It makes no network requests of its own.'
                        : 'Tessarios hat kein Konto, keine Telemetrie und keine Update-Abfrage. Die App stellt von sich aus keine Netzwerkanfragen.'}
                    </li>
                    <li>
                      {language === 'en'
                        ? 'Vault files, backups and settings stay on this computer.'
                        : 'Tresor-Dateien, Sicherungen und Einstellungen bleiben auf diesem Computer.'}
                    </li>
                    <li>
                      {language === 'en'
                        ? "The AI features send the text you work on to the address set under Local AI. By default that is a program on this computer (LM Studio or Ollama). If you enter a remote address, your text goes to that server and its operator's privacy terms apply."
                        : 'Die KI-Funktionen senden den Text, an dem du arbeitest, an die Adresse unter „Lokale KI“. Standardmäßig ist das ein Programm auf diesem Computer (LM Studio oder Ollama). Gibst du eine entfernte Adresse ein, geht dein Text an diesen Server, und dessen Datenschutzbestimmungen gelten.'}
                    </li>
                  </ul>
                </div>

                <div className="bg-surface-base border border-line rounded-xl p-3 flex flex-col gap-2 text-xs font-mono">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-indigo-400" />
                    <span>{language === 'en' ? 'Licence' : 'Lizenz'}</span>
                  </span>
                  <p className="text-ink">
                    {language === 'en'
                      ? 'Tessarios is free software under the GNU Affero General Public License, version 3 or later. © 2026 Beka Gwarliani (Bekarioslabs). It comes with no warranty. The source code is at https://github.com/Bekarioslabs/Tessarios.'
                      : 'Tessarios ist freie Software unter der GNU Affero General Public License, Version 3 oder neuer. © 2026 Beka Gwarliani (Bekarioslabs). Es gibt keine Gewährleistung. Der Quellcode liegt unter https://github.com/Bekarioslabs/Tessarios.'}
                  </p>
                </div>

                <div className="bg-surface-base border border-line rounded-xl p-3 flex flex-col gap-2 text-xs font-mono">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Code className="h-3 w-3 text-indigo-400" />
                    <span>{language === 'en' ? 'Third-party software' : 'Software von Dritten'}</span>
                  </span>
                  <p className="text-ink">
                    {language === 'en'
                      ? 'Tessarios includes open-source components (React, d3, JSZip, Lucide, the Inter and JetBrains Mono fonts, Electron and Chromium) under their own licences.'
                      : 'Tessarios enthält Open-Source-Komponenten (React, d3, JSZip, Lucide, die Schriften Inter und JetBrains Mono, Electron und Chromium) unter deren eigenen Lizenzen.'}
                  </p>
                  {thirdPartyNotices === null ? (
                    <button
                      onClick={() => {
                        import('../../THIRD_PARTY_NOTICES.md?raw')
                          .then((m) => setThirdPartyNotices(m.default))
                          .catch(() => setThirdPartyNotices(language === 'en' ? 'The licence list could not be loaded.' : 'Die Lizenzliste konnte nicht geladen werden.'));
                      }}
                      className="self-start px-3 py-1.5 bg-surface-control border border-line hover:bg-surface-hover text-ink rounded-lg text-xs font-mono transition cursor-pointer"
                    >
                      {language === 'en' ? 'Show licence texts' : 'Lizenztexte anzeigen'}
                    </button>
                  ) : (
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-surface-card border border-line/80 rounded-lg p-2 text-[10px] text-ink-secondary">{thirdPartyNotices}</pre>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </BaseModal>

      {/* Embedded User Manual Modal */}
      <UserManualModal
        isOpen={isManualOpen}
        onClose={() => setIsManualOpen(false)}
        language={language}
      />
    </>
  );
}
