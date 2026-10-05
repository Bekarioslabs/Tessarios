/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import GraphView from './components/GraphView';
import AIAssistant from './components/AIAssistant';
import MediaView from './components/MediaView';
import VaultStatsView from './components/VaultStatsView';
import SettingsModal, { ThemeMode } from './components/SettingsModal';
import MapEditor from './components/MapEditor';
import ManuscriptEditor from './components/ManuscriptEditor';
import Logo from './components/Logo';
import SplashScreenModal from './components/SplashScreenModal';
import { BaseModal } from './components/BaseModal';
import { Toast } from './components/Toast';
import { STARTER_VAULT } from './data/starterVault';
import { DEFAULT_TEMPLATES } from './data/templates';
import { countWords } from './utils/manuscript';
import { deleteEntityFromStorage } from './utils/vaultManager';
import { getStorage } from './utils/storage';
// NOTE: do not import lucide's `Map` here — it is unused and would shadow the built-in
// Map constructor for the whole module (which crashed the renderer once already).
import { Bot, Sparkles, Globe, LayoutDashboard, Languages, Settings, Sun, Moon, HardDrive, Folder, FolderOpen, GitMerge, RefreshCw, ExternalLink, Clock, GitCommit, Book, BookOpen, PenTool, FileText, Image as ImageIcon, BarChart3, Network, ChevronUp } from 'lucide-react';
import CollapseToggle from './components/ui/CollapseToggle';
import { Language, getTypeTranslation, DEFAULT_TEMPLATES_LOCALIZED } from './utils/i18n';
import { setGeneratedTextLanguage } from './utils/markdown';
import { useDialogState } from './hooks/useDialogState';
import { useLooseMedia } from './hooks/useLooseMedia';
import { useEntityCrud } from './hooks/useEntityCrud';
import { useVaultStorage } from './hooks/useVaultStorage';
import { useAiConnectionStatus } from './hooks/useAiConnectionStatus';

