/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { IVaultStorage } from './VaultStorage';

export class ElectronStorage implements IVaultStorage {
  private _name = 'Electron Vault';

  getName(): string {
    return this._name;
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && (window as any).vault !== undefined;
  }

  async initialize(options?: any): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const success = await (window as any).vault.initialize(options);
    if (success) {
      this._name = await (window as any).vault.getName();
    }
    return success;
  }

  async getPath(): Promise<string> {
    if (!this.isAvailable()) return '';
    return (window as any).vault.getPath();
  }

  async readFile(path: string): Promise<string> {
    if (!this.isAvailable()) throw new Error('Electron storage not available');
    return (window as any).vault.readFile(path);
  }

  async readBinaryFile(path: string): Promise<ArrayBuffer> {
    if (!this.isAvailable()) throw new Error('Electron storage not available');
    return (window as any).vault.readBinaryFile(path);
  }

  async writeFile(path: string, content: string, exclusive?: boolean): Promise<void> {
    if (!this.isAvailable()) throw new Error('Electron storage not available');
    return (window as any).vault.writeFile(path, content, exclusive);
  }

  async writeBinaryFile(path: string, content: ArrayBuffer): Promise<void> {
    if (!this.isAvailable()) throw new Error('Electron storage not available');
    return (window as any).vault.writeBinaryFile(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    if (!this.isAvailable()) throw new Error('Electron storage not available');
    return (window as any).vault.deleteFile(path);
  }

  async listFiles(directoryPath: string = ''): Promise<string[]> {
    if (!this.isAvailable()) throw new Error('Electron storage not available');
    return (window as any).vault.listFiles(directoryPath);
  }
}
