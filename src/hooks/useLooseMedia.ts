/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { LooseMediaAsset } from '../types';
import { getStorage } from '../utils/storage';
import { saveLooseMediaToStorage } from '../utils/vaultManager';

/**
 * Loose media assets (images not attached to a specific entity — the media library).
 * Extracted from App.tsx (Finding 5). Needs isStorageActive/autoSyncLocal to decide
 * whether to persist to disk; those stay in App.tsx since useVaultStorage also needs
 * them and neither hook exclusively owns that concept.
 */
export function useLooseMedia(isStorageActive: boolean, autoSyncLocal: boolean) {
  const [looseMedia, setLooseMedia] = useState<Record<string, LooseMediaAsset>>({});

  const saveLooseMedia = (updated: Record<string, LooseMediaAsset>) => {
    setLooseMedia(updated);
    if (isStorageActive && autoSyncLocal) {
      saveLooseMediaToStorage(getStorage(), updated).catch(err =>
        console.warn('Failed to sync loose media to storage', err)
      );
    }
  };

  const handleAddLooseMedia = (asset: LooseMediaAsset) => {
    const updated = {
      ...looseMedia,
      [asset.id]: asset
    };
    saveLooseMedia(updated);
  };

  const handleDeleteLooseMedia = async (id: string) => {
    const asset = looseMedia[id];

    // Backup and physical deletion
    if (asset && asset.imageUrl.startsWith('vault://')) {
      try {
        const storage = getStorage();
        const relPath = asset.imageUrl.replace('vault://', '');

        // 1. Create a backup first
        try {
          const fileData = await storage.readBinaryFile(relPath);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const ext = relPath.substring(relPath.lastIndexOf('.'));
          const backupFolder = `.tessarios/backups/media/${id}`;
          const backupPath = `${backupFolder}/${timestamp}_deleted${ext}`;
          await storage.writeBinaryFile(backupPath, fileData);

          // Prune old deleted media backups to keep only 3 most recent
          try {
            const backupFiles = await storage.listFiles(backupFolder);
            if (backupFiles.length > 3) {
              backupFiles.sort();
              const toDelete = backupFiles.slice(0, backupFiles.length - 3);
              for (const f of toDelete) {
                await storage.deleteFile(f);
              }
            }
          } catch (pruneErr) {}
        } catch (backupErr) {
          console.warn('Could not backup loose media before deletion:', backupErr);
        }

        // 2. Delete the physical file
        await storage.deleteFile(relPath);
      } catch (e) {
        console.error("Failed to delete physical media file", e);
      }
    }

    const updated = { ...looseMedia };
    delete updated[id];
    saveLooseMedia(updated);
  };

  return {
    looseMedia,
    setLooseMedia,
    saveLooseMedia,
    handleAddLooseMedia,
    handleDeleteLooseMedia,
  };
}
