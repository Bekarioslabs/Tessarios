/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import { LoreEntity, EntityType } from '../types';
import { slugify } from '../utils/markdown';
import { updateMarkdownSection, extractMarkdownSection } from '../ai/engine/aiSectionExtractor';
import { saveEntityToStorage, deleteEntityFromStorage } from '../utils/vaultManager';
import { getStorage } from '../utils/storage';
import { Language, getTranslation, getTypeTranslation, DEFAULT_TEMPLATES_LOCALIZED } from '../utils/i18n';
import { ConfirmDialogState, ToastNotificationState } from './useDialogState';

/**
 * Finds a free entity id by appending "-2", "-3", ... to baseId until no collision
 * remains. Shared by entity creation and renaming, which previously kept independent
 * copies of this loop. `excludeId` lets renaming ignore the entity's own current id.
 */
function generateUniqueEntityId(
  baseId: string,
  entities: Record<string, LoreEntity>,
  excludeId?: string
): { id: string; collided: boolean; counter: number } {
  if (!entities[baseId] || baseId === excludeId) {
    return { id: baseId, collided: false, counter: 1 };
  }
  let counter = 2;
  let uniqueId = `${baseId}-${counter}`;
  while (entities[uniqueId] && uniqueId !== excludeId) {
    counter++;
    uniqueId = `${baseId}-${counter}`;
  }
  return { id: uniqueId, collided: true, counter };
}

export interface UseEntityCrudParams {
  isStorageActive: boolean;
  autoSyncLocal: boolean;
  language: Language;
  skipCreationConfirm: boolean;
  setSkipCreationConfirm: (v: boolean) => void;
  setConfirmDialog: (dialog: ConfirmDialogState | null) => void;
  setToastNotification: (toast: ToastNotificationState | null) => void;
}

/**
 * Entity state and CRUD operations — the core "chronicle" data of the app. Extracted from
 * App.tsx (Finding 5): owns entities/activeEntityId, the autosave-throttle machinery
 * (see PERSIST_INTERVAL_MS below), and every handler that creates, edits, renames,
 * deletes or imports entities.
 */
