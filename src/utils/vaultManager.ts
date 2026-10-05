/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { LoreEntity, LooseMediaAsset, Template, EntityType } from '../types';
import { serializeToMarkdown, parseFromMarkdown, slugify, toVaultUrl, fromVaultUrl, getCategoryFolder } from './markdown';
import { IVaultStorage } from './storage/VaultStorage';
import { loadCustomTemplatesFromVault } from './templateLoader';

const idToPathMap = new Map<string, string>();

/**
 * Whether the vault's filesystem treats `Ilka.md` and `ilka.md` as one file (Windows,
 * default macOS), learned the first time a path differs from the tracked one only by case.
 * Never assumed from the platform: it is observed, and reset whenever a vault is loaded.
 */
let caseInsensitiveFs: boolean | null = null;

function differsOnlyByCase(a: string | undefined, b: string | undefined): a is string {
  return !!a && !!b && a !== b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Are `a` and `b`, which differ only by letter case, the same file on disk?
 *
 * A file placed by hand as `Characters/Ilka.md` is saved by the app under the slug of its
 * title, `Characters/ilka.md`. On a case-insensitive filesystem that is the same file,
 * and treating it as "a different file already exists there" reports a collision between
 * an entry and itself. Worse, a naive fix that just overwrites would then delete the
 * "old" path afterwards, which is the only copy.
 *
 * The test is the files' contents, not the platform: if both paths read back identical
 * text they are the same file, or at worst identical copies, and treating them as one is
 * harmless. If one does not exist the names are distinct. If both exist with different
 * text they are provably different files, which is a real collision.
 */
async function isSameFileOnDisk(storage: IVaultStorage, a: string, b: string): Promise<boolean> {
  if (caseInsensitiveFs !== null) return caseInsensitiveFs;

  const [first, second] = await Promise.allSettled([storage.readFile(a), storage.readFile(b)]);
  if (first.status === 'fulfilled' && second.status === 'fulfilled' && first.value === second.value) {
    caseInsensitiveFs = true;
    return true;
  }
  if (first.status === 'fulfilled' && second.status === 'rejected') {
    caseInsensitiveFs = false;
    return false;
  }
  return false;
}

export async function loadVaultFromStorage(
  storage: IVaultStorage
): Promise<{
  entities: Record<string, LoreEntity>;
  vaultName: string;
  looseMedia?: Record<string, LooseMediaAsset>;
  customTemplates?: Template[];
}> {
  const entities: Record<string, LoreEntity> = {};
  let vaultName = 'Vault';
  let looseMedia: Record<string, LooseMediaAsset> | undefined;

  idToPathMap.clear();
  caseInsensitiveFs = null;

  const files = await storage.listFiles('');
  
  if (files.includes('vault_config.json')) {
    try {
      const configText = await storage.readFile('vault_config.json');
      const parsed = JSON.parse(configText);
      if (parsed.vaultName) vaultName = parsed.vaultName;
      if (parsed.looseMedia) looseMedia = parsed.looseMedia;
    } catch (err) {}
  }

  const existingFiles = new Set(files);

  if (files.includes('loose_media.json')) {
    try {
      const lmText = await storage.readFile('loose_media.json');
      const parsed = JSON.parse(lmText);
      if (parsed && typeof parsed === 'object') {
        looseMedia = { ...looseMedia, ...parsed };
      }
    } catch (err) {}
  }

  let looseMediaModified = false;
  if (looseMedia) {
    for (const [lmId, lmAsset] of Object.entries(looseMedia)) {
      if (lmAsset.imageUrl) {
        const cleanRel = fromVaultUrl(lmAsset.imageUrl);
        // If image is in assets/ but physical file was manually deleted from disk, remove dead entry
        if (cleanRel.startsWith('assets/') && !existingFiles.has(cleanRel)) {
          delete looseMedia[lmId];
          looseMediaModified = true;
        } else {
          looseMedia[lmId] = { ...lmAsset, imageUrl: toVaultUrl(lmAsset.imageUrl) };
        }
      }
    }
    if (looseMediaModified) {
      await saveLooseMediaToStorage(storage, looseMedia);
    }
  }

  for (const file of files) {
    if (file.endsWith('.md') && !file.includes('.tessarios/')) {
      try {
        const text = await storage.readFile(file);
        const parts = file.split('/');
        const fileName = parts[parts.length - 1];
        const fileIdNoExt = fileName.slice(0, -3);
        
        const entity = parseFromMarkdown(text, fileIdNoExt);
        if (entity && entity.id) {
          let entityModified = false;

          // If main cover image was deleted from disk, clear reference
          if (entity.imageUrl) {
            const cleanImgRel = fromVaultUrl(entity.imageUrl);
            if (cleanImgRel.startsWith('assets/') && !existingFiles.has(cleanImgRel)) {
              entity.imageUrl = undefined;
              entityModified = true;
            }
          }

          // If gallery images were deleted from disk, filter them out
          if (entity.galleryImageUrls && entity.galleryImageUrls.length > 0) {
            const initialLen = entity.galleryImageUrls.length;
            entity.galleryImageUrls = entity.galleryImageUrls.filter(gUrl => {
              const cleanGRel = fromVaultUrl(gUrl);
              return !cleanGRel.startsWith('assets/') || existingFiles.has(cleanGRel);
            });
            if (entity.galleryImageUrls.length !== initialLen) {
              entityModified = true;
            }
          }

          // Extract base64 image data in entity.imageUrl to a physical asset file
          if (entity.imageUrl && entity.imageUrl.startsWith('data:image/')) {
            try {
              const base64Str = entity.imageUrl;
              const mimeMatch = base64Str.match(/^data:image\/([a-zA-Z0-9]+);base64,/);
              const ext = mimeMatch ? (mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1]) : 'png';
              const cleanData = base64Str.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');

              const binaryStr = atob(cleanData);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }

              const assetFilename = `assets/map_${slugify(entity.title)}_${Date.now()}.${ext}`;
              await storage.writeBinaryFile(assetFilename, bytes.buffer);

              entity.imageUrl = toVaultUrl(assetFilename);
              entityModified = true;

              const lmId = 'media-' + Date.now() + '-' + slugify(entity.title);
              looseMedia = looseMedia || {};
              looseMedia[lmId] = {
                id: lmId,
                title: entity.title,
                imageUrl: toVaultUrl(assetFilename),
                createdAt: Date.now()
              };
              looseMediaModified = true;
            } catch (err) {
              console.warn('Could not extract base64 cover image to file:', err);
            }
          }

          // Extract base64 image data in mapFloors to physical asset files
          if (entity.mapFloors && entity.mapFloors.length > 0) {
            for (let idx = 0; idx < entity.mapFloors.length; idx++) {
              const floor = entity.mapFloors[idx];
              if (floor.imageUrl && floor.imageUrl.startsWith('data:image/')) {
                try {
                  const base64Str = floor.imageUrl;
                  const mimeMatch = base64Str.match(/^data:image\/([a-zA-Z0-9]+);base64,/);
                  const ext = mimeMatch ? (mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1]) : 'png';
                  const cleanData = base64Str.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');

                  const binaryStr = atob(cleanData);
                  const bytes = new Uint8Array(binaryStr.length);
                  for (let i = 0; i < binaryStr.length; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                  }

                  const floorSlug = slugify(floor.name || `floor_${idx + 1}`);
                  const assetFilename = `assets/map_${slugify(entity.title)}_${floorSlug}_${Date.now()}.${ext}`;
                  await storage.writeBinaryFile(assetFilename, bytes.buffer);

                  floor.imageUrl = toVaultUrl(assetFilename);
                  entityModified = true;

                  const lmId = 'media-' + Date.now() + '-' + idx + '-' + floorSlug;
                  looseMedia = looseMedia || {};
                  looseMedia[lmId] = {
                    id: lmId,
                    title: `${entity.title} - ${floor.name}`,
                    imageUrl: toVaultUrl(assetFilename),
                    createdAt: Date.now()
                  };
                  looseMediaModified = true;
                } catch (err) {
                  console.warn('Could not extract base64 floor image to file:', err);
                }
              }
            }
          }

          entities[entity.id] = entity;
          idToPathMap.set(entity.id, file);

          // Self-heal: missing ID or removed deleted image references
          const missingIdInText = !text.includes(`id: "${entity.id}"`) && !text.includes(`id: '${entity.id}'`) && !text.includes(`\nid: `);
          if (missingIdInText || entityModified) {
            console.info(`Self-healing entity (missing ID or removed deleted image references): ${file}`);
            const markdownContent = serializeToMarkdown(entity, entity.imageUrl, entity.galleryImageUrls);
            await storage.writeFile(file, markdownContent);
          }
        }
      } catch (err) {
        console.warn(`Could not parse markdown file ${file}:`, err);
      }
    }
  }

  const customTemplates = await loadCustomTemplatesFromVault(storage);

  return { entities, vaultName, looseMedia, customTemplates };
}

