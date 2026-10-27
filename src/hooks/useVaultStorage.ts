/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import { Language } from '../utils/i18n';
import { LoreEntity, LooseMediaAsset } from '../types';
import { exportVaultAsZip } from '../utils/fileSystemVault';
import { loadVaultFromStorage, syncFullVaultToStorage, purgeOrphanedBackups } from '../utils/vaultManager';
import { getStorage } from '../utils/storage';
import { IVaultStorage } from '../utils/storage/VaultStorage';
import { addRecentVault, removeRecentVault } from '../components/SplashScreenModal';
import { AlertDialogState } from './useDialogState';

/**
 * Best-effort background maintenance run every time a vault finishes loading: removes
 * on-disk backup folders for entities that no longer exist in *this* vault and whose
 * newest backup is older than the configured retention period (see purgeOrphanedBackups
 * for why this is disk-only and doesn't touch any other vault's backups).
 */
function runOrphanedBackupCleanup(storage: IVaultStorage, entities: Record<string, LoreEntity>) {
  purgeOrphanedBackups(storage, new Set(Object.keys(entities))).catch(err =>
    console.warn('Orphaned backup cleanup failed:', err)
  );
}

/** Best-effort full-vault ZIP snapshot (rotates to 5, see main.cjs) before a risky
 *  operation like switching vault folders — mirrors what "Create ZIP Backup Now" in
 *  Settings does, just triggered automatically instead of by hand. Never throws: a failed
 *  safety backup shouldn't block the operation it was meant to protect. */
async function createSafetyZipBackup(): Promise<void> {
  const vault = (window as any).vault;
  if (!vault?.createFullBackup) return;
  try {
    await vault.createFullBackup();
  } catch (err) {
    console.warn('Safety backup failed:', err);
  }
}

export interface MergeConfirmDialogState {
  isOpen: boolean;
  loadedEntities: Record<string, LoreEntity>;
  vaultName: string;
}

export interface UseVaultStorageParams {
  entities: Record<string, LoreEntity>;
  setEntities: React.Dispatch<React.SetStateAction<Record<string, LoreEntity>>>;
  setActiveEntityId: React.Dispatch<React.SetStateAction<string>>;
  looseMedia: Record<string, LooseMediaAsset>;
  setLooseMedia: React.Dispatch<React.SetStateAction<Record<string, LooseMediaAsset>>>;
  isStorageActive: boolean;
  setIsStorageActive: (v: boolean) => void;
  autoSyncLocal: boolean;
  setAutoSyncLocal: (v: boolean) => void;
  setAlertDialog: (dialog: AlertDialogState | null) => void;
  language: Language;
}

/**
 * Vault (local folder) lifecycle: connecting, loading, merging/replacing, syncing,
 * disconnecting. Extracted from App.tsx (Finding 5). isStorageActive/autoSyncLocal
 * themselves stay owned by App.tsx (passed in here read/write) since useLooseMedia and
 * useEntityCrud also need to read them and neither hook exclusively owns that concept.
 */