export function useEntityCrud({
  isStorageActive,
  autoSyncLocal,
  language,
  skipCreationConfirm,
  setSkipCreationConfirm,
  setConfirmDialog,
  setToastNotification,
}: UseEntityCrudParams) {
  const [entities, setEntities] = useState<Record<string, LoreEntity>>({});
  const [activeEntityId, setActiveEntityId] = useState<string>(() => {
    return localStorage.getItem('tessarios_active_entity_id') || 'archon-varis';
  });

  useEffect(() => {
    if (activeEntityId) {
      localStorage.setItem('tessarios_active_entity_id', activeEntityId);
    }
  }, [activeEntityId]);

  // Serializes all disk writes so a fast second edit can never finish writing before an
  // earlier one, which would otherwise silently overwrite the newer content with older.
  const saveLockRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const queueSave = (saveFn: () => Promise<unknown>) => {
    saveLockRef.current = saveLockRef.current
      .then(saveFn)
      .catch(err => console.warn('Speichern fehlgeschlagen:', err));
  };

  // Throttles the on-disk backup write (see writeBackup in vaultManager.ts) that follows
  // every entity edit. Typing in the editor calls handleUpdateEntity on every keystroke;
  // without this, each keystroke wrote its own backup file, so a few seconds of typing
  // burned through the entire backup history and left nothing meaningful to browse in
  // Version History. The in-memory state update stays synchronous (the textarea must
  // never lag), only the persistence side-effect is throttled.
  //
  // This is a throttle, not a debounce: the timer starts on the first edit and is never
  // reset by further edits, so continuous typing still gets a checkpoint every ~90s
  // instead of the save being pushed off indefinitely until the user pauses.
  const PERSIST_INTERVAL_MS = 90000; // checkpoint at least every 1.5 minutes
  const pendingPersistRef = React.useRef<Map<string, { timer: ReturnType<typeof setTimeout>; latestEntity: LoreEntity }>>(new Map());

  const persistNow = React.useCallback((entity: LoreEntity) => {
    if (isStorageActive && autoSyncLocal) {
      queueSave(() => saveEntityToStorage(getStorage(), entity));
    }
  }, [isStorageActive, autoSyncLocal]);

  const flushPersist = React.useCallback((entityId?: string) => {
    const map = pendingPersistRef.current;
    const ids = entityId ? [entityId] : Array.from(map.keys());
    for (const id of ids) {
      const pending = map.get(id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      map.delete(id);
      persistNow(pending.latestEntity);
    }
  }, [persistNow]);

  const schedulePersist = React.useCallback((entity: LoreEntity) => {
    const map = pendingPersistRef.current;
    const existing = map.get(entity.id);
    if (existing) {
      // A checkpoint is already scheduled — just update what gets persisted when it
      // fires, without pushing the timer back out.
      existing.latestEntity = entity;
      return;
    }
    const timer = setTimeout(() => {
      const pending = map.get(entity.id);
      map.delete(entity.id);
      if (pending) persistNow(pending.latestEntity);
    }, PERSIST_INTERVAL_MS);
    map.set(entity.id, { timer, latestEntity: entity });
  }, [persistNow]);

  // Flush immediately when leaving an entity (most common "I'm done editing this" signal)
  // and as a best-effort safety net right before the window closes.
  const prevActiveEntityIdRef = React.useRef(activeEntityId);
  useEffect(() => {
    const prevId = prevActiveEntityIdRef.current;
    if (prevId && prevId !== activeEntityId) {
      flushPersist(prevId);
    }
    prevActiveEntityIdRef.current = activeEntityId;
  }, [activeEntityId, flushPersist]);

  useEffect(() => {
    const handleBeforeUnload = () => flushPersist();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flushPersist]);

  const handleUpdateEntity = (updatedEntity: LoreEntity) => {
    setEntities(prev => {
      const updated = {
        ...prev,
        [updatedEntity.id]: updatedEntity,
      };

      return updated;
    });
    schedulePersist(updatedEntity);
  };

  const handleUpdateEntitiesBatch = (updatedMap: Record<string, LoreEntity>) => {
    setEntities(prev => {
      const updated = {
        ...prev,
        ...updatedMap,
      };

      return updated;
    });
    if (isStorageActive && autoSyncLocal) {
      Object.values(updatedMap).forEach(ent => {
        queueSave(() => saveEntityToStorage(getStorage(), ent));
      });
    }
  };

  const handleRenameEntity = (oldId: string, newTitle: string) => {
    const entity = entities[oldId];
    if (!entity) return;

    const oldTitle = entity.title;
    if (oldTitle === newTitle) return;

    let newId = slugify(newTitle);
    if (!newId) newId = oldId; // Fallback

    const { id: uniqueId } = generateUniqueEntityId(newId, entities, oldId);

    const updated = { ...entities };
    const targetEntity = { ...entity };

    // 1. Update own title, id and modify the header in its content
    targetEntity.title = newTitle;
    targetEntity.id = uniqueId;
    targetEntity.lastModified = Date.now();

    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedOldTitle = escapeRegExp(oldTitle.trim());

    // Replace own header if it matches "## Old Title" or "# Old Title" or similar
    if (targetEntity.content) {
      const headerRegex = new RegExp(`^(#+)\\s+${escapedOldTitle}$`, 'm');
      targetEntity.content = targetEntity.content.replace(headerRegex, `$1 ${newTitle}`);
    }

    // 2. Delete old reference, set new one
    if (uniqueId !== oldId) {
      if (isStorageActive) {
        deleteEntityFromStorage(getStorage(), entity);
      }
      delete updated[oldId];
    }
    updated[uniqueId] = targetEntity;

    // Matches: [[Old Title]] or [[Old Title|display]], ignoring ![[...]] images
    const wikiLinkRegex = new RegExp(`(?<!\\!)\\[\\[\\s*${escapedOldTitle}\\s*(?:\\|([^\\]]+))?\\]\\]`, 'gi');
    const replaceWikiLinks = (text: string) => {
      if (!text) return text;
      return text.replace(wikiLinkRegex, (match, display) => {
        if (display) {
          return `[[${newTitle}|${display.trim()}]]`;
        } else {
          return `[[${newTitle}]]`;
        }
      });
    };

    // 3. Propagate renaming to ALL entities (including relations, map markers, wiki links, custom fields)
    Object.keys(updated).forEach(key => {
      const current = { ...updated[key] };
      let changed = false;

      // Update relations
      if (current.relations && current.relations.length > 0) {
        const nextRelations = current.relations.map(rel => {
          if (rel.targetId === oldId) {
            changed = true;
            return { ...rel, targetId: uniqueId };
          }
          return rel;
        });
        current.relations = nextRelations;
      }

      // Update map markers
      if (current.mapMarkers && current.mapMarkers.length > 0) {
        const nextMarkers = current.mapMarkers.map(marker => {
          if (marker.targetEntityId === oldId) {
            changed = true;
            return { ...marker, targetEntityId: uniqueId };
          }
          return marker;
        });
        current.mapMarkers = nextMarkers;
      }

      // Update wiki links in content
      if (current.content) {
        const originalContent = current.content;
        current.content = replaceWikiLinks(current.content);
        if (current.content !== originalContent) {
          changed = true;
        }
      }

      // Update wiki links in custom fields
      if (current.customFields) {
        let fieldsChanged = false;
        const nextFields = { ...current.customFields };
        Object.entries(nextFields).forEach(([fKey, fVal]) => {
          if (typeof fVal === 'string') {
            if (fVal === oldId && fKey.toLowerCase().includes('id')) { // simplistic heuristic for target ids in custom fields if any exist
              nextFields[fKey] = uniqueId;
              fieldsChanged = true;
              changed = true;
            } else {
              const nextVal = replaceWikiLinks(fVal);
              if (nextVal !== fVal) {
                nextFields[fKey] = nextVal;
                fieldsChanged = true;
                changed = true;
              }
            }
          }
        });
        if (fieldsChanged) {
          current.customFields = nextFields;
        }
      }

      if (changed) {
        current.lastModified = Date.now();
        updated[key] = current;
      }
    });

    setEntities(updated);

    if (activeEntityId === oldId) {
      setActiveEntityId(uniqueId);
    }
  };

  const handleAddEntity = (
    type: EntityType,
    title: string,
    backlinkId?: string,
    templateId?: string,
    initialImageUrl?: string,
    autoOpen: boolean = true
  ) => {
    let id = slugify(title);
    if (!id) id = `entity-${Date.now()}`;

    // Generate unique ID if entity ID already exists
    const idResult = generateUniqueEntityId(id, entities);
    if (idResult.collided) {
      if (entities[id].title.trim().toLowerCase() === title.trim().toLowerCase()) {
        title = `${title} ${idResult.counter}`;
      }
      id = idResult.id;
    }

    const parentEntity = backlinkId ? entities[backlinkId] : undefined;

    const performAdd = () => {
      const templateList = DEFAULT_TEMPLATES_LOCALIZED[language];
      const template = templateId
        ? templateList.find(t => t.id === templateId)
        : templateList.find(t => t.type === type);

      const defaultDesc = language === 'en'
        ? 'Write a captivating description here...'
        : 'Hier eine fesselnde Beschreibung verfassen...';

      const relationType = language === 'en' ? 'Linked from' : 'Verlinkt von';

      const today = new Date().toISOString().split('T')[0];
      const initialFields: Record<string, string> = {
        created: today,
        lastModified: today,
        ...(template ? template.defaultFields : {})
      };
      if (!initialFields.created) initialFields.created = today;
      if (!initialFields.lastModified) initialFields.lastModified = today;

      // Smart Parent-Context Auto-fill
      if (parentEntity) {
        const isEn = language === 'en';

        // A. If parent is a Book or has a 'Buch' / 'Book' field:
        if (parentEntity.type === 'book') {
          const bookKey = isEn ? (initialFields['Book'] !== undefined ? 'Book' : 'Series') : (initialFields['Buch'] !== undefined ? 'Buch' : 'Reihe');
          initialFields[bookKey] = `[[${parentEntity.title}]]`;
        } else if (parentEntity.customFields?.['Buch'] || parentEntity.customFields?.['Book']) {
          const parentBook = parentEntity.customFields['Buch'] || parentEntity.customFields['Book'];
          if (initialFields['Buch'] !== undefined) initialFields['Buch'] = parentBook;
          if (initialFields['Book'] !== undefined) initialFields['Book'] = parentBook;
        }

        // B. If parent is a Chapter:
        if (parentEntity.type === 'chapter') {
          if (type === 'scene') {
            const chapKey = isEn ? 'Chapter' : 'Kapitel';
            initialFields[chapKey] = `[[${parentEntity.title}]]`;
          }
        }

        // C. If creating a Chapter, extract chapter number from title:
        if (type === 'chapter') {
          const numMatch = title.match(/(?:kapitel|chapter|kap\.)\s*(\d+)/i) || title.match(/^(\d+)/);
          if (numMatch) {
            if (initialFields['Kapitelnummer'] !== undefined) initialFields['Kapitelnummer'] = numMatch[1];
            if (initialFields['Chapter Number'] !== undefined) initialFields['Chapter Number'] = numMatch[1];
          }
        }

        // D. If creating a Note (type === 'note'):
        if (type === 'note') {
          const targetKey = isEn ? 'Target' : 'Ziel';
          initialFields[targetKey] = `[[${parentEntity.title}]]`;

          const lowerTitle = title.toLowerCase();
          let detectedType = isEn ? 'idea' : 'Idee';
          if (lowerTitle.startsWith('frage')) detectedType = isEn ? 'question' : 'Frage';
          else if (lowerTitle.startsWith('problem')) detectedType = isEn ? 'problem' : 'Problem';
          else if (lowerTitle.startsWith('recherche')) detectedType = isEn ? 'research' : 'Recherche';
          else if (lowerTitle.startsWith('entscheidung')) detectedType = isEn ? 'decision' : 'Entscheidung';
          else if (lowerTitle.startsWith('variante')) detectedType = isEn ? 'variant' : 'Variante';
          else if (lowerTitle.startsWith('erinnerung')) detectedType = isEn ? 'reminder' : 'Erinnerung';

          if (initialFields['Notiztyp'] !== undefined) initialFields['Notiztyp'] = detectedType;
          if (initialFields['Note Type'] !== undefined) initialFields['Note Type'] = detectedType;
        }

        // E. If creating a Visual (type === 'visual'):
        if (type === 'visual') {
          if (parentEntity.type === 'character') {
            const refObjKey = isEn ? 'Target Object' : 'Bezugsobjekt';
            initialFields[refObjKey] = `[[${parentEntity.title}]]`;
          }
          const isCostume = title.toLowerCase().includes('kostüm') || title.toLowerCase().includes('costume');
          const visualTypeKey = isEn ? 'Visual Type' : 'Visualtyp';
          initialFields[visualTypeKey] = isCostume ? (isEn ? 'Costume' : 'Kostüm') : (isEn ? 'Character' : 'Charakter');
        }
      }

      const newEntity: LoreEntity = {
        id,
        title,
        type,
        imageUrl: initialImageUrl || '',
        content: template
          ? template.defaultContent
          : defaultDesc,
        tags: template
          ? Array.from(new Set([type, ...template.defaultTags]))
          : [type],
        relations: backlinkId ? [{ targetId: backlinkId, type: relationType }] : [],
        lastModified: Date.now(),
        createdAt: Date.now(),
        customFields: initialFields,
      };

      const previousEntities = { ...entities };
      const previousActiveId = activeEntityId;

      const updated = {
        ...entities,
        [id]: newEntity,
      };
      setEntities(updated);
      if (autoOpen) {
        setActiveEntityId(id);
      }

      if (isStorageActive && autoSyncLocal) {
        queueSave(() => saveEntityToStorage(getStorage(), newEntity));
      }

      if (autoOpen) {
        setToastNotification({
          isOpen: true,
          title,
          type,
          createdEntityId: id,
          previousEntities,
          previousActiveId,
        });
      }
    };

    if (skipCreationConfirm || !autoOpen) {
      performAdd();
    } else {
      setConfirmDialog({
        isOpen: true,
        title: language === 'en' ? 'Forge New Entry' : 'Neuen Eintrag schmieden',
        message: language === 'en'
          ? `Do you really want to create a new entry named "${title}" in the category "${getTypeTranslation(type, language)}"?`
          : `Möchtest du wirklich einen neuen Eintrag mit dem Namen „${title}“ in der Kategorie „${getTypeTranslation(type, language)}“ erstellen?`,
        confirmText: language === 'en' ? 'Forge' : 'Schmieden',
        cancelText: language === 'en' ? 'Cancel' : 'Abbrechen',
        showCheckbox: true,
        checkboxLabel: language === 'en'
          ? "Don't ask again and forge automatically"
          : 'Zukünftig nicht mehr fragen und automatisch schmieden',
        onConfirm: (checked) => {
          if (checked) {
            setSkipCreationConfirm(true);
            localStorage.setItem('skip_creation_confirm', 'true');
          }
          performAdd();
          setConfirmDialog(null);
        },
        onCancel: () => setConfirmDialog(null)
      });
    }
  };

  const handleDeleteEntity = (id: string) => {
    const entity = entities[id];
    if (!entity) return;

    setConfirmDialog({
      isOpen: true,
      title: getTranslation('confirm_delete_title', language),
      message: getTranslation('confirm_delete_msg', language, { title: entity.title }),
      confirmText: getTranslation('delete', language),
      cancelText: getTranslation('cancel', language),
      onConfirm: () => {
        const updated = { ...entities };
        if (isStorageActive) {
          deleteEntityFromStorage(getStorage(), entity);
        }
        delete updated[id];
        setEntities(updated);

        // Reposition active view only if we deleted the currently active entity
        if (activeEntityId === id) {
          const keys = Object.keys(updated);
          if (keys.length > 0) {
            setActiveEntityId(keys[0]);
          } else {
            setActiveEntityId('');
          }
        }
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null)
    });
  };

  /**
   * Writes an accepted Chronikler draft into exactly one `##` section, leaving every
   * other section and the frontmatter untouched (`writePolicy: target-only`).
   * `lastModified` moves only because the write itself succeeded.
   */
  const handleApplyAISection = (
    sectionHeader: string,
    content: string,
    mode: 'replace' | 'append' = 'replace'
  ) => {
    const active = entities[activeEntityId];
    if (!active) return;

    const existing = extractMarkdownSection(active.content, sectionHeader);
    const finalContent =
      mode === 'append' && existing && existing.trim()
        ? `${existing.trim()}\n\n${content.trim()}`
        : content;

    handleUpdateEntity({
      ...active,
      content: updateMarkdownSection(active.content, sectionHeader, finalContent, 'replaceSection'),
      lastModified: Date.now(),
    });
  };

  /**
   * Writes a "tidy up this entry" result: `newContent` is the already-fully-computed
   * document (see aiTidyUp.ts's applyTidyUp) with accepted points moved out of
   * "Offene Fragen" and into their target sections. One write, one backup snapshot,
   * same as any other entity edit.
   */
  const handleApplyTidyUp = (newContent: string) => {
    const active = entities[activeEntityId];
    if (!active) return;

    handleUpdateEntity({
      ...active,
      content: newContent,
      lastModified: Date.now(),
    });
  };

  const activeEntity = entities[activeEntityId];

  return {
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
  };
}
