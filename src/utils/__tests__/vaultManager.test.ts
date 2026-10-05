/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { LoreEntity } from '../../types';
import { IVaultStorage } from '../storage/VaultStorage';
import { serializeToMarkdown } from '../markdown';
import { loadVaultFromStorage, saveEntityToStorage } from '../vaultManager';

/**
 * An in-memory vault that behaves like a real filesystem in the one way that matters here:
 * whether `Ilka.md` and `ilka.md` are one file. Overwriting keeps the file's original
 * on-disk name, as NTFS does.
 */
class FakeStorage implements IVaultStorage {
  private files = new Map<string, { name: string; content: string }>();
  /** Makes the next N reads fail, to simulate an inconclusive probe. */
  failNextReads = 0;

  constructor(private caseInsensitive: boolean, initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) this.files.set(this.key(path), { name: path, content });
  }

  private key(path: string) {
    return this.caseInsensitive ? path.toLowerCase() : path;
  }

  getName() { return 'fake'; }
  isAvailable() { return true; }
  async initialize() { return true; }

  async readFile(path: string): Promise<string> {
    if (this.failNextReads > 0) {
      this.failNextReads--;
      throw new Error('EIO: transient read failure');
    }
    const f = this.files.get(this.key(path));
    if (!f) throw new Error(`ENOENT: ${path}`);
    return f.content;
  }
  async readBinaryFile(): Promise<ArrayBuffer> { return new ArrayBuffer(0); }

  async writeFile(path: string, content: string, exclusive?: boolean): Promise<void> {
    const existing = this.files.get(this.key(path));
    if (exclusive && existing) throw new Error('EEXIST: target file already exists');
    this.files.set(this.key(path), { name: existing ? existing.name : path, content });
  }
  async writeBinaryFile(): Promise<void> {}

  async deleteFile(path: string): Promise<void> {
    this.files.delete(this.key(path));
  }

  async listFiles(directoryPath = ''): Promise<string[]> {
    const prefix = directoryPath ? `${directoryPath}/` : '';
    return [...this.files.values()].map(f => f.name).filter(n => n.startsWith(prefix));
  }

  names(prefix = '') {
    return [...this.files.values()].map(f => f.name).filter(n => n.startsWith(prefix)).sort();
  }
  content(path: string) {
    return this.files.get(this.key(path))?.content;
  }
}

function character(id: string, title: string, content = '## Core\nText'): LoreEntity {
  return {
    id, title, type: 'character', content, lastModified: Date.UTC(2026, 0, 1),
    tags: ['character'], relations: [], customFields: {},
  };
}

const md = (e: LoreEntity) => serializeToMarkdown(e);