export function useVaultStorage({
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
}: UseVaultStorageParams) {
  const tr = (en: string, de: string) => (language === 'en' ? en : de);
  const [localVaultName, setLocalVaultName] = useState<string | null>(null);
  const [mergeConfirmDialog, setMergeConfirmDialog] = useState<MergeConfirmDialogState | null>(null);

  // Initial Load: Auto-reconnect stored local folder handle on boot
  useEffect(() => {
    const storage = getStorage();
    storage.initialize().then(async (success) => {
      if (success) {
        setIsStorageActive(true);
        const name = storage.getName();
        setLocalVaultName(name);
        try {
          const loadedVault = await loadVaultFromStorage(storage) as any;
          setEntities(loadedVault.entities);
          runOrphanedBackupCleanup(storage, loadedVault.entities);
          if (loadedVault.looseMedia) {
            setLooseMedia(loadedVault.looseMedia);
          }
          const keys = Object.keys(loadedVault.entities);
          // Ensure active entity is valid
          setActiveEntityId(prev => {
            if (prev && loadedVault.entities[prev]) return prev;
            return keys.length > 0 ? keys[0] : '';
          });

          // The recent-vaults list needs the full path, not just the folder name
          const activePath = await storage.getPath?.();
          if (name && activePath) {
            addRecentVault(name, activePath);
          }
        } catch (err) {
          console.error('Failed to load vault on boot:', err);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenRecentVault = async (vaultPath: string) => {
    const failed = () => {
      // A folder that moved or was deleted would stay in the list and fail every time.
      removeRecentVault(vaultPath);
      setAlertDialog({
        isOpen: true,
        title: tr('Vault could not be opened', 'Tresor konnte nicht geöffnet werden'),
        message: tr(
          'The folder was moved, deleted or is no longer in your list. It has been removed from the recent vaults. Use "Open Vault" and pick it again.',
          'Der Ordner wurde verschoben, gelöscht oder ist nicht mehr in deiner Liste. Er wurde aus den zuletzt geöffneten Tresoren entfernt. Wähle ihn mit "Tresor öffnen" erneut aus.'
        ),
      });
    };
    try {
      const storage = getStorage();
      const success = await storage.initialize({ targetPath: vaultPath });
      if (!success) {
        failed();
        return;
      }
      setIsStorageActive(true);
      const name = storage.getName();
      setLocalVaultName(name);
      addRecentVault(name, (await storage.getPath?.()) || vaultPath);
      const loadedVault = await loadVaultFromStorage(storage) as any;
      setEntities(loadedVault.entities);
      runOrphanedBackupCleanup(storage, loadedVault.entities);
      // Media of the vault we just left must not stay in the gallery of the new one
      setLooseMedia(loadedVault.looseMedia || {});
      const keys = Object.keys(loadedVault.entities);
      setActiveEntityId(keys.length > 0 ? keys[0] : '');
    } catch (err) {
      console.error('Failed to open recent vault:', err);
      failed();
    }
  };

  const [wikiAvailable, setWikiAvailable] = useState(false);
  useEffect(() => {
    getStorage().isWikiAvailable?.().then(setWikiAvailable).catch(() => setWikiAvailable(false));
  }, []);

  /** Opens the bundled wiki as the user's own copy; the shipped original is never written to. */
  const handleOpenWiki = async () => {
    try {
      const storage = getStorage();
      const opened = await storage.openWiki?.();
      const wikiPath = opened ? await storage.getPath?.() : '';
      if (!wikiPath) throw new Error('the bundled wiki is not available');
      await handleOpenRecentVault(wikiPath);
    } catch (err) {
      console.error('Failed to open the bundled wiki:', err);
      setAlertDialog({
        isOpen: true,
        title: tr('Wiki could not be opened', 'Wiki konnte nicht geöffnet werden'),
        message: tr(
          'The wiki next to the app could not be copied to your Documents folder. Open the folder "Tessarios Wiki" next to the app with "Open Vault" instead.',
          'Das Wiki neben der App konnte nicht in deinen Dokumente-Ordner kopiert werden. Öffne stattdessen den Ordner "Tessarios Wiki" neben der App mit "Tresor öffnen".'
        ),
      });
    }
  };

  const handleOpenLocalFolder = async () => {
    try {
      // Create automatic backup snapshot before changing anything
      if (Object.keys(entities).length > 0) {
        await createSafetyZipBackup();
      }

      let loadedVault: {
        entities: Record<string, LoreEntity>;
        vaultName: string;
      } | null = null;

      try {
        const storage = getStorage();
        const success = await storage.initialize({ prompt: true });
        if (success) {
          loadedVault = await loadVaultFromStorage(storage) as any;
          if (loadedVault) runOrphanedBackupCleanup(storage, loadedVault.entities);
          setIsStorageActive(true);
          const name = storage.getName();
          setLocalVaultName(name);
          const pathStr = await storage.getPath?.();
          if (pathStr) addRecentVault(name, pathStr);
        }
      } catch (e: any) {
        console.error('Storage initialization failed', e);
      }

      if (!loadedVault) return;

      const loadedCount = Object.keys(loadedVault.entities).length;
      const currentCount = Object.keys(entities).length;

      if (loadedCount === 0) {
        setAlertDialog({
          isOpen: true,
          title: tr('Folder loaded', 'Ordner geladen'),
          message: tr(`Folder "${loadedVault.vaultName}" was opened but contains no .md files.`, `Ordner "${loadedVault.vaultName}" wurde geöffnet, enthält aber keine .md-Dateien.`),
        });
        return;
      }

      // If current workspace has existing entities, ask user whether to MERGE or REPLACE
      if (currentCount > 0) {
        setMergeConfirmDialog({
          isOpen: true,
          loadedEntities: loadedVault.entities,
          vaultName: loadedVault.vaultName,
        });
      } else {
        setEntities(loadedVault.entities);

        setLooseMedia({});
        const keys = Object.keys(loadedVault.entities);
        if (keys.length > 0) setActiveEntityId(keys[0]);

        setAlertDialog({
          isOpen: true,
          title: tr('Folder loaded', 'Ordner geladen'),
          message: tr(`${loadedCount} notes were loaded successfully from "${loadedVault.vaultName}".`, `${loadedCount} Notizen wurden erfolgreich aus "${loadedVault.vaultName}" geladen.`),
        });
      }
    } catch (err: any) {
      console.error('Failed to open local vault folder:', err);
      setAlertDialog({
        isOpen: true,
        title: tr('Error opening folder', 'Fehler beim Öffnen'),
        message: err.message || tr('The folder could not be opened.', 'Ordner konnte nicht geöffnet werden.'),
      });
    }
  };

  const handleConfirmMergeVault = () => {
    if (!mergeConfirmDialog) return;
    const merged = { ...entities, ...mergeConfirmDialog.loadedEntities };
    setEntities(merged);

    const keys = Object.keys(merged);
    if (keys.length > 0) setActiveEntityId(keys[0]);

    if (isStorageActive && autoSyncLocal) {
      syncFullVaultToStorage(getStorage(), merged, localVaultName || 'Vault', looseMedia).catch(err =>
        console.warn('Failed to sync merged vault to storage:', err)
      );
    }

    setAlertDialog({
      isOpen: true,
      title: tr('Notes merged', 'Notizen zusammengeführt'),
      message: tr(
        `${Object.keys(mergeConfirmDialog.loadedEntities).length} notes from "${mergeConfirmDialog.vaultName}" were combined with your existing notes. Total: ${keys.length} entries.`,
        `${Object.keys(mergeConfirmDialog.loadedEntities).length} Notizen aus "${mergeConfirmDialog.vaultName}" wurden mit deinen bisherigen Notizen kombiniert. Gesamtzahl: ${keys.length} Einträge.`
      ),
    });
    setMergeConfirmDialog(null);
  };

  const handleConfirmReplaceVault = () => {
    if (!mergeConfirmDialog) return;
    setEntities(mergeConfirmDialog.loadedEntities);

    setLooseMedia({});
    const keys = Object.keys(mergeConfirmDialog.loadedEntities);
    if (keys.length > 0) setActiveEntityId(keys[0]);

    if (isStorageActive && autoSyncLocal) {
      syncFullVaultToStorage(getStorage(), mergeConfirmDialog.loadedEntities, localVaultName || 'Vault', {}).catch(err =>
        console.warn('Failed to sync replaced vault to storage:', err)
      );
    }

    setAlertDialog({
      isOpen: true,
      title: tr('New folder loaded', 'Neuer Ordner geladen'),
      message: tr(
        `${keys.length} notes loaded. Your previous world was automatically saved as a backup under "Archive backups".`,
        `${keys.length} Notizen geladen. Deine vorherige Welt wurde automatisch unter "Archiv-Sicherungen" als Backup gespeichert.`
      ),
    });
    setMergeConfirmDialog(null);
  };

  const handleCreateLocalFolder = async () => {
    try {
      // 1. Create a backup snapshot first so current state is 100% safe
      await createSafetyZipBackup();

      let nativeSynced = false;
      try {
        const storage = getStorage();
        const success = await storage.initialize({ prompt: true });
        if (!success) return; // User cancelled
        const count = await syncFullVaultToStorage(storage, entities, storage.getName(), looseMedia);
        setIsStorageActive(true);
        setLocalVaultName(storage.getName());
        nativeSynced = true;

        setAlertDialog({
          isOpen: true,
          title: tr('Vault folder linked', 'Tresor-Ordner verknüpft'),
          message: tr(
            `Folder "${storage.getName()}" was set up on your disk and ${count} .md files were synchronised!`,
            `Ordner "${storage.getName()}" wurde erfolgreich auf deiner Festplatte eingerichtet und ${count} .md-Dateien synchronisiert!`
          ),
        });
        return;
      } catch (e: any) {
        console.info('Native directory write unavailable, falling back to instant ZIP export download:', e);
      }

      if (!nativeSynced) {
        // Fallback: Instantly compile and download all .md files as a ZIP archive directly onto user's hard drive
        const count = await exportVaultAsZip(entities, looseMedia, localVaultName || 'Welt_Lore_Tresor');
        setAlertDialog({
          isOpen: true,
          title: tr('Vault folder downloaded! 📦', 'Tresor-Ordner heruntergeladen! 📦'),
          message: tr(
            `Your vault with all ${count} notes (.md files) was downloaded straight to your disk as a ZIP archive. Unpack it and you have all your Markdown files locally.`,
            `Dein Tresor mit allen ${count} Notizen (.md-Dateien) wurde als ZIP-Ordner direkt auf deine Festplatte heruntergeladen! Du kannst die ZIP-Datei entpacken und hast alle deine Markdown-Dateien lokal vorliegen.`
          ),
        });
      }
    } catch (err: any) {
      console.error('Failed to create local folder or export zip:', err);
      setAlertDialog({
        isOpen: true,
        title: tr('Error creating folder', 'Fehler beim Erstellen'),
        message: err.message || tr('The folder could not be linked or exported.', 'Ordner konnte nicht verknüpft oder exportiert werden.'),
      });
    }
  };

  const handleReloadLocalFolder = async () => {
    if (!isStorageActive) return;
    try {
      const storage = getStorage();
      const loaded = await loadVaultFromStorage(storage);
      if (Object.keys(loaded.entities).length > 0) {
        setEntities(loaded.entities);
        runOrphanedBackupCleanup(storage, loaded.entities);
        if (loaded.looseMedia) setLooseMedia(loaded.looseMedia);

        setAlertDialog({
          isOpen: true,
          title: tr('Folder reloaded', 'Ordner neu eingelesen'),
          message: tr(
            `${Object.keys(loaded.entities).length} entries were freshly read from folder "${localVaultName}".`,
            `${Object.keys(loaded.entities).length} Einträge wurden frisch aus dem Ordner "${localVaultName}" eingelesen.`
          ),
        });
      }
    } catch (err: any) {
      console.error('Failed to reload local folder:', err);
    }
  };

  const handleSyncToLocalFolder = async () => {
    if (!isStorageActive) return;
    try {
      const storage = getStorage();
      const count = await syncFullVaultToStorage(storage, entities, localVaultName || 'Vault', looseMedia);
      setAlertDialog({
        isOpen: true,
        title: tr('Sync complete', 'Synchronisation abgeschlossen'),
        message: tr(
          `${count} files were saved successfully to folder "${localVaultName}" on your disk.`,
          `${count} Dateien wurden erfolgreich im Ordner "${localVaultName}" auf deiner Festplatte gespeichert.`
        ),
      });
    } catch (err: any) {
      console.error('Failed to sync to local folder:', err);
    }
  };

  const handleDisconnectLocalFolder = () => {
    setIsStorageActive(false);
    setLocalVaultName(null);
  };

  const handleToggleAutoSyncLocal = (enabled: boolean) => {
    setAutoSyncLocal(enabled);
    localStorage.setItem('tesserios_autosync_local', enabled ? 'true' : 'false');
  };

  return {
    localVaultName,
    mergeConfirmDialog,
    setMergeConfirmDialog,
    handleOpenRecentVault,
    handleOpenWiki,
    wikiAvailable,
    handleOpenLocalFolder,
    handleConfirmMergeVault,
    handleConfirmReplaceVault,
    handleCreateLocalFolder,
    handleReloadLocalFolder,
    handleSyncToLocalFolder,
    handleDisconnectLocalFolder,
    handleToggleAutoSyncLocal,
  };
}
