/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import Logo from './Logo';
import { ThemeMode } from './SettingsModal';
import { Language } from '../utils/i18n';
import { Folder, FolderOpen, RefreshCw, X, ChevronRight } from 'lucide-react';

export interface RecentVaultItem {
  name: string;
  path: string;
  lastOpened: number;
}

interface SplashScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenVault: () => Promise<void>;
  onOpenRecentVault?: (vaultPath: string) => Promise<void>;
  theme: ThemeMode;
  language: Language;
}

// Older versions stored only the folder name as the "path", which cannot be reopened. Those
// entries are dropped here; a full Windows or POSIX path is required.
const isFullPath = (p: unknown) => typeof p === 'string' && /^([A-Za-z]:[\\/]|\\\\|\/)/.test(p);

export function getRecentVaults(): RecentVaultItem[] {
  try {
    const raw = localStorage.getItem('tessarios_recent_vaults');
    if (raw) {
      return (JSON.parse(raw) as RecentVaultItem[]).filter(v => isFullPath(v?.path));
    }
  } catch {}
  return [];
}

export function removeRecentVault(path: string): void {
  try {
    localStorage.setItem('tessarios_recent_vaults', JSON.stringify(getRecentVaults().filter(v => v.path !== path)));
  } catch {}
}

export function addRecentVault(name: string, path: string): void {
  if (!name || !isFullPath(path)) return;
  try {
    let current = getRecentVaults();
    current = current.filter(v => v.path !== path);
    current.unshift({ name, path, lastOpened: Date.now() });
    localStorage.setItem('tessarios_recent_vaults', JSON.stringify(current.slice(0, 5)));
  } catch {}
}