export interface SaveResult {
  success: boolean;
  collision?: boolean;
  collidingId?: string;
  proposedPath?: string;
  backupFailed?: boolean;
}

function isFileExistsError(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith('EEXIST');
}

async function findCollidingId(storage: IVaultStorage, newPath: string, entityId: string): Promise<string> {
  // Look up our map to find who owns this path
  for (const [id, path] of idToPathMap.entries()) {
    if (path === newPath && id !== entityId) return id;
  }
  // Fallback if not in map (e.g. created externally)
  try {
    const text = await storage.readFile(newPath);
    const parsed = parseFromMarkdown(text);
    if (parsed.id && parsed.id !== entityId) return parsed.id;
  } catch (e) {}
  return '';
}

/** User-configurable in Settings → Storage. Governs both how many on-disk checkpoints
 *  are kept per entity (writeBackup) and how many show up in the Version History panel
 *  (getEntityBackups), since they now read the same files — see EntityBackupSnapshot. */
const FILE_BACKUP_COUNT_KEY = 'tessarios_file_backup_count';
const DEFAULT_FILE_BACKUP_COUNT = 10;

export function getFileBackupCount(): number {
  if (typeof window === 'undefined') return DEFAULT_FILE_BACKUP_COUNT;
  const n = parseInt(localStorage.getItem(FILE_BACKUP_COUNT_KEY) || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FILE_BACKUP_COUNT;
}

export function setFileBackupCount(count: number): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(FILE_BACKUP_COUNT_KEY, String(count));
  }
}

