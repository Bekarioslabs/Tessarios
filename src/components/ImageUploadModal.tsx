/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import { Upload, X, FileImage, Image as ImageIcon, Check } from 'lucide-react';
import { Language } from '../utils/i18n';
import { LoreEntity } from '../types';
import { compressBase64Image, getImageCompressionSetting } from '../utils/image';
import { getStorage } from '../utils/storage';

export type UploadMode = 'loose' | 'active';

export interface ImageUploadResult {
  url: string;
  title: string;
  mode: UploadMode;
}

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: File | null;
  base64DataUrl?: string; // Optional if already read
  activeEntity: LoreEntity | null;
  language: Language;
  onUploadComplete: (result: ImageUploadResult) => void;
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  isOpen,
  onClose,
  file,
  base64DataUrl,
  activeEntity,
  language,
  onUploadComplete
}) => {
  const [rawImageDataUrl, setRawImageDataUrl] = useState<string>('');
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [isCompressed, setIsCompressed] = useState<boolean>(true);
  const [defaultTitle, setDefaultTitle] = useState<string>('');
  const [newAssetTitle, setNewAssetTitle] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<UploadMode>('loose');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      // Reset state on open
      setUploadMode('loose');
      setIsProcessing(false);

      const compressDefault = getImageCompressionSetting();
      setIsCompressed(compressDefault);

      const processFile = async (dataUrl: string, name: string) => {
        setRawImageDataUrl(dataUrl);
        const compressed = await compressBase64Image(dataUrl, { enabled: compressDefault });
        setImageDataUrl(compressed);

        const cleanName = name ? name.replace(/\.[^/.]+$/, '') : (language === 'en' ? 'Image' : 'Bild');
        setDefaultTitle(cleanName);
        setNewAssetTitle(cleanName);
      };

      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            processFile(reader.result, file.name);
          }
        };
        reader.readAsDataURL(file);
      } else if (base64DataUrl) {
        processFile(base64DataUrl, `Zwischenablage_${Date.now()}`);
      }
    }
  }, [isOpen, file, base64DataUrl, language]);

  const handleToggleUploadCompression = async (shouldCompress: boolean) => {
    const newImageDataUrl = shouldCompress
      ? await compressBase64Image(rawImageDataUrl, { enabled: true })
      : rawImageDataUrl;

    setImageDataUrl(newImageDataUrl);
    setIsCompressed(shouldCompress);
  };

  const handleConfirmUpload = async () => {
    if (!imageDataUrl || isProcessing) return;
    setIsProcessing(true);

    const finalTitle = newAssetTitle.trim() || defaultTitle;
    const safeName = finalTitle.replace(/[\\/:*?"<>|]/g, '_').trim() || 'image';
    
    // Determine extension from MIME type
    let ext = '.png';
    if (imageDataUrl.startsWith('data:image/jpeg')) ext = '.jpg';
    else if (imageDataUrl.startsWith('data:image/webp')) ext = '.webp';
    else if (imageDataUrl.startsWith('data:image/svg')) ext = '.svg';
    else if (imageDataUrl.startsWith('data:image/gif')) ext = '.gif';
    
    let filename = `${safeName}${ext}`;
    let assetPath = `assets/${filename}`;

    const storage = getStorage();
    try {
      const existingAssets = await storage.listFiles('assets');
      if (existingAssets.includes(assetPath) || existingAssets.includes(filename)) {
        const confirmOverwrite = window.confirm(
          language === 'en'
            ? `A file named "${filename}" already exists in the assets folder. Do you want to overwrite it? Cancel to choose a different title.`
            : `Eine Datei namens "${filename}" existiert bereits im Ordner "assets". Möchtest du sie überschreiben? Abbrechen um einen anderen Namen zu wählen.`
        );
        if (!confirmOverwrite) {
           setIsProcessing(false);
           return;
        }
      }
    } catch (e) {
      console.warn("Could not list assets for collision check", e);
    }

    const b64Data = imageDataUrl.split(',')[1];
    if (b64Data) {
      const binary = atob(b64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
      }
      try {
        await storage.writeBinaryFile(assetPath, bytes.buffer);
      } catch (e) {
        console.error("Failed to write image to storage", e);
      }
    }

    const finalImageUrl = `vault://${assetPath}`;

    onUploadComplete({
      url: finalImageUrl,
      title: finalTitle,
      mode: uploadMode,
    });
    
    setIsProcessing(false);
    onClose();
  };

  if (!isOpen || !rawImageDataUrl) return null;

  return (
    <div className="absolute inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-elevated border border-line rounded-xl p-4 w-full max-w-sm flex flex-col gap-3.5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-line/80 pb-2.5">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-indigo-400" />
            <span className="text-xs font-mono font-bold text-ink-bright">
              {language === 'en' ? 'Add Image' : 'Bild hochladen & speichern'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink p-1 rounded hover:bg-surface-hover/60 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Image Preview & Category */}
        <div className="flex gap-3 items-center bg-surface-base p-2 rounded-lg border border-line">
          <img
            src={imageDataUrl}
            alt={language === 'en' ? 'Preview' : 'Vorschau'}
            className="w-16 h-16 object-cover rounded border border-line flex-shrink-0"
          />
          <div className="flex flex-col text-[11px] font-mono text-ink-secondary overflow-hidden flex-1">
            <span className="text-indigo-300 font-semibold truncate">
              {defaultTitle}
            </span>
            <span className="text-[9px] text-indigo-400/80 font-semibold mt-1">
              {isCompressed ? '1920px High-Quality' : 'Unkomprimiertes Original'}
            </span>
          </div>
        </div>

        {/* Compression Toggle Checkbox */}
        <label className="flex items-center gap-2.5 p-2 bg-surface-base rounded-lg border border-line/80 hover:border-line-strong cursor-pointer transition">
          <input
            type="checkbox"
            checked={isCompressed}
            onChange={(e) => handleToggleUploadCompression(e.target.checked)}
            className="accent-indigo-500 rounded cursor-pointer h-3.5 w-3.5"
          />
          <div className="flex flex-col font-mono">
            <span className="text-[11px] font-semibold text-ink-bright">
              {language === 'en' ? 'Compress image (1920px)' : 'Bild komprimieren (1920px)'}
            </span>
            <span className="text-[9px] text-ink-muted">
              {isCompressed
                ? (language === 'en' ? 'High-quality optimization without artifacts' : 'High-Quality Optimierung ohne sichtbare Artefakte')
                : (language === 'en' ? 'Uncompressed raw original size' : 'Unkomprimierte Originalgröße')}
            </span>
          </div>
        </label>

        {/* Destination Selection */}
        <div className="flex flex-col gap-2 font-mono text-xs">
          <label className="text-[11px] text-ink font-semibold">
            {language === 'en' ? 'Storage Mode:' : 'Speicher-Option:'}
          </label>

          {/* Option 1: Loose Image */}
          <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-surface-control/90 border border-indigo-500/40">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="uploadMode"
                checked={uploadMode === 'loose'}
                onChange={() => setUploadMode('loose')}
                className="mt-0.5 accent-indigo-500"
              />
              <div className="flex flex-col text-[11px]">
                <span className="text-indigo-300 font-semibold flex items-center gap-1">
                  <FileImage className="h-3 w-3" />
                  {language === 'en' ? 'Save as Loose Image Asset' : 'In Bilder-Bibliothek speichern'}
                </span>
                <span className="text-ink-secondary text-[10px] leading-tight mt-0.5">
                  {language === 'en'
                    ? 'Saved for reuse — link it to entries afterwards from the Media panel.'
                    : 'Wird zur Wiederverwendung gespeichert — danach über die Medien-Ansicht mit Einträgen verlinken.'}
                </span>
              </div>
            </label>
          </div>

          {/* Option 2: Active entity portrait image (if active) */}
          {activeEntity && (
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface-control/60 border border-line cursor-pointer hover:bg-surface-hover transition">
              <input
                type="radio"
                name="uploadMode"
                checked={uploadMode === 'active'}
                onChange={() => setUploadMode('active')}
                className="mt-0.5 accent-indigo-500"
              />
              <div className="flex flex-col text-[11px]">
                <span className="text-ink-bright font-semibold flex items-center gap-1">
                  <ImageIcon className="h-3 w-3 text-amber-400" />
                  {language === 'en' ? 'Set as Main Image for Open Sheet' : 'Als Hauptbild für geöffnetes Dossier setzen'}
                </span>
                <span className="text-ink-secondary text-[10px] truncate mt-0.5">
                  „{activeEntity.title}“
                </span>
              </div>
            </label>
          )}
        </div>

        {/* Title / Name Input */}
        <div className="flex flex-col gap-1 font-mono text-xs pt-1">
          <label className="text-[10px] text-ink-secondary">
            {language === 'en' ? 'Image Title (for ![[Title]] link):' : 'Name des Bildes (für ![[Name]] Verknüpfung):'}
          </label>
          <input
            type="text"
            value={newAssetTitle}
            onChange={(e) => setNewAssetTitle(e.target.value)}
            placeholder={language === 'en' ? 'Image title...' : 'Name des Bildes...'}
            className="w-full bg-black border border-line-strong rounded px-2.5 py-1.5 text-xs text-ink-heading outline-none focus:border-indigo-500 shadow-inner"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirmUpload();
              }
            }}
          />
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/80">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-surface-hover hover:bg-surface-hover text-ink-secondary text-xs font-mono transition cursor-pointer"
          >
            {language === 'en' ? 'Cancel' : 'Abbrechen'}
          </button>
          <button
            type="button"
            onClick={handleConfirmUpload}
            disabled={isProcessing}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold transition shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isProcessing ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            {language === 'en' ? 'Confirm & Save' : 'Speichern & Übernehmen'}
          </button>
        </div>
      </div>
    </div>
  );
};
