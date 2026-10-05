/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export interface IVaultStorage {
  getName(): string;
  isAvailable(): boolean;
  
  initialize(options?: { prompt?: boolean; targetPath?: string }): Promise<boolean>;
  
  readFile(path: string): Promise<string>;
  readBinaryFile(path: string): Promise<ArrayBuffer>;
  
  /**
   * `exclusive: true` fails atomically (no-op) if a file already exists at `path`,
   * instead of overwriting it — used to close a check-then-write race.
   */
  writeFile(path: string, content: string, exclusive?: boolean): Promise<void>;
  writeBinaryFile(path: string, content: ArrayBuffer): Promise<void>;
  
  deleteFile(path: string): Promise<void>;
  
  listFiles(directoryPath?: string): Promise<string[]>;
}