/**
 * The backup tree mirrors the vault's own category layout — `.tessarios/backups/Characters/
 * gandalf/...` next to `Characters/gandalf.md` — so browsing backups in a file manager
 * feels like browsing the vault instead of one flat wall of entity ids.
 */
function entityBackupFolder(type: EntityType, entityId: string): string {
  return `.tessarios/backups/${getCategoryFolder(type)}/${entityId}`;
}

/** Snapshots `content` under the entity's backup folder, pruning to the most recent. */
async function writeBackup(
  storage: IVaultStorage,
  type: EntityType,
  entityId: string,
  content: string,
  suffix = ''
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFolder = entityBackupFolder(type, entityId);
  await storage.writeFile(`${backupFolder}/${timestamp}${suffix}.md`, content);

  try {
    const maxBackups = getFileBackupCount();
    const backupFiles = await storage.listFiles(backupFolder);
    if (backupFiles.length > maxBackups) {
      backupFiles.sort();
      const toDelete = backupFiles.slice(0, backupFiles.length - maxBackups);
      for (const f of toDelete) {
        await storage.deleteFile(f);
      }
    }
  } catch (pruneErr) {
    console.warn(`Could not prune old backups for "${entityId}":`, pruneErr);
  }
}

/**
 * A single on-disk checkpoint from the entity's backup folder, parsed back into
 * entity-shaped fields. Backs the "Version History" panel — this is deliberately the same
 * data `writeBackup` produces, not a separate history mechanism, so what you see there is
 * exactly what's on disk (see FILE_BACKUP_COUNT_KEY for how many are kept).
 */
