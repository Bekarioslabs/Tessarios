/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { LoreEntity, LooseMediaAsset } from '../types';
import { serializeToMarkdown, slugify, getCategoryFolder } from './markdown';
import JSZip from 'jszip';
import { getStorage } from './storage';

/**
 * Compiles and downloads all entities and loose media as a clean ZIP archive
 */
export async function exportVaultAsZip(
  entities: Record<string, LoreEntity>,
  looseMedia?: Record<string, LooseMediaAsset>,
  vaultName: string = 'Welt_Lore_Tresor'
): Promise<number> {
  const zip = new JSZip();
  let count = 0;
  const storage = getStorage();

  const cleanLooseMedia = looseMedia ? { ...looseMedia } : undefined;

  // 1. Pack all assets from the 'assets/' folder on disk
  try {
    const assetFiles = await storage.listFiles('assets');
    for (const assetFile of assetFiles) {
      if (assetFile.startsWith('assets/')) {
        const data = await storage.readBinaryFile(assetFile);
        zip.file(assetFile, data);
      }
    }
  } catch (err) {
    console.warn('Could not read assets for zip export:', err);
  }

  // 2. Loose media metadata
  if (cleanLooseMedia && Object.keys(cleanLooseMedia).length > 0) {
    zip.file('loose_media.json', JSON.stringify(cleanLooseMedia, null, 2));
  }

  // 3. Entities
  for (const entity of Object.values(entities)) {
    if (!entity || !entity.id) continue;
    
    // Strict filename rule
    const safeTitle = slugify(entity.title || entity.id);
    const fileName = `${safeTitle}.md`;

    const categoryFolder = getCategoryFolder(entity.type);

    const markdownContent = serializeToMarkdown(entity, entity.imageUrl, entity.galleryImageUrls);
    zip.file(`${categoryFolder}/${fileName}`, markdownContent);
    count++;
  }

  // 4. Config
  zip.file(
    'vault_config.json',
    JSON.stringify(
      { vaultName, exportDate: new Date().toISOString(), entityCount: count, looseMedia: cleanLooseMedia },
      null, 2
    )
  );

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(vaultName || 'Welt_Lore_Tresor')}_export.zip`;
  a.click();
  URL.revokeObjectURL(url);

  return count;
}