export default function SplashScreenModal({
  isOpen,
  onClose,
  onOpenVault,
  onOpenRecentVault,
  theme,
  language,
}: SplashScreenModalProps) {
  const [recentVaults, setRecentVaults] = useState<RecentVaultItem[]>([]);
  const [lmStudioOnline, setLmStudioOnline] = useState<boolean | null>(null);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [isCheckingProviders, setIsCheckingProviders] = useState(false);

  const checkProviderStatus = async () => {
    setIsCheckingProviders(true);
    const globalVault = (window as any).vault;

    // Check LM Studio
    try {
      if (globalVault && typeof globalVault.listAiModels === 'function') {
        await globalVault.listAiModels('lmstudio', 'http://127.0.0.1:1234/v1');
        setLmStudioOnline(true);
      } else {
        const res = await fetch('http://127.0.0.1:1234/v1/models', { method: 'GET' });
        setLmStudioOnline(res.ok);
      }
    } catch {
      setLmStudioOnline(false);
    }

    // Check Ollama
    try {
      if (globalVault && typeof globalVault.listAiModels === 'function') {
        await globalVault.listAiModels('ollama', 'http://127.0.0.1:11434/v1');
        setOllamaOnline(true);
      } else {
        const res = await fetch('http://127.0.0.1:11434/v1/models', { method: 'GET' });
        setOllamaOnline(res.ok);
      }
    } catch {
      setOllamaOnline(false);
    }

    setIsCheckingProviders(false);
  };

  useEffect(() => {
    if (isOpen) {
      setRecentVaults(getRecentVaults());
      checkProviderStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-overlay backdrop-blur-md transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Main Splash Card */}
      <div
        className="relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl transition-all duration-300 border flex flex-col items-center text-center overflow-hidden bg-surface-card border-line text-ink-heading"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-ink-secondary hover:text-ink-heading hover:bg-surface-hover transition cursor-pointer"
          title={language === 'en' ? 'Close' : 'Schließen'}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Ambient Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Logo */}
        <div className="my-2 transform hover:scale-105 transition-transform duration-300">
          <Logo size={96} showGlow={true} mode={theme} />
        </div>

        {/* App Title */}
        <h1 className="text-3xl font-mono font-black tracking-tight text-ink-heading mt-2">
          <span className="text-ink-heading">tessa</span><span className="text-indigo-400">rios</span>
        </h1>

        {/* Short Subtitle */}
        <p className="text-xs font-mono text-ink-secondary mt-1 font-medium">
          {language === 'en' ? 'Local-first Markdown assistant' : 'Lokaler KI-Schreibassistent & Worldbuilding'}
        </p>

        {/* Version Badge */}
        <span className="text-[10px] font-mono text-ink-muted mt-0.5 tracking-wider">
          v1.0.0
        </span>

        {/* Primary Action Button: Open Vault */}
        <button
          onClick={async () => {
            onClose();
            await onOpenVault();
          }}
          className="mt-6 w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-sm rounded-xl shadow-[0_0_20px_rgba(0,96,229,0.35)] hover:shadow-[0_0_25px_rgba(0,96,229,0.5)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex items-center justify-center gap-2"
        >
          <FolderOpen className="h-4 w-4" />
          <span>{language === 'en' ? 'Open Vault' : 'Tresor öffnen'}</span>
        </button>

        {/* Recent Vaults Section */}
        <div className="w-full mt-6 text-left border-t border-line pt-4 flex flex-col gap-2">
          <span className="text-[11px] font-mono font-bold text-ink-secondary tracking-wider">
            {language === 'en' ? 'Recent Vaults' : 'Kürzliche Tresore'}
          </span>

          {recentVaults.length > 0 ? (
            <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto custom-scrollbar">
              {recentVaults.map((vault) => (
                <button
                  key={vault.path}
                  onClick={async () => {
                    onClose();
                    if (onOpenRecentVault) {
                      await onOpenRecentVault(vault.path);
                    }
                  }}
                  className="group w-full p-2.5 rounded-lg bg-surface-card hover:bg-surface-hover border border-line hover:border-indigo-500/40 transition flex items-center justify-between text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder className="h-4 w-4 text-indigo-400 shrink-0 group-hover:text-indigo-300" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-mono font-bold text-ink-bright group-hover:text-ink-heading truncate">
                        {vault.name}
                      </span>
                      <span className="text-[10px] font-mono text-ink-muted truncate">
                        {vault.path}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-ink-faint group-hover:text-indigo-400 transition shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[11px] font-mono text-ink-muted italic py-1">
              {language === 'en' ? 'No recent vaults found' : 'Keine kürzlich geöffneten Tresore'}
            </span>
          )}
        </div>

        {/* Local Providers Status Section */}
        <div className="w-full mt-4 text-left border-t border-line pt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold text-ink-secondary tracking-wider">
              {language === 'en' ? 'Local Providers' : 'Lokale Provider'}
            </span>
            <button
              onClick={checkProviderStatus}
              disabled={isCheckingProviders}
              className="text-[10px] font-mono text-ink-muted hover:text-ink transition flex items-center gap-1 cursor-pointer"
              title={language === 'en' ? 'Check status' : 'Status prüfen'}
            >
              <RefreshCw className={`h-3 w-3 ${isCheckingProviders ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-col gap-1.5 font-mono text-xs">
            {/* LM Studio */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-surface-card/80 border border-line">
              <div className="flex items-center gap-2">
                <span 
                  className={`h-2 w-2 rounded-full ${
                    lmStudioOnline === true 
                      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' 
                      : lmStudioOnline === false 
                      ? 'bg-rose-500' 
                      : 'bg-zinc-600'
                  }`} 
                />
                <span className="font-semibold text-ink">LM Studio</span>
              </div>
              <span className={`text-[11px] font-semibold ${lmStudioOnline ? 'text-emerald-400' : 'text-ink-muted'}`}>
                {lmStudioOnline === true ? 'Online' : lmStudioOnline === false ? 'Offline' : '...'}
              </span>
            </div>

            {/* Ollama */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-surface-card/80 border border-line">
              <div className="flex items-center gap-2">
                <span 
                  className={`h-2 w-2 rounded-full ${
                    ollamaOnline === true 
                      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' 
                      : ollamaOnline === false 
                      ? 'bg-rose-500' 
                      : 'bg-zinc-600'
                  }`} 
                />
                <span className="font-semibold text-ink">Ollama</span>
              </div>
              <span className={`text-[11px] font-semibold ${ollamaOnline ? 'text-emerald-400' : 'text-ink-muted'}`}>
                {ollamaOnline === true ? 'Online' : ollamaOnline === false ? 'Offline' : '...'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
