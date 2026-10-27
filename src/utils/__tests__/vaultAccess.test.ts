/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';

// The main-process module is plain CommonJS with no Electron imports, so Node can load it.
const nodeRequire = createRequire(import.meta.url);
const { createVaultRegistry, ensureWikiCopy } = nodeRequire('../../../electron/vaultAccess.cjs');

/**
 * What decides which folder the app may open when the renderer asks for one, and how the bundled
 * wiki becomes the user's own copy. Both are security- and data-relevant, and main.cjs itself
 * cannot be run without Electron.
 */
export async function runVaultAccessTests(): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = [];
  let passed = true;
  function assert(condition: unknown, message: string) {
    if (condition) log.push(`✅ PASS: ${message}`);
    else { log.push(`❌ FAIL: ${message}`); passed = false; }
  }

  const memoryConfig = () => {
    let config: Record<string, any> = {};
    return { loadConfig: () => JSON.parse(JSON.stringify(config)), saveConfig: (c: any) => { config = JSON.parse(JSON.stringify(c)); } };
  };

  try {
    // 1. Only folders chosen before can be reopened.
    {
      const reg = createVaultRegistry({ ...memoryConfig(), platform: 'linux' });
      const home = path.resolve('vaults', 'story');
      assert(!reg.isKnown(home), 'a folder the user never chose is not reopenable');
      reg.remember(home);
      assert(reg.isKnown(home), 'a folder the user chose is reopenable');
      assert(!reg.isKnown(path.resolve('vaults', 'other')), 'a different folder is still refused');
      assert(!reg.isKnown('') && !reg.isKnown(undefined), 'an empty path is refused');
      assert(reg.isKnown(path.join('vaults', 'story', '..', 'story')), 'a path that resolves to a known folder is accepted');
      assert(!reg.isKnown(path.resolve('vaults')), 'the parent of a known folder is not');
    }

    // 2. Windows paths ignore case, other systems do not.
    {
      const win = createVaultRegistry({ ...memoryConfig(), platform: 'win32' });
      win.remember(path.resolve('Vaults', 'Story'));
      assert(win.isKnown(path.resolve('vaults', 'STORY')), 'on Windows a known folder matches regardless of letter case');
      const posix = createVaultRegistry({ ...memoryConfig(), platform: 'linux' });
      posix.remember(path.resolve('Vaults', 'Story'));
      assert(!posix.isKnown(path.resolve('vaults', 'story')), 'on other systems letter case matters');
    }

    // 3. The list stays short, newest first, without duplicates.
    {
      const cfg = memoryConfig();
      const reg = createVaultRegistry({ ...cfg, platform: 'linux', limit: 3 });
      ['a', 'b', 'c', 'd'].forEach(n => reg.remember(path.resolve(n)));
      assert(!reg.isKnown(path.resolve('a')) && reg.isKnown(path.resolve('d')), 'the oldest entry drops out when the list is full');
      reg.remember(path.resolve('b'));
      reg.remember(path.resolve('b'));
      assert(cfg.loadConfig().knownVaults.filter((p: string) => p === path.resolve('b')).length === 1, 'remembering a folder twice keeps one entry');
      assert(cfg.loadConfig().knownVaults[0] === path.resolve('b'), 'the folder used last moves to the front');
    }

    // 4. The bundled wiki is copied once and never overwritten.
    {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tessarios-wiki-'));
      try {
        const source = path.join(tmp, 'bundled');
        fs.mkdirSync(path.join(source, 'Notes'), { recursive: true });
        fs.mkdirSync(path.join(source, '.tessarios'), { recursive: true });
        fs.writeFileSync(path.join(source, 'Notes', 'start-here.md'), 'original');
        fs.writeFileSync(path.join(source, '.tessarios', 'PROJECT.md'), 'project');
        const target = path.join(tmp, 'Documents', 'Tessarios Wiki');
        fs.mkdirSync(path.dirname(target), { recursive: true });

        const first = await ensureWikiCopy(fs.promises, fs, source, target);
        assert(first === 'copied' && fs.readFileSync(path.join(target, 'Notes', 'start-here.md'), 'utf8') === 'original', 'the first open copies the wiki');
        assert(fs.existsSync(path.join(target, '.tessarios', 'PROJECT.md')), 'hidden files are copied too');

        fs.writeFileSync(path.join(target, 'Notes', 'start-here.md'), 'edited by the user');
        const second = await ensureWikiCopy(fs.promises, fs, source, target);
        assert(second === 'existing' && fs.readFileSync(path.join(target, 'Notes', 'start-here.md'), 'utf8') === 'edited by the user', 'a second open keeps the user\'s edits');
        assert(fs.readFileSync(path.join(source, 'Notes', 'start-here.md'), 'utf8') === 'original', 'the bundled original is never touched');
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
  } catch (e: any) {
    log.push(`❌ FAIL: vault access test crashed: ${e?.message || e}`);
    passed = false;
  }

  return { success: passed, log };
}
