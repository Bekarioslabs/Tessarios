/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { LoreEntity } from '../types';

/**
 * Every entity that references this image URL, either as its main portrait or in its
 * gallery. Replaces the old approach of storing a single fixed category on the image
 * itself — an image can be linked from any number of entities of any type at once, so
 * "where does this image belong" has to be computed from those links, not stored
 * separately (which is also what silently went stale whenever an image got linked to a
 * new entity without anyone remembering to update its category field too).
 */
export function getLinkedEntities(imageUrl: string, entities: Record<string, LoreEntity>): LoreEntity[] {
  return Object.values(entities).filter(
    (e) => e.imageUrl === imageUrl || (e.galleryImageUrls || []).includes(imageUrl)
  );
}

/** The file name of an image URL; this is also what `![[…]]` embeds use to find it. */
export function mediaFileName(imageUrl: string): string {
  return imageUrl.split('/').pop() || imageUrl;
}

/**
 * Gallery images of all entries, each URL once, in entry order. The media view lists
 * main images and loose uploads itself; without these, an image that only sits in an
 * entry's gallery would be invisible there.
 */
export function getGalleryImageUrls(entities: Record<string, LoreEntity>): string[] {
  const urls = new Set<string>();
  Object.values(entities).forEach((e) => {
    (e.galleryImageUrls || []).forEach((u) => {
      if (u && u.trim()) urls.add(u);
    });
  });
  return [...urls];
}
