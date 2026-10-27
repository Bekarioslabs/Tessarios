/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React from 'react';
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react';
import Logo from './Logo';
import { getInitialLanguage } from '../utils/i18n';

interface ErrorBoundaryState {
  error: Error | null;
  copied: boolean;
}

/**
 * Top-level render-error catch. Without this, any uncaught error in the component tree
 * unmounts React entirely and leaves a blank white window — the worst possible moment for
 * an app that holds someone's whole writing vault, since it reads as "my work is gone."
 * The vault on disk is untouched by a render crash; this screen exists to say so.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  handleCopyDetails = () => {
    const { error } = this.state;
    if (!error) return;
    const details = `${error.name}: ${error.message}\n\n${error.stack || ''}`;
    navigator.clipboard.writeText(details).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    const isEn = getInitialLanguage() === 'en';

    return (
      <div className="h-screen w-screen bg-surface-base text-ink flex items-center justify-center p-6 font-mono">
        <div className="max-w-md w-full flex flex-col items-center text-center gap-5">
          <Logo size={48} showGlow={true} mode="dark" />

          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            <h1 className="text-sm font-bold uppercase tracking-wider text-ink-heading">
              {isEn ? 'Display Error' : 'Anzeigefehler'}
            </h1>
          </div>

          <p className="text-xs text-ink-secondary leading-relaxed">
            {isEn
              ? 'Tessarios ran into a rendering error and had to stop. Your vault on disk was not touched — none of your chronicles or manuscripts were changed or deleted.'
              : 'Tessarios ist auf einen Anzeigefehler gestoßen und musste anhalten. Dein Tresor auf der Festplatte wurde dabei nicht angerührt — keine deiner Chroniken oder Manuskripte wurden verändert oder gelöscht.'}
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-[0_0_12px_rgba(0,96,229,0.3)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {isEn ? 'Reload Tessarios' : 'Tessarios neu laden'}
          </button>

          <details className="w-full text-left mt-2">
            <summary className="text-[10px] text-ink-faint cursor-pointer hover:text-ink-secondary transition select-none">
              {isEn ? 'Technical details' : 'Technische Details'}
            </summary>
            <div className="mt-2 p-3 bg-surface-card border border-line rounded-lg flex flex-col gap-2">
              <pre className="text-[10px] text-ink-muted whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {error.name}: {error.message}
              </pre>
              <button
                type="button"
                onClick={this.handleCopyDetails}
                className="self-start flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied
                  ? (isEn ? 'Copied' : 'Kopiert')
                  : (isEn ? 'Copy error details' : 'Fehlerdetails kopieren')}
              </button>
            </div>
          </details>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
