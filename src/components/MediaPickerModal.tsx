/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState } from 'react';
import { Search, Image as ImageIcon, Folder } from 'lucide-react';
import { LooseMediaAsset, LoreEntity } from '../types';
import { getTypeTranslation } from '../utils/i18n';
import { getLinkedEntities } from '../utils/media';
import { BaseModal } from './BaseModal';

export interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  looseMedia?: Record<string, LooseMediaAsset>;
  entities?: Record<string, LoreEntity>;
  language: 'de' | 'en';
  onSelectImage: (imageUrl: string) => void;
  title?: string;
}

export default function MediaPickerModal({
  isOpen,
  onClose,
  looseMedia = {},
  entities = {},
  language,
  onSelectImage,
  title
}: MediaPickerModalProps) {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Compile list of all available images across loose media & entities, each annotated
  // with which entries actually link to it (an image can belong to several at once —
  // there's no single fixed category to filter by anymore).
  const allImages: Array<{ id: string; title: string; imageUrl: string; linkedEntities: LoreEntity[] }> = [];

  Object.values(looseMedia || {}).forEach((m: LooseMediaAsset) => {
    if (!m || !m.imageUrl) return;
    allImages.push({
      id: m.id,
      title: m.title,
      imageUrl: m.imageUrl,
      linkedEntities: getLinkedEntities(m.imageUrl, entities)
    });
  });

  Object.values(entities || {}).forEach((e: LoreEntity) => {
    if (!e || !e.imageUrl) return;
    // Avoid duplicate URLs if already in loose media
    if (!allImages.some(img => img.imageUrl === e.imageUrl)) {
      allImages.push({
        id: `entity-img-${e.id}`,
        title: e.title,
        imageUrl: e.imageUrl,
        linkedEntities: getLinkedEntities(e.imageUrl, entities)
      });
    }
  });

  const term = searchTerm.toLowerCase().trim();
  const filteredImages = allImages.filter(img =>
    !term || img.title.toLowerCase().includes(term) || img.imageUrl.toLowerCase().includes(term)
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      icon={<ImageIcon className="h-4 w-4" />}
      title={title || (language === 'en' ? 'Select Image from Media Library' : 'Bild aus Medien-Bibliothek wählen')}
      maxWidth="2xl"
      height="max-h-[85vh]"
    >
      {/* Search Bar */}
      <div className="flex shrink-0 mb-3">
        <div className="relative flex-1 flex items-center bg-surface-base border border-line rounded px-2.5 py-1">
          <Search className="h-3.5 w-3.5 text-ink-muted mr-2 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={language === 'en' ? 'Search images...' : 'Bilder suchen...'}
            className="w-full bg-transparent text-xs text-ink-bright outline-none font-mono placeholder:text-ink-faint"
          />
        </div>
      </div>

      {/* Image Grid */}
      {filteredImages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center py-12 text-ink-faint font-mono text-xs text-center">
          <Folder className="h-8 w-8 mb-2 opacity-50 text-indigo-400" />
          <span>{language === 'en' ? 'No images found.' : 'Keine passenden Bilder gefunden.'}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredImages.map((img) => (
            <div
              key={img.id}
              onClick={() => {
                onSelectImage(img.imageUrl);
                onClose();
              }}
              className="group relative bg-surface-base border border-line hover:border-indigo-500 rounded-lg overflow-hidden cursor-pointer transition flex flex-col aspect-square"
            >
              <img
                src={img.imageUrl}
                alt={img.title}
                className="w-full flex-1 object-cover"
              />
              <div className="p-1.5 bg-surface-base border-t border-line-subtle flex items-center justify-between gap-1">
                <span className="text-[10px] font-mono text-ink truncate font-medium group-hover:text-indigo-300">
                  {img.title}
                </span>
                <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-indigo-950 text-indigo-400 border border-indigo-900/60 uppercase shrink-0">
                  {img.linkedEntities.length > 0
                    ? getTypeTranslation(img.linkedEntities[0].type, language)
                    : (language === 'en' ? 'Unlinked' : 'Unverlinkt')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </BaseModal>
  );
}
