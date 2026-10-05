/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React from 'react';
import darkLogoUrl from '../logo/TESSARIOS_DARK.svg';
import lightLogoUrl from '../logo/TESSARIOS_LIGHT.svg';

interface LogoProps {
  className?: string;
  size?: number | string;
  showGlow?: boolean;
  mode?: 'dark' | 'light' | 'auto';
}

export default function Logo({ 
  className = '', 
  size = 32, 
  showGlow = true,
  mode = 'auto'
}: LogoProps) {
  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <div 
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: dimension, height: dimension }}
    >
      {showGlow && (
        <div 
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/20 via-indigo-600/30 to-purple-600/20 blur-md -z-10"
        />
      )}
      {/* Dark Logo */}
      <img
        src={darkLogoUrl}
        alt="Tessarios"
        className={`w-full h-full object-contain ${
          mode === 'light' ? 'hidden' : mode === 'dark' ? 'block' : 'block light-mode:hidden'
        }`}
      />
      {/* Light Logo */}
      <img
        src={lightLogoUrl}
        alt="Tessarios"
        className={`w-full h-full object-contain ${
          mode === 'dark' ? 'hidden' : mode === 'light' ? 'block' : 'hidden light-mode:block'
        }`}
      />
    </div>
  );
}
