/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';

// Suppress benign ResizeObserver notifications loop errors common in canvas/graph libraries
const isResizeObserverError = (err: any) => {
  const msg = typeof err === 'string' ? err : err?.message || err?.reason?.message || '';
  return (
    msg.includes('ResizeObserver loop completed with undelivered notifications') ||
    msg.includes('ResizeObserver loop limit exceeded')
  );
};

const origConsoleError = console.error;
console.error = (...args: any[]) => {
  if (args.some((arg) => isResizeObserverError(arg))) {
    return;
  }
  origConsoleError(...args);
};

window.onerror = (message, source, lineno, colno, error) => {
  if (isResizeObserverError(message) || isResizeObserverError(error)) {
    return true;
  }
};

window.addEventListener(
  'error',
  (e) => {
    if (isResizeObserverError(e) || isResizeObserverError(e.message) || isResizeObserverError(e.error)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);

window.addEventListener(
  'unhandledrejection',
  (e) => {
    if (isResizeObserverError(e) || isResizeObserverError(e.reason)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