export default function App() {
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('world_lore_language') as Language) || 'de';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('world_lore_theme') as ThemeMode) || 'dark';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'appearance' | 'general' | 'storage' | 'ai' | 'help'>('appearance');
  const [isSplashOpen, setIsSplashOpen] = useState<boolean>(true);
  const [rightPanelTab, setRightPanelTab] = useState<'ai' | 'media' | 'stats'>('ai');
  const [workspaceMode, setWorkspaceMode] = useState<'dossier' | 'manuscript'>('dossier');

  // Collapsible Panel Layout state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem('world_lore_theme', newTheme);
  };
  
  // Local File System Vault State — isStorageActive/autoSyncLocal stay here (rather than
  // inside useVaultStorage) because useLooseMedia and useEntityCrud both need to read
  // them to decide whether to persist, and both run independently of useVaultStorage.
  const [isStorageActive, setIsStorageActive] = useState<boolean>(false);
  const [autoSyncLocal, setAutoSyncLocal] = useState<boolean>(() => {
    return localStorage.getItem('tesserios_autosync_local') !== 'false';
  });

  // Loose Media Assets Store
  const {
    looseMedia,
    setLooseMedia,
    saveLooseMedia,
    handleAddLooseMedia,
    handleDeleteLooseMedia,
  } = useLooseMedia(isStorageActive, autoSyncLocal);

  // Custom Confirmation & Alert Dialog States
  const {
    confirmDialog,
    setConfirmDialog,
    alertDialog,
    setAlertDialog,
    skipCreationConfirm,
    setSkipCreationConfirm,
    toastNotification,
    setToastNotification,
  } = useDialogState();

  const {
    entities,
    setEntities,
    activeEntityId,
    setActiveEntityId,
    activeEntity,
    handleUpdateEntity,
    handleUpdateEntitiesBatch,
    handleRenameEntity,
    handleAddEntity,
    handleDeleteEntity,
    handleApplyAISection,
    handleApplyTidyUp,
  } = useEntityCrud({
    isStorageActive,
    autoSyncLocal,
    language,
    skipCreationConfirm,
    setSkipCreationConfirm,
    setConfirmDialog,
    setToastNotification,
  });

  const {
    localVaultName,
    mergeConfirmDialog,
    setMergeConfirmDialog,
    handleOpenRecentVault,
    handleOpenLocalFolder,
    handleConfirmMergeVault,
    handleConfirmReplaceVault,
    handleCreateLocalFolder,
    handleReloadLocalFolder,
    handleSyncToLocalFolder,
    handleDisconnectLocalFolder,
    handleToggleAutoSyncLocal,
  } = useVaultStorage({
    entities,
    setEntities,
    setActiveEntityId,
    looseMedia,
    setLooseMedia,
    isStorageActive,
    setIsStorageActive,
    autoSyncLocal,
    setAutoSyncLocal,
    setAlertDialog,
    language,
  });

  // The few headings markdown.ts writes into files itself (gallery, map legend) follow the
  // interface language; see setGeneratedTextLanguage for how existing headings are kept.
  useEffect(() => {
    setGeneratedTextLanguage(language);
  }, [language]);

  const isAiReady = useAiConnectionStatus();

  // Stamp the theme on <html>, not on the app shell: the color tokens have to be in
  // scope for <body> too, otherwise the page behind the app (visible during load and
  // on overscroll) keeps the browser default while everything else has flipped.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div
      className="h-screen max-h-screen overflow-hidden bg-surface-base text-ink flex flex-col selection:bg-indigo-900 selection:text-ink-heading transition-colors duration-200"
      id="main-app-shell"
    >
      {/* Top Atmospheric Navbar */}
      <header className="px-6 py-3 bg-surface-card border-b border-line shadow-2xl flex items-center justify-between select-none">
        <div 
          onClick={() => setIsSplashOpen(true)}
          className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-80 transition"
          title={language === 'en' ? 'Open Tessarios splash screen' : 'Tessarios Splash Screen öffnen'}
        >
          <Logo size={34} showGlow={true} mode={theme} />
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold tracking-tight lowercase font-mono">
              <span className="text-ink-heading">tessa</span><span className="text-indigo-400">rios</span> <span className="text-xs text-indigo-400/70 font-mono">v1.0.0</span>
            </h1>
            <p className="text-[9px] font-mono text-ink-muted uppercase tracking-wider mt-0.5">
              {language === 'en' ? 'Local-first Worldbuilding & Story Assistant' : 'Lokaler KI-Schreibassistent & Worldbuilding'}
            </p>
          </div>
        </div>

        {/* Centered Workplace Switcher */}
        <div className="flex-1 flex justify-center px-2">
          <div className="bg-surface-base border border-line p-1 rounded-xl flex items-center gap-1 font-mono text-xs shadow-inner">
            <button
              type="button"
              onClick={() => setWorkspaceMode('dossier')}
              className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 font-bold ${
                workspaceMode === 'dossier'
                  ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(0,96,229,0.3)]'
                  : 'text-ink-secondary hover:text-ink-bright hover:bg-surface-hover/50'
              }`}
            >
              <BookOpen className={`h-3.5 w-3.5 ${workspaceMode === 'dossier' ? 'text-indigo-200' : 'text-indigo-400'}`} />
              <span>{language === 'en' ? 'Chronicles' : 'Chroniken'}</span>
            </button>

            <button
              type="button"
              onClick={() => setWorkspaceMode('manuscript')}
              className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 font-bold ${
                workspaceMode === 'manuscript'
                  ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(0,96,229,0.3)]'
                  : 'text-ink-secondary hover:text-ink-bright hover:bg-surface-hover/50'
              }`}
            >
              <PenTool className={`h-3.5 w-3.5 ${workspaceMode === 'manuscript' ? 'text-rose-300' : 'text-rose-400'}`} />
              <span>{language === 'en' ? 'Manuscript' : 'Manuskript'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => {
              setSettingsInitialTab('storage');
              setIsSettingsOpen(true);
            }}
            className="flex items-center gap-2 text-[10px] font-mono text-ink bg-surface-base/80 hover:bg-surface-hover/80 px-3 py-1.5 rounded-lg border border-line transition cursor-pointer"
            title={language === 'en' ? 'Click to open folder sync & storage settings' : 'Klicken um Ordner-Sync & Speicher-Einstellungen zu öffnen'}
          >
            {localVaultName ? (
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <Folder className="h-3.5 w-3.5" />
                <span className="truncate max-w-[140px] sm:max-w-[200px]">ORDNER: {localVaultName}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <HardDrive className="h-3.5 w-3.5" />
                <span>{language === 'en' ? 'LOCAL STORAGE (BROWSER)' : 'BROWSER-SPEICHER'}</span>
              </div>
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={() => {
              setSettingsInitialTab('appearance');
              setIsSettingsOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-base hover:bg-surface-hover/80 border border-line/80 text-ink hover:text-ink-heading rounded-lg text-xs font-mono transition cursor-pointer shadow-sm"
            title={language === 'en' ? 'Settings & Appearance' : 'Einstellungen & Erscheinungsbild'}
          >
            <Settings className="h-3.5 w-3.5 text-indigo-400" />
            <span className="hidden sm:inline">{language === 'en' ? 'Settings' : 'Einstellungen'}</span>
            {theme === 'light' ? (
              <Sun className="h-3 w-3 text-amber-400 ml-0.5" />
            ) : (
              <Moon className="h-3 w-3 text-indigo-400 ml-0.5" />
            )}
          </button>
        </div>
      </header>

      {/* Main 3-Panel Content */}
      <main className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden relative select-none">
        {workspaceMode === 'manuscript' ? (
          <div className="flex-1 h-full min-h-0 bg-surface-base overflow-hidden">
            <ManuscriptEditor
              entities={entities}
              templates={DEFAULT_TEMPLATES_LOCALIZED[language] || []}
              activeEntityId={activeEntityId}
              onSelectEntity={setActiveEntityId}
              onUpdateEntity={handleUpdateEntity}
              onUpdateEntitiesBatch={handleUpdateEntitiesBatch}
              onAddEntity={handleAddEntity}
              onDeleteEntity={handleDeleteEntity}
              onAddLooseMedia={handleAddLooseMedia}
              onRenameEntity={handleRenameEntity}
              language={language}
              onClose={() => setWorkspaceMode('dossier')}
            />
          </div>
        ) : (
          <>
            {/* Left Column: Sidebar Vault Navigator */}
            <div 
              className={`h-full overflow-hidden shrink-0 transition-[width] duration-200 ease-out border-r border-line/80 ${
                isSidebarCollapsed 
                  ? 'w-14' 
                  : 'w-64 lg:w-72 xl:w-80'
              }`}
            >
              <Sidebar
                entities={entities}
                looseMedia={looseMedia}
                activeEntityId={activeEntityId}
                onSelectEntity={setActiveEntityId}
                onAddEntity={handleAddEntity}
                onDeleteEntity={handleDeleteEntity}
                language={language}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
                localVaultName={localVaultName || undefined}
              />
            </div>

            {/* Middle Column: Active Workspace & Network Graph */}
            <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden p-4 gap-4 bg-surface-base">
              {activeEntity ? (
                <>
                  {/* Primary Workspace Editor — always mounted; the Editor's own header
                      (name, type, buttons) stays visible and only its body collapses,
                      so there's no separate duplicate summary bar to keep in sync. */}
                  <div className={`flex flex-col min-h-0 ${isEditorCollapsed ? 'shrink-0' : 'flex-1 h-full'}`}>
                    <Editor
                      entity={activeEntity}
                      entities={entities}
                      looseMedia={looseMedia}
                      onUpdateEntity={handleUpdateEntity}
                      onUpdateEntitiesBatch={handleUpdateEntitiesBatch}
                      onRenameEntity={handleRenameEntity}
                      onSelectEntity={setActiveEntityId}
                      onAddEntity={handleAddEntity}
                      onAddLooseMedia={handleAddLooseMedia}
                      language={language}
                      isCollapsed={isEditorCollapsed}
                      onToggleCollapseEditor={() => setIsEditorCollapsed(prev => !prev)}
                      onOpenManuscriptWorkspace={() => setWorkspaceMode('manuscript')}
                    />
                  </div>

              {/* Dynamic Network Graph View (Collapsible / Maximizable) */}
              {(isGraphExpanded || isEditorCollapsed) ? (
                <div className={`relative border border-line rounded-xl overflow-hidden bg-surface-card transition-all duration-200 flex flex-col min-h-0 ${
                  isEditorCollapsed ? 'flex-1 h-full' : 'flex-shrink-0 h-80'
                }`}>
                  <div className="absolute top-2 right-2 z-30 flex items-center gap-2">
                    <CollapseToggle
                      collapsed={false}
                      onToggle={() => {
                        if (isEditorCollapsed) {
                          setIsEditorCollapsed(false);
                        } else {
                          setIsGraphExpanded(false);
                        }
                      }}
                      direction="vertical-inverted"
                      titleExpand={language === 'en' ? 'Expand Relationship Network' : 'Beziehungsnetzwerk ausklappen'}
                      titleCollapse={language === 'en' ? 'Minimize Network' : 'Beziehungsnetzwerk einklappen'}
                    />
                  </div>
                  <GraphView
                    entities={entities}
                    activeEntityId={activeEntityId}
                    onSelectEntity={setActiveEntityId}
                    language={language}
                  />
                </div>
              ) : (
                <div className="flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsGraphExpanded(true)}
                    className="w-full py-1.5 px-3 bg-surface-card hover:bg-surface-control border border-line/80 rounded-lg text-ink-secondary hover:text-indigo-300 text-[10px] font-mono flex items-center justify-between transition cursor-pointer shadow-sm"
                    title={language === 'en' ? 'Expand Relationship Network' : 'Beziehungsnetzwerk ausklappen'}
                  >
                    <div className="flex items-center gap-2">
                      <Network className="h-3.5 w-3.5 text-indigo-400" />
                      <span className="font-semibold">{language === 'en' ? 'Relationship Network' : 'Beziehungsnetzwerk'}</span>
                    </div>
                    <div className="w-[30px] h-[30px] flex items-center justify-center bg-surface-elevated text-ink border border-line rounded-md text-[11px] font-mono shrink-0">
                      <ChevronUp className="h-3.5 w-3.5 text-indigo-400" />
                    </div>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-surface-card border border-line rounded-xl">
              <LayoutDashboard className="h-10 w-10 text-ink-disabled mb-3" />
              <p className="text-xs font-mono text-ink-secondary">
                {language === 'en' ? 'Your chronicled vault is empty.' : 'Deine Chroniken sind derzeit leer.'}
              </p>
              <p className="text-[10px] font-mono text-ink-muted mt-1 max-w-xs">
                {language === 'en' 
                  ? 'Click "Forge New Entry" on the left panel or synchronize an existing ZIP file to start your saga.'
                  : 'Klicke auf „Neue Chronik schmieden“ im linken Bereich oder synchronisiere eine vorhandene ZIP-Datei, um deine Saga zu beginnen.'}
              </p>
            </div>
          )}
        </div>

        {/* Right Column: AI Assistant & Generator / Media Gallery / Vault Statistics.
            One container whose width transitions, matching the left sidebar — never a
            conditional mount/unmount or display:none swap between two separate elements. */}
        <div
          className={`shrink-0 h-full overflow-hidden bg-surface-base border-l border-line/80 flex flex-col transition-[width] duration-200 ease-out ${
            isRightPanelCollapsed ? 'w-12' : 'w-80 md:w-96 lg:w-[440px] xl:w-[490px] 2xl:w-[540px]'
          }`}
          id="right-panel"
        >
          {isRightPanelCollapsed ? (
            <div className="h-full overflow-y-auto flex flex-col items-center py-3 px-1 gap-3 shadow-xl select-none" id="right-panel-collapsed">
              {/* Toggle Expand button */}
              <CollapseToggle
                collapsed={true}
                onToggle={() => setIsRightPanelCollapsed(false)}
                direction="horizontal-right"
                titleExpand={language === 'en' ? 'Expand Right Panel' : 'Rechte Leiste ausklappen'}
                titleCollapse=""
              />

              <div className="w-6 h-[1px] bg-surface-hover/80 my-0.5" />

              {/* Vertical Tab Icon Rail */}
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRightPanelTab('ai');
                    setIsRightPanelCollapsed(false);
                  }}
                  className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center border ${
                    rightPanelTab === 'ai'
                      ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/80 shadow-[0_0_10px_rgba(0,96,229,0.3)]'
                      : 'bg-surface-control/60 text-ink-secondary hover:text-ink-heading border-line hover:bg-surface-hover'
                  }`}
                  title={language === 'en' ? 'AI Chronicler' : 'KI-Chronist'}
                >
                  <Bot className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRightPanelTab('media');
                    setIsRightPanelCollapsed(false);
                  }}
                  className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center border ${
                    rightPanelTab === 'media'
                      ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/80 shadow-[0_0_10px_rgba(0,96,229,0.3)]'
                      : 'bg-surface-control/60 text-ink-secondary hover:text-ink-heading border-line hover:bg-surface-hover'
                  }`}
                  title={language === 'en' ? 'Media' : 'Medien'}
                >
                  <ImageIcon className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRightPanelTab('stats');
                    setIsRightPanelCollapsed(false);
                  }}
                  className={`p-2 rounded-xl transition cursor-pointer flex items-center justify-center border ${
                    rightPanelTab === 'stats'
                      ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/80 shadow-[0_0_10px_rgba(0,96,229,0.3)]'
                      : 'bg-surface-control/60 text-ink-secondary hover:text-ink-heading border-line hover:bg-surface-hover'
                  }`}
                  title={language === 'en' ? 'Statistics' : 'Statistiken'}
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-hidden p-4 flex flex-col" id="right-panel-expanded">
              <div className={`h-full flex flex-col min-h-0 ${rightPanelTab === 'ai' ? '' : 'hidden'}`}>
                <AIAssistant
                  activeEntity={activeEntity}
                  entities={entities}
                  templates={DEFAULT_TEMPLATES_LOCALIZED[language] || []}
                  onApplySection={handleApplyAISection}
                  onApplyTidyUp={handleApplyTidyUp}
                  language={language}
                  rightPanelTab={rightPanelTab}
                  onTabChange={setRightPanelTab}
                  onToggleCollapse={() => setIsRightPanelCollapsed(true)}
                />
              </div>

              <div className={`h-full flex flex-col min-h-0 ${rightPanelTab === 'media' ? '' : 'hidden'}`}>
                <MediaView
                  entities={entities}
                  looseMedia={looseMedia}
                  activeEntity={activeEntity}
                  onUpdateEntity={handleUpdateEntity}
                  onSelectEntity={setActiveEntityId}
                  onAddEntity={handleAddEntity}
                  onAddLooseMedia={handleAddLooseMedia}
                  onDeleteLooseMedia={handleDeleteLooseMedia}
                  language={language === 'en' ? 'en' : 'de'}
                  rightPanelTab={rightPanelTab}
                  onTabChange={setRightPanelTab}
                  onToggleCollapse={() => setIsRightPanelCollapsed(true)}
                />
              </div>

              <div className={`h-full flex flex-col min-h-0 ${rightPanelTab === 'stats' ? '' : 'hidden'}`}>
                <VaultStatsView
                  entities={entities}
                  looseMedia={looseMedia}
                  activeEntity={activeEntity}
                  onSelectEntity={setActiveEntityId}
                  language={language}
                  rightPanelTab={rightPanelTab}
                  onTabChange={setRightPanelTab}
                  onToggleCollapse={() => setIsRightPanelCollapsed(true)}
                />
              </div>
            </div>
          )}
        </div>
      </>
    )}
    </main>

      {/* Bottom Status Bar / Footer Leiste */}
      <footer className="h-7 shrink-0 bg-surface-base border-t border-line/80 flex items-center justify-between px-3 text-[10px] font-mono text-ink-secondary select-none relative z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-ink-secondary">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-ink">
              {language === 'en' ? 'Vault Status:' : 'Chronik-Status:'}
            </span>
            <span className="text-ink-secondary">{Object.keys(entities).length} {language === 'en' ? 'entries' : 'Einträge'}</span>
          </div>

          {activeEntity && (
            <div className="hidden sm:flex items-center gap-2 border-l border-line/80 pl-3">
              <span className="text-ink-muted">{language === 'en' ? 'Active Dossier:' : 'Aktives Dossier:'}</span>
              <span className="text-indigo-300 font-semibold truncate max-w-[200px]">{activeEntity.title}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {activeEntity && (
            <div className="flex items-center gap-3 text-ink-secondary">
              <span>{countWords(activeEntity.content)} {language === 'en' ? 'words' : 'Wörter'}</span>
              <span className="text-ink-disabled">|</span>
              <span>{(activeEntity.content || '').length} {language === 'en' ? 'chars' : 'Zeichen'}</span>
            </div>
          )}
          <div
            className="hidden md:flex items-center gap-1.5 border-l border-line/80 pl-3 text-ink-muted"
            title={
              isAiReady
                ? (language === 'en' ? 'A model is loaded and reachable.' : 'Ein Modell ist geladen und erreichbar.')
                : (language === 'en' ? 'No AI model reachable — check LM Studio / Ollama in Settings.' : 'Kein KI-Modell erreichbar — LM Studio / Ollama in den Einstellungen prüfen.')
            }
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isAiReady ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span>
              {isAiReady
                ? (language === 'en' ? 'AI Chronicler Ready' : 'KI-Chronist Bereit')
                : (language === 'en' ? 'AI Chronicler Offline' : 'KI-Chronist nicht verbunden')}
            </span>
          </div>
        </div>
      </footer>

      {confirmDialog && (
        <CustomDialog
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          cancelText={confirmDialog.cancelText}
          showCheckbox={confirmDialog.showCheckbox}
          checkboxLabel={confirmDialog.checkboxLabel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
          language={language}
        />
      )}

      {alertDialog && (
        <CustomDialog
          isOpen={alertDialog.isOpen}
          title={alertDialog.title}
          message={alertDialog.message}
          confirmText={language === 'en' ? 'Understood' : 'Verstanden'}
          isAlertOnly={true}
          language={language}
          onConfirm={() => setAlertDialog(null)}
        />
      )}

      {mergeConfirmDialog && (
        <BaseModal
          isOpen={!!mergeConfirmDialog}
          onClose={() => setMergeConfirmDialog(null)}
          icon={<FolderOpen className="h-6 w-6" />}
          title={
            language === 'en'
              ? `Folder "${mergeConfirmDialog.vaultName}" loaded`
              : `Ordner "${mergeConfirmDialog.vaultName}" geladen`
          }
          subtitle={
            language === 'en'
              ? `${Object.keys(mergeConfirmDialog.loadedEntities).length} notes found in the folder.`
              : `${Object.keys(mergeConfirmDialog.loadedEntities).length} Notizen im Ordner gefunden.`
          }
          maxWidth="md"
        >
          <div className="flex flex-col gap-4 font-mono text-left">
            <div className="text-xs text-ink leading-relaxed bg-surface-base p-3.5 rounded-xl border border-line">
              {language === 'en' ? (
                <>You already have <span className="text-ink-heading font-bold">{Object.keys(entities).length} entries</span> in your current world. How would you like to handle the loaded notes?</>
              ) : (
                <>Du hast bereits <span className="text-ink-heading font-bold">{Object.keys(entities).length} Einträge</span> in deiner aktuellen Welt. Wie möchtest du mit den geladenen Notizen verfahren?</>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleConfirmMergeVault}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <GitMerge className="h-4 w-4" />
                <span>{language === 'en' ? 'Merge into current world' : 'In bestehende Welt zusammenführen (Merge)'}</span>
              </button>

              <button
                onClick={handleConfirmReplaceVault}
                className="w-full py-2.5 px-4 bg-surface-control hover:bg-surface-hover text-ink border border-line-strong rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4 text-amber-400" />
                <span>{language === 'en' ? 'Load as new vault (Replace)' : 'Als neuen Tresor laden (Ersetzen)'}</span>
              </button>

              <button
                onClick={() => setMergeConfirmDialog(null)}
                className="w-full py-2 text-ink-muted hover:text-ink text-xs transition cursor-pointer text-center mt-1"
              >
                {language === 'en' ? 'Cancel' : 'Abbrechen'}
              </button>
            </div>

            <p className="text-[10px] text-ink-muted text-center">
              {language === 'en'
                ? '💡 Note: Your previous notes were automatically saved as a backup under "Archive Backups" before this step.'
                : '💡 Hinweis: Deine bisherigen Notizen wurden vor diesem Schritt automatisch unter "Archiv-Sicherungen" als Backup gespeichert.'}
            </p>
          </div>
        </BaseModal>
      )}

      {toastNotification?.isOpen && (
        <Toast
          className="fixed bottom-6 right-6"
          icon={<Sparkles className="h-4 w-4 text-indigo-400" />}
          message={
            <>
              <span className="text-ink-heading font-bold">"{toastNotification.title}"</span>
              <span className="text-ink-secondary"> ({getTypeTranslation(toastNotification.type, language)}) {language === 'en' ? 'was created.' : 'wurde geschmiedet.'}</span>
            </>
          }
          action={{
            label: language === 'en' ? 'Undo' : 'Rückgängig',
            onClick: () => {
              const entityToDelete = entities[toastNotification.createdEntityId];
              setEntities(toastNotification.previousEntities);
              setActiveEntityId(toastNotification.previousActiveId);

              if (isStorageActive && entityToDelete) {
                deleteEntityFromStorage(getStorage(), entityToDelete);
              }
              setToastNotification(null);
            },
          }}
          onDismiss={() => setToastNotification(null)}
        />
      )}

      {/* Splash Screen Modal */}
      <SplashScreenModal
        isOpen={isSplashOpen}
        onClose={() => setIsSplashOpen(false)}
        onOpenVault={handleOpenLocalFolder}
        onOpenRecentVault={handleOpenRecentVault}
        theme={theme}
        language={language}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsInitialTab}
        theme={theme}
        onThemeChange={handleThemeChange}
        language={language}
        onLanguageChange={(lang) => {
          setLanguage(lang);
          localStorage.setItem('world_lore_language', lang);
        }}
        entities={entities}
        looseMedia={looseMedia}
        onRestoreVault={(restoredEntities) => {
          setEntities(restoredEntities);

        }}
        localVaultName={localVaultName}
        isStorageActive={isStorageActive}
        autoSyncLocal={autoSyncLocal}
        onOpenLocalFolder={handleOpenLocalFolder}
        onCreateLocalFolder={handleCreateLocalFolder}
        onReloadLocalFolder={handleReloadLocalFolder}
        onSyncToLocalFolder={handleSyncToLocalFolder}
        onDisconnectLocalFolder={handleDisconnectLocalFolder}
        onToggleAutoSyncLocal={handleToggleAutoSyncLocal}
      />
    </div>
  );
}

interface CustomDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  showCheckbox?: boolean;
  checkboxLabel?: string;
  onConfirm: (checked?: boolean) => void;
  onCancel?: () => void;
  isAlertOnly?: boolean;
  language: Language;
}

function CustomDialog({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  showCheckbox = false,
  checkboxLabel,
  onConfirm,
  onCancel,
  isAlertOnly = false,
  language,
}: CustomDialogProps) {
  const [checked, setChecked] = useState(false);
  const isEn = language === 'en';
  confirmText = confirmText ?? (isEn ? 'Confirm' : 'Bestätigen');
  cancelText = cancelText ?? (isEn ? 'Cancel' : 'Abbrechen');
  checkboxLabel = checkboxLabel ?? (isEn ? "Don't ask again" : 'Nicht mehr fragen');

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onCancel || (() => onConfirm())}
      icon={<Bot className="h-5 w-5" />}
      title={title}
      maxWidth="md"
      footer={
        <>
          {!isAlertOnly && onCancel && (
            <button
              onClick={onCancel}
              className="px-3.5 py-1.5 bg-surface-control hover:bg-surface-hover text-ink-secondary hover:text-ink-heading rounded-lg text-xs font-mono transition cursor-pointer border border-line"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={() => onConfirm(checked)}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono transition cursor-pointer shadow-[0_0_12px_rgba(0,96,229,0.3)] font-semibold"
          >
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-[11px] font-mono text-ink-secondary leading-relaxed whitespace-pre-line">{message}</p>

      {showCheckbox && (
        <label className="flex items-center gap-2.5 px-1 mt-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="accent-indigo-500 h-3.5 w-3.5 rounded border-line bg-surface-base"
          />
          <span className="text-[10px] font-mono text-ink-muted hover:text-ink-secondary transition-colors">
            {checkboxLabel}
          </span>
        </label>
      )}
    </BaseModal>
  );
}