export async function runVaultTests(): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = [];
  let passed = true;

  function assert(condition: unknown, message: string) {
    if (condition) {
      log.push(`✅ PASS: ${message}`);
    } else {
      log.push(`❌ FAIL: ${message}`);
      passed = false;
    }
  }

  try {
    const ilka = character('ilka', 'Ilka');

    // 1. The reported bug: a hand-placed "Ilka.md" on a case-insensitive filesystem.
    {
      const storage = new FakeStorage(true, { 'Characters/Ilka.md': md(ilka) });
      const { entities } = await loadVaultFromStorage(storage);
      const edited = { ...entities['ilka'], content: '## Core\nChanged' };

      const first = await saveEntityToStorage(storage, edited);
      assert(first.success === true && !first.collision, 'a file whose name differs from its slug only by case saves without a false collision');
      assert(
        storage.names('Characters/').length === 1 && storage.content('Characters/Ilka.md')?.includes('Changed'),
        'the entry is still exactly one file and carries the edit — it was not deleted as the "old" path'
      );
      const backups = storage.names('.tessarios/backups/Characters/ilka/');
      assert(
        backups.length === 1 && storage.content(backups[0])?.includes('Text') && !storage.content(backups[0])?.includes('Changed'),
        'the pre-change version was backed up before the overwrite'
      );

      const second = await saveEntityToStorage(storage, { ...edited, content: '## Core\nAgain' });
      assert(
        second.success === true && storage.names('Characters/').length === 1 && storage.content('Characters/ilka.md')?.includes('Again'),
        'a second save, once the filesystem has been recognised as case-insensitive, behaves the same'
      );
    }

    // 2. Forced overwrite used to delete "the old file", which on this filesystem is the new one.
    {
      const storage = new FakeStorage(true, { 'Characters/Ilka.md': md(ilka) });
      const { entities } = await loadVaultFromStorage(storage);
      const result = await saveEntityToStorage(storage, { ...entities['ilka'], content: '## Core\nForced' }, true);
      assert(
        result.success === true && storage.names('Characters/').length === 1 && storage.content('Characters/Ilka.md')?.includes('Forced'),
        'a forced overwrite does not delete the file it just wrote'
      );
    }

    // 3. The guard behind that: even when the identity probe is inconclusive.
    {
      const storage = new FakeStorage(true, { 'Characters/Ilka.md': md(ilka) });
      const { entities } = await loadVaultFromStorage(storage);
      storage.failNextReads = 2; // both probe reads fail, so the same-file check cannot decide
      const result = await saveEntityToStorage(storage, { ...entities['ilka'], content: '## Core\nGuarded' }, true);
      assert(
        result.success === true && storage.names('Characters/').length === 1 && storage.content('Characters/Ilka.md')?.includes('Guarded'),
        'with an inconclusive probe, the post-write check still refuses to delete the only copy'
      );
    }

    // 4. A real rename on a case-insensitive filesystem still renames.
    {
      const storage = new FakeStorage(true, { 'Characters/Ilka.md': md(ilka) });
      const { entities } = await loadVaultFromStorage(storage);
      const result = await saveEntityToStorage(storage, { ...entities['ilka'], title: 'Ilka Fischer' });
      assert(
        result.success === true && JSON.stringify(storage.names('Characters/')) === JSON.stringify(['Characters/ilka-fischer.md']),
        'renaming the title still writes the new file and removes the old one'
      );
    }

    // 5. A case-sensitive filesystem: the two names are different files, so this is a rename.
    {
      const storage = new FakeStorage(false, { 'Characters/Ilka.md': md(ilka) });
      const { entities } = await loadVaultFromStorage(storage);
      const result = await saveEntityToStorage(storage, { ...entities['ilka'], content: '## Core\nMoved' });
      assert(
        result.success === true && JSON.stringify(storage.names('Characters/')) === JSON.stringify(['Characters/ilka.md']) &&
          storage.content('Characters/ilka.md')?.includes('Moved'),
        'on a case-sensitive filesystem the entry is moved to its slug name, as before'
      );
    }

    // 6. A case-sensitive filesystem with a genuinely different file at the slug name.
    {
      const other = character('other', 'Other', '## Core\nSomeone else entirely');
      const storage = new FakeStorage(false, {
        'Characters/Ilka.md': md(ilka),
        'Characters/ilka.md': md(other),
      });
      const { entities } = await loadVaultFromStorage(storage);
      const result = await saveEntityToStorage(storage, { ...entities['ilka'], content: '## Core\nShould not land' });
      assert(
        result.success === false && result.collision === true && result.collidingId === 'other',
        'two provably different files differing only by case are still reported as a collision'
      );
      assert(
        storage.names('Characters/').length === 2 && storage.content('Characters/ilka.md')?.includes('Someone else entirely') &&
          storage.content('Characters/Ilka.md')?.includes('Text'),
        'a real collision touches neither file'
      );
    }

    // 7. A collision with another entry's file is unaffected.
    {
      const mira = character('mira', 'Mira', '## Core\nMira text');
      const storage = new FakeStorage(true, { 'Characters/Ilka.md': md(ilka), 'Characters/mira.md': md(mira) });
      const { entities } = await loadVaultFromStorage(storage);
      const result = await saveEntityToStorage(storage, { ...entities['ilka'], title: 'Mira' });
      assert(
        result.success === false && result.collision === true && result.collidingId === 'mira' && storage.names('Characters/').length === 2,
        'renaming onto another entry\'s file is still a collision, and nothing is overwritten or deleted'
      );
    }
  } catch (err: any) {
    log.push(`❌ EXCEPTION: ${err.message || String(err)}`);
    passed = false;
  }

  return { success: passed, log };
}
