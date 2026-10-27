/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import * as fs from 'fs';
import * as path from 'path';
import { IVaultStorage } from '../storage/VaultStorage';
import { loadVaultFromStorage } from '../vaultManager';
import { slugify, getCategoryFolder } from '../markdown';
import { EntityType } from '../../types';

/** Read-only view of a real folder, enough for loadVaultFromStorage. */
class FolderStorage implements IVaultStorage {
  constructor(private root: string) {}
  getName() { return 'folder'; }
  isAvailable() { return true; }
  async initialize() { return true; }
  async readFile(p: string) { return fs.readFileSync(path.join(this.root, p), 'utf8'); }
  async readBinaryFile(): Promise<ArrayBuffer> { return new ArrayBuffer(0); }
  async writeFile(): Promise<void> { throw new Error('example vault is read-only in tests'); }
  async writeBinaryFile(): Promise<void> { throw new Error('example vault is read-only in tests'); }
  async deleteFile(): Promise<void> { throw new Error('example vault is read-only in tests'); }
  async listFiles(dir = ''): Promise<string[]> {
    const out: string[] = [];
    const walk = (rel: string) => {
      for (const e of fs.readdirSync(path.join(this.root, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(r); else out.push(r);
      }
    };
    walk('');
    return dir ? out.filter(f => f.startsWith(dir + '/')) : out;
  }
}

const ALL_TYPES: EntityType[] = [
  'book', 'chapter', 'scene', 'character', 'relationship', 'organization', 'place', 'power',
  'item', 'lore', 'storyline', 'visual', 'map', 'note', 'brainstorm',
];

/**
 * The wiki vault in examples/ is documentation people open in the app. It must keep loading, show
 * every entry type, resolve every link and reference only images that exist, or it quietly rots.
 */
export async function runExampleVaultTests(): Promise<{ success: boolean; log: string[] }> {
  const log: string[] = [];
  let passed = true;
  function assert(condition: unknown, message: string) {
    if (condition) log.push(`✅ PASS: ${message}`);
    else { log.push(`❌ FAIL: ${message}`); passed = false; }
  }

  try {
    const root = path.join(process.cwd(), 'examples', 'wiki-vault');
    const { entities, looseMedia } = await loadVaultFromStorage(new FolderStorage(root));
    const list = Object.values(entities);

    assert(list.length >= 30, `the wiki vault loads (${list.length} entries)`);

    const types = new Set(list.map(e => e.type));
    const missingTypes = ALL_TYPES.filter(t => !types.has(t));
    assert(missingTypes.length === 0, `every entry type has an example${missingTypes.length ? ' (missing: ' + missingTypes.join(', ') + ')' : ''}`);

    const variants = (tag: string) => list.some(e => e.type === 'character' && e.tags.includes(tag));
    assert(variants('hero') && variants('antagonist') && variants('supporting'), 'all three character templates have an example');

    const wrongFile = list.filter(e => {
      const expected = `${getCategoryFolder(e.type)}/${slugify(e.title)}.md`;
      return !fs.existsSync(path.join(root, expected)) || e.id !== slugify(e.title);
    });
    assert(wrongFile.length === 0, `every file is named after its title and sits in its type folder${wrongFile.length ? ' (' + wrongFile.map(e => e.id).join(', ') + ')' : ''}`);

    // Every [[link]] (not ![[embed]]) in text, fields, pins and regions resolves to an entry.
    const known = new Set<string>();
    list.forEach(e => { known.add(e.title.toLowerCase()); known.add(e.id.toLowerCase()); });
    const unresolved = new Set<string>();
    const scan = (owner: string, text: string | undefined) => {
      if (!text) return;
      for (const m of text.matchAll(/(?<!!)\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
        if (!known.has(m[1].trim().toLowerCase())) unresolved.add(`${owner} -> [[${m[1].trim()}]]`);
      }
    };
    // Same rule as the app: syntax examples inside code spans or blocks are not links.
    const withoutCode = (t: string) => t.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    for (const e of list) {
      scan(e.id, withoutCode(e.content));
      Object.values(e.customFields).forEach(v => scan(e.id, v));
      e.mapMarkers?.forEach(m => scan(e.id, m.description));
      e.mapRegions?.forEach(r => scan(e.id, r.description));
    }
    assert(unresolved.size === 0, `every wikilink points to an existing entry${unresolved.size ? ' (' + [...unresolved].slice(0, 5).join('; ') + ')' : ''}`);

    // Pins and regions point at entries that exist.
    const badTargets: string[] = [];
    for (const e of list) {
      [...(e.mapMarkers || []), ...(e.mapRegions || [])].forEach(x => {
        if (x.targetEntityId && !entities[x.targetEntityId]) badTargets.push(`${e.id}:${x.targetEntityId}`);
      });
    }
    assert(badTargets.length === 0, `every map pin and region links to an existing entry${badTargets.length ? ' (' + badTargets.join(', ') + ')' : ''}`);

    // Images, read straight from the files: the loader drops references to missing images, so
    // checking the loaded entries would never notice one.
    const referenced = new Set<string>();
    const rawFiles = (await new FolderStorage(root).listFiles('')).filter(f => f.endsWith('.md') || f === 'loose_media.json');
    for (const f of rawFiles) {
      const text = fs.readFileSync(path.join(root, f), 'utf8');
      for (const m of text.matchAll(/assets\/[^"\]|)\n<>]+?\.(?:png|jpe?g|gif|webp)/gi)) referenced.add(m[0]);
    }
    const missingFiles = [...referenced].filter(r => !fs.existsSync(path.join(root, r)));
    assert(
      referenced.size > 0 && missingFiles.length === 0,
      `every referenced image exists (${referenced.size} referenced)${missingFiles.length ? ' (missing: ' + missingFiles.join(', ') + ')' : ''}`
    );
    const onDisk = fs.readdirSync(path.join(root, 'assets')).map(f => `assets/${f}`);
    const unused = onDisk.filter(f => !referenced.has(f));
    assert(unused.length === 0, `no image in assets/ is unused${unused.length ? ' (' + unused.join(', ') + ')' : ''}`);

    // The map examples keep what they are there to show.
    const bay = entities['greywater-bay-map'];
    const plan = entities['saltmarsh-pier-harbour-plan'];
    assert(bay?.mapMarkers?.length === 3, 'the bay map has its three pins');
    assert(plan?.mapFloors?.length === 2 && plan?.mapRegions?.length === 4, 'the harbour plan has two floors and four regions');
    assert(Object.keys(looseMedia || {}).length === 1, 'one image is deliberately left unlinked for the media tutorial');
  } catch (e: any) {
    log.push(`❌ FAIL: example vault test crashed: ${e?.message || e}`);
    passed = false;
  }

  return { success: passed, log };
}
