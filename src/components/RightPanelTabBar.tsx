/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React from 'react';
import { Bot, Image as ImageIcon, BarChart3 } from 'lucide-react';
import { Language } from '../utils/i18n';
import CollapseToggle from './ui/CollapseToggle';

export type RightPanelTab = 'ai' | 'media' | 'stats';

interface RightPanelTabBarProps {
  rightPanelTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  language: Language;
  onToggleCollapse?: () => void;
}

/** Shared switcher header for the right-hand panel (AI Chronicler / Media / Statistics) —
 *  previously hand-copied identically into all three panel views. */
export const RightPanelTabBar: React.FC<RightPanelTabBarProps> = ({
  rightPanelTab,
  onTabChange,
  language,
  onToggleCollapse,
}) => {
  return (
    <div className="px-3 py-2.5 bg-surface-card border-b border-line/80 flex items-center justify-between gap-2 shrink-0">
      <div className="flex bg-surface-base rounded-lg p-0.5 border border-line/80 flex-1 min-w-0">
        <button
          onClick={() => onTabChange('ai')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono transition cursor-pointer ${
            rightPanelTab === 'ai'
              ? 'bg-indigo-600 text-white font-semibold shadow-[0_0_8px_rgba(0,96,229,0.3)]'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Bot className="h-3 w-3" />
          <span>{language === 'en' ? 'AI Chronicler' : 'KI-Chronist'}</span>
        </button>
        <button
          onClick={() => onTabChange('media')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono transition cursor-pointer ${
            rightPanelTab === 'media'
              ? 'bg-indigo-600 text-white font-semibold shadow-[0_0_8px_rgba(0,96,229,0.3)]'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <ImageIcon className="h-3 w-3" />
          <span>{language === 'en' ? 'Media' : 'Medien'}</span>
        </button>
        <button
          onClick={() => onTabChange('stats')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono transition cursor-pointer ${
            rightPanelTab === 'stats'
              ? 'bg-indigo-600 text-white font-semibold shadow-[0_0_8px_rgba(0,96,229,0.3)]'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <BarChart3 className="h-3 w-3" />
          <span>{language === 'en' ? 'Statistics' : 'Statistiken'}</span>
        </button>
      </div>

      {onToggleCollapse && (
        <CollapseToggle
          collapsed={false}
          onToggle={onToggleCollapse}
          direction="horizontal-right"
          titleExpand=""
          titleCollapse={language === 'en' ? 'Collapse Right Panel' : 'Rechte Leiste einklappen'}
        />
      )}
    </div>
  );
};

export default RightPanelTabBar;
