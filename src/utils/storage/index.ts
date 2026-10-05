/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { IVaultStorage } from './VaultStorage';
import { ElectronStorage } from './ElectronStorage';

let activeStorage: IVaultStorage | null = null;

export function getStorage(): IVaultStorage {
  if (activeStorage) return activeStorage;

  const electronStorage = new ElectronStorage();
  if (!electronStorage.isAvailable()) {
    throw new Error('Electron storage not available. This app requires Electron IPC bridge to function.');
  }
  
  activeStorage = electronStorage;
  return activeStorage;
}
