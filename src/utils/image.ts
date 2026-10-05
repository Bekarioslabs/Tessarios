/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { MapMarker } from '../types';

/**
 * Local storage key for image compression toggle setting
 */
const STORAGE_KEY_COMPRESS_IMAGES = 'tesserios_compress_images';

export function getImageCompressionSetting(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY_COMPRESS_IMAGES);
  return stored === null ? true : stored === 'true'; // Default is ON (true)
}

export function setImageCompressionSetting(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_COMPRESS_IMAGES, String(enabled));
  }
}

export interface CompressionOptions {
  enabled?: boolean;
  maxW?: number;
  maxH?: number;
  quality?: number;
}

/**
 * Compresses a base64 image data URL using Canvas.
 * Supports enabling/disabling, custom max dimensions (default 1920x1920) and high quality (0.88).
 * Returns original base64 URL untouched if compression is disabled.
 */
export function compressBase64Image(
  base64Str: string,
  optionsOrMaxW?: number | CompressionOptions,
  maxH = 1920,
  quality = 0.88
): Promise<string> {
  let opts: CompressionOptions = {};
  if (typeof optionsOrMaxW === 'number') {
    opts = { maxW: optionsOrMaxW, maxH, quality };
  } else if (optionsOrMaxW) {
    opts = optionsOrMaxW;
  }

  const enabled = opts.enabled ?? getImageCompressionSetting();
  const maxW = opts.maxW ?? 1920;
  const targetMaxH = opts.maxH ?? 1920;
  const targetQuality = opts.quality ?? 0.88;

  return new Promise((resolve) => {
    // If compression is disabled OR string is not a base64 data URL, resolve original string directly
    if (!enabled || !base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }

    // SVG images don't need canvas downscaling
    if (base64Str.startsWith('data:image/svg+xml')) {
      resolve(base64Str);
      return;
    }

    const isPng = base64Str.startsWith('data:image/png');
    const isWebP = base64Str.startsWith('data:image/webp');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;

        // If image is already within max dimensions and quality is high, keep original
        if (width <= maxW && height <= targetMaxH && base64Str.length < 500000) {
          resolve(base64Str);
          return;
        }

        // Calculate new dimensions keeping aspect ratio
        if (width > maxW || height > targetMaxH) {
          if (width > height) {
            height = Math.round((height * maxW) / width);
            width = maxW;
          } else {
            width = Math.round((width * targetMaxH) / height);
            height = targetMaxH;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        // Enable high quality image smoothing to prevent compression/resize artifacts
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Fill background for JPEGs/non-transparent images to avoid black artifacts
        if (!isPng && !isWebP) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        let compressedBase64 = '';
        try {
          compressedBase64 = canvas.toDataURL('image/jpeg', targetQuality);
        } catch (e) {
          console.warn('Canvas toDataURL failed, using original image', e);
        }

        if (compressedBase64 && compressedBase64.startsWith('data:image/') && compressedBase64.length > 100) {
          resolve(compressedBase64);
        } else {
          resolve(base64Str);
        }
      } catch (err) {
        console.error('Error in canvas compress:', err);
        resolve(base64Str);
      }
    };
    img.onerror = (err) => {
      console.error('Error loading image for compression:', err);
      resolve(base64Str);
    };
    img.src = base64Str;
  });
}

/**
 * Bakes map pins and marker labels directly onto a canvas image composite.
 * Returns a base64 PNG data URL of the map image with baked markers.
 */
export function bakeMarkersOntoImage(
  imageSrc: string,
  markers: MapMarker[]
): Promise<string> {
  return new Promise((resolve) => {
    if (!imageSrc || !markers || markers.length === 0) {
      resolve(imageSrc);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const width = img.naturalWidth || 1600;
        const height = img.naturalHeight || 1000;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageSrc);
          return;
        }

        // Draw Base Image
        ctx.drawImage(img, 0, 0, width, height);

        // Draw Markers
        markers.forEach((m, idx) => {
          const px = (m.x / 100) * width;
          const py = (m.y / 100) * height;

          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 3;

          const pinRadius = Math.max(12, Math.round(width * 0.012));

          // Pin body circle
          ctx.beginPath();
          ctx.arc(px, py - pinRadius, pinRadius, 0, 2 * Math.PI);
          ctx.fillStyle = m.color || '#f59e0b'; // Custom marker color or default Amber
          ctx.fill();
          ctx.lineWidth = Math.max(2, Math.round(pinRadius * 0.2));
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          // Marker number inside pin
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.round(pinRadius * 1.1)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((idx + 1).toString(), px, py - pinRadius);

          // Marker Label Badge below pin
          const fontSize = Math.max(13, Math.round(width * 0.013));
          ctx.font = `bold ${fontSize}px sans-serif`;
          const textMetrics = ctx.measureText(m.label);
          const paddingH = 8;
          const paddingV = 4;
          const boxWidth = textMetrics.width + paddingH * 2;
          const boxHeight = fontSize + paddingV * 2;
          const boxX = px - boxWidth / 2;
          const boxY = py + 6;

          // Label background pill/card
          ctx.fillStyle = 'rgba(13, 13, 18, 0.9)';
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 1.5;

          const r = 4; // corner radius
          ctx.beginPath();
          ctx.moveTo(boxX + r, boxY);
          ctx.lineTo(boxX + boxWidth - r, boxY);
          ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + r);
          ctx.lineTo(boxX + boxWidth, boxY + boxHeight - r);
          ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - r, boxY + boxHeight);
          ctx.lineTo(boxX + r, boxY + boxHeight);
          ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - r);
          ctx.lineTo(boxX, boxY + r);
          ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Text label inside pill
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(m.label, px, boxY + paddingV);

          ctx.restore();
        });

        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.error('Error baking markers onto image:', err);
        resolve(imageSrc);
      }
    };
    img.onerror = () => {
      resolve(imageSrc);
    };
    img.src = imageSrc;
  });
}