export interface EntityBackupSnapshot {
  id: string; // the backup file's relative path — stable, unique, used for delete
  entityId: string;
  timestamp: number;
  title: string;
  content: string;
  customFields: Record<string, string>;
  tags: string[];
  charCount: number;
  /** Filename tag identifying why this checkpoint was written: 'deleted' (pre-delete
   *  safety backup), 'manual' (user clicked "snapshot now"), 'restore' (safety backup
   *  taken right before restoring an older version), or undefined for a regular
   *  autosave checkpoint. Left as a raw tag rather than a display string since this
   *  module doesn't know the UI's current language. */
  noteTag?: string;
}

const BACKUP_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:_([a-z-]+))?\.md$/i;

function parseBackupFilename(filename: string): { timestamp: number; noteTag?: string } | null {
  const m = filename.match(BACKUP_FILENAME_RE);
  if (!m) return null;
  const [, date, h, mi, se, ms, noteTag] = m;
  const timestamp = Date.parse(`${date}T${h}:${mi}:${se}.${ms}Z`);
  if (!Number.isFinite(timestamp)) return null;
  return { timestamp, noteTag };
}

/** Reads all backups for an entity, newest first. Unreadable/corrupt files are skipped. */
export async function getEntityBackups(
  storage: IVaultStorage,
  type: EntityType,
  entityId: string
): Promise<EntityBackupSnapshot[]> {
  const backupFolder = entityBackupFolder(type, entityId);
  let files: string[];
  try {
    files = await storage.listFiles(backupFolder);
  } catch {
    return [];
  }

  const results: EntityBackupSnapshot[] = [];
  for (const file of files) {
    const parsedName = parseBackupFilename(file.split('/').pop() || '');
    if (!parsedName) continue;
    try {
      const text = await storage.readFile(file);
      const parsed = parseFromMarkdown(text, entityId);
      results.push({
        id: file,
        entityId,
        timestamp: parsedName.timestamp,
        title: parsed.title || entityId,
        content: parsed.content || '',
        customFields: parsed.customFields || {},
        tags: parsed.tags || [],
        charCount: (parsed.content || '').length,
        noteTag: parsedName.noteTag,
      });
    } catch (e) {
      console.warn(`Could not read backup "${file}":`, e);
    }
  }

  return results.sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteEntityBackup(storage: IVaultStorage, backupId: string): Promise<void> {
  try {
    await storage.deleteFile(backupId);
  } catch (e) {
    console.warn(`Could not delete backup "${backupId}":`, e);
  }
}

/** Writes an explicit checkpoint right now (manual snapshot, pre-restore safety backup),
 *  as opposed to the automatic ones saveEntityToStorage already writes on every save. */
export async function createEntityBackupSnapshot(
  storage: IVaultStorage,
  entity: LoreEntity,
  noteTag?: string
): Promise<void> {
  if (!entity || !entity.id) return;
  const markdownContent = serializeToMarkdown(entity, entity.imageUrl, entity.galleryImageUrls);
  await writeBackup(storage, entity.type, entity.id, markdownContent, noteTag ? `_${noteTag}` : '');
}

export async function saveEntityToStorage(
  storage: IVaultStorage,
  entity: LoreEntity,
  forceOverwriteCollision = false,
  customSuffix = ''
): Promise<SaveResult> {
  if (!entity || !entity.id) return { success: false };

  let baseTitle = slugify(entity.title || entity.id);
  if (customSuffix) {
    baseTitle = `${baseTitle}-${slugify(customSuffix)}`;
  }

  const fileName = `${baseTitle}.md`;

  // A7 / B7 - Ensure category folder routing
  const categoryFolder = getCategoryFolder(entity.type);

  const newPath = `${categoryFolder}/${fileName}`;
  const oldPath = idToPathMap.get(entity.id);
  // A path that differs from the tracked one only by case is the same file on a
  // case-insensitive filesystem: save it where it already is, as the ordinary re-save it is.
  const sameFileByCase = differsOnlyByCase(oldPath, newPath) && (await isSameFileOnDisk(storage, oldPath, newPath));
  const isNewTarget = !sameFileByCase && newPath !== oldPath;
  const targetPath = sameFileByCase ? (oldPath as string) : newPath;
  const markdownContent = serializeToMarkdown(entity, entity.imageUrl, entity.galleryImageUrls);
  let backupFailed = false;

  // Same-path resave (the common "just editing" case): back up the pre-change content
  // BEFORE overwriting — reading it any later would just return what we're about to write.
  if (!isNewTarget && oldPath) {
    try {
      const currentText = await storage.readFile(oldPath);
      await writeBackup(storage, entity.type, entity.id, currentText);
    } catch (e) {
      backupFailed = true;
      console.warn(`Pre-change backup failed for "${entity.id}":`, e);
    }
  }

  if (isNewTarget && !forceOverwriteCollision) {
    // Atomic collision check: attempt an exclusive create instead of "list files, then
    // write" — that older pattern left a window between the check and the write where
    // another save (or an externally created file) could land at `newPath` unnoticed.
    try {
      await storage.writeFile(targetPath, markdownContent, true);
    } catch (e) {
      if (!isFileExistsError(e)) throw e;
      const collidingId = await findCollidingId(storage, newPath, entity.id);
      return { success: false, collision: true, collidingId, proposedPath: newPath };
    }
  } else {
    // Resaving to the same path we already own, or an explicit forced overwrite —
    // no collision is possible/relevant, a plain overwrite is correct.
    await storage.writeFile(targetPath, markdownContent);
  }

  // New target (rename or brand-new save): back up oldPath's untouched content now that
  // the new file is safely written. oldPath is a distinct file from newPath here, so
  // reading it only after a successful write (rather than before) avoids ever producing
  // a wasted backup when the collision attempt above fails.
  if (isNewTarget && oldPath) {
    try {
      const currentText = await storage.readFile(oldPath);
      await writeBackup(storage, entity.type, entity.id, currentText);
    } catch (e) {
      backupFailed = true;
      console.warn(`Pre-change backup failed for "${entity.id}":`, e);
    }
  }

  // Clean up old file if renamed — but never the file we just wrote. For a case-only
  // difference, if the old path now reads back exactly what was written to the new one, they
  // are one file and deleting "the old one" would delete the only copy. This is the guard
  // for the forced-overwrite path, which skips the collision check that would catch it.
  if (isNewTarget && oldPath && oldPath !== newPath) {
    let sameFileJustWritten = false;
    if (differsOnlyByCase(oldPath, newPath)) {
      sameFileJustWritten = (await storage.readFile(oldPath).catch(() => null)) === markdownContent;
      if (sameFileJustWritten) caseInsensitiveFs = true;
    }
    if (!sameFileJustWritten) {
      try {
        await storage.deleteFile(oldPath);
      } catch (err) {}
    }
  }

  // Update map
  idToPathMap.set(entity.id, targetPath);

  return { success: true, backupFailed: backupFailed || undefined };
}

export async function deleteEntityFromStorage(
  storage: IVaultStorage,
  entity: LoreEntity
): Promise<void> {
  if (!entity || !entity.id) return;
  const path = idToPathMap.get(entity.id);
  if (!path) return;
  
  // Pre-delete backup (B9) — reuses the same helper (and per-entity cap) as edit backups,
  // so a delete-recreate-delete cycle on the same id can't accumulate unbounded files.
  try {
    const currentText = await storage.readFile(path);
    await writeBackup(storage, entity.type, entity.id, currentText, '_deleted');
  } catch (e) {
    console.warn(`Pre-delete backup failed for "${entity.id}" — proceeding to delete WITHOUT a safety backup:`, e);
  }

  try {
    await storage.deleteFile(path);
    idToPathMap.delete(entity.id);
  } catch (err) {
    console.warn(`Could not delete file ${path}:`, err);
  }
}

const ORPHAN_RETENTION_DAYS_KEY = 'tessarios_orphan_retention_days';
const DEFAULT_ORPHAN_RETENTION_DAYS = 30;

export function getOrphanRetentionDays(): number {
  if (typeof window === 'undefined') return DEFAULT_ORPHAN_RETENTION_DAYS;
  const n = parseInt(localStorage.getItem(ORPHAN_RETENTION_DAYS_KEY) || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ORPHAN_RETENTION_DAYS;
}

export function setOrphanRetentionDays(days: number): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ORPHAN_RETENTION_DAYS_KEY, String(days));
  }
}

