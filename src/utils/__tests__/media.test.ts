/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getGalleryImageUrls, getLinkedEntities, mediaFileName } from '../media';
import { LoreEntity } from '../../types';

/** The media view must be able to list every image an entry holds, not only its main image. */
export async function runMediaTests(): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = [];
  let passed = true;
  function assert(condition: unknown, message: string) {
    if (condition) log.push(`✅ PASS: ${message}`);
    else { log.push(`❌ FAIL: ${message}`); passed = false; }
  }

  const entity = (id: string, imageUrl?: string, galleryImageUrls?: string[]) =>
    ({ id, title: id, type: 'character', imageUrl, galleryImageUrls } as unknown as LoreEntity);

  const entities: Record<string, LoreEntity> = {
    mira: entity('mira', 'assets/Character sheet 01.jpg', ['assets/Character sheet 02.png', 'assets/Map 01.jpg']),
    board: entity('board', undefined, ['assets/Character sheet 02.png', '', '  ']),
    bay: entity('bay', 'assets/Map 01.jpg'),
  };

  const gallery = getGalleryImageUrls(entities);
  assert(gallery.includes('assets/Character sheet 02.png'), 'a gallery-only image is listed');
  assert(gallery.filter((u) => u === 'assets/Character sheet 02.png').length === 1, 'an image in two galleries is listed once');
  assert(gallery.every((u) => u.trim() !== ''), 'blank gallery entries are skipped');
  assert(getLinkedEntities('assets/Character sheet 02.png', entities).length === 2, 'both entries that hold the image are linked');
  assert(mediaFileName('assets/Character sheet 02.png') === 'Character sheet 02.png', 'the file name is what ![[…]] embeds use');

  return { success: passed, log };
}
