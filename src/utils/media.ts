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