/**
 * Removes per-entity backup folders whose entity no longer exists in this vault (i.e. it
 * was deleted) and whose most recent backup file is older than the configured retention
 * period (Settings → Storage, default 30 days). The newest file's timestamp reliably marks
 * deletion time, since deleteEntityFromStorage always writes one final "_deleted" backup
 * right before removing the entity's own file.
 */
export async function purgeOrphanedBackups(
  storage: IVaultStorage,
  activeEntityIds: Set<string>
): Promise<void> {
  let allFiles: string[];
  try {
    allFiles = await storage.listFiles('.tessarios/backups');
  } catch {
    return;
  }

  const byEntity = new Map<string, string[]>();
  for (const file of allFiles) {
    // .tessarios/backups/<Category>/<entityId>/<timestamp>[_tag].md
    const parts = file.split('/');
    const idx = parts.indexOf('backups');
    if (idx === -1 || idx + 3 >= parts.length) continue;
    // Loose-media backups live at .tessarios/backups/media/<id>/ — same depth as a
    // category, but they aren't entities and are pruned independently on delete.
    if (parts[idx + 1] === 'media') continue;
    const entityId = parts[idx + 2];
    if (!byEntity.has(entityId)) byEntity.set(entityId, []);
    byEntity.get(entityId)!.push(file);
  }

  // Encoded the same way filenames are (see writeBackup), so a plain string comparison
  // against a filename's timestamp segment is equivalent to a real date comparison.
  const cutoff = new Date(Date.now() - getOrphanRetentionDays() * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/[:.]/g, '-');

  for (const [entityId, files] of byEntity) {
    if (activeEntityIds.has(entityId)) continue; // entity still exists — not orphaned

    files.sort();
    const newestFile = files[files.length - 1].split('/').pop() || '';
    if (newestFile < cutoff) {
      for (const f of files) {
        try { await storage.deleteFile(f); } catch {}
      }
    }
  }
}

