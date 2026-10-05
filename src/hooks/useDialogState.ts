/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState, useEffect } from 'react';
import { EntityType, LoreEntity } from '../types';

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  showCheckbox?: boolean;
  checkboxLabel?: string;
  onConfirm: (checked?: boolean) => void;
  onCancel?: () => void;
}

export interface AlertDialogState {
  isOpen: boolean;
  title: string;
  message: string;
}

export interface ToastNotificationState {
  isOpen: boolean;
  title: string;
  type: EntityType;
  createdEntityId: string;
  previousEntities: Record<string, LoreEntity>;
  previousActiveId: string;
}

/**
 * The generic confirm/alert/toast dialog primitives used across the app — entity
 * creation confirmation, delete confirmation, vault-load alerts, the "entity created"
 * undo toast, and the "don't ask again" preference for creation confirmations.
 * Extracted from App.tsx (Finding 5): these have no dependency on vault or entity state,
 * they're just presentation-layer plumbing that many handlers elsewhere reach into.
 */
export function useDialogState() {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [alertDialog, setAlertDialog] = useState<AlertDialogState | null>(null);

  const [skipCreationConfirm, setSkipCreationConfirm] = useState<boolean>(() => {
    return localStorage.getItem('skip_creation_confirm') === 'true';
  });

  const [toastNotification, setToastNotification] = useState<ToastNotificationState | null>(null);

  useEffect(() => {
    if (toastNotification?.isOpen) {
      const timer = setTimeout(() => {
        setToastNotification(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [toastNotification]);

  return {
    confirmDialog,
    setConfirmDialog,
    alertDialog,
    setAlertDialog,
    skipCreationConfirm,
    setSkipCreationConfirm,
    toastNotification,
    setToastNotification,
  };
}