export async function syncFullVaultToStorage(
  storage: IVaultStorage,
  entities: Record<string, LoreEntity>,
  vaultName: string,
  looseMedia?: Record<string, LooseMediaAsset>
): Promise<number> {
  let count = 0;
  
  for (const entity of Object.values(entities)) {
    if (!entity || !entity.id) continue;
    await saveEntityToStorage(storage, entity, true);
    count++;
  }
  
  const cleanLooseMedia = looseMedia ? { ...looseMedia } : undefined;
  if (cleanLooseMedia) {
    for (const [lmId, lmAsset] of Object.entries(cleanLooseMedia)) {
      if (lmAsset.imageUrl) {
        cleanLooseMedia[lmId] = { ...lmAsset, imageUrl: lmAsset.imageUrl.replace('vault://', '') };
      }
    }
  }
  
  try {
    await storage.writeFile(
      'vault_config.json',
      JSON.stringify(
        { vaultName, lastExported: Date.now(), entityCount: count, looseMedia: cleanLooseMedia },
        null, 2
      )
    );
  } catch (err) {}

  if (looseMedia) {
    try {
      await saveLooseMediaToStorage(storage, looseMedia);
    } catch (err) {}
  }

  return count;
}

export async function saveLooseMediaToStorage(
  storage: IVaultStorage,
  looseMedia: Record<string, LooseMediaAsset>
) {
  const cleanLooseMedia = Object.fromEntries(
    Object.entries(looseMedia)
      .filter(([_, media]) => !media.imageUrl.startsWith('data:'))
      .map(([id, media]) => [
        id,
        {
          ...media,
          imageUrl: fromVaultUrl(media.imageUrl)
        }
      ])
  );
  if (Object.keys(cleanLooseMedia).length > 0) {
    try {
      await storage.writeFile('loose_media.json', JSON.stringify(cleanLooseMedia, null, 2));
    } catch (err) {}
  }
}
