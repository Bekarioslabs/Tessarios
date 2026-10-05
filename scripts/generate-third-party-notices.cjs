#!/usr/bin/env node
/**
 * Writes THIRD_PARTY_NOTICES.md: every package whose code ends up in the app, with its
 * licence and the licence text.
 *
 *   npm run licenses
 *
 * The list comes from the built bundle, not from package.json. A build with source maps
 * records which files each chunk was assembled from; those paths name the packages that
 * are really shipped. Reading `dependencies` instead would list build tools that never
 * reach a user (Vite, Tailwind, the React plugin) and miss transitive packages that do.
 *
 * MIT, ISC and BSD licences require that the copyright notice and licence text travel with
 * the software, which is what this file is for. Packages that declare a licence but ship no
 * licence file are listed separately instead of having a text invented for them.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'THIRD_PARTY_NOTICES.md');
const TMP = path.join(os.tmpdir(), 'tessarios-notices-build');

// 1. Build with source maps into a scratch folder, never over dist/.
fs.rmSync(TMP, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--sourcemap', '--outDir', TMP, '--emptyOutDir'],
  { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] }
);

// 2. Which package directories contributed code?
const pkgDirs = new Set();
const assets = path.join(TMP, 'assets');
for (const f of fs.readdirSync(assets).filter(n => n.endsWith('.map'))) {
  const map = JSON.parse(fs.readFileSync(path.join(assets, f), 'utf8'));
  for (const src of map.sources || []) {
    const norm = src.replace(/\\/g, '/');
    const i = norm.lastIndexOf('node_modules/');
    if (i === -1) continue;
    const rest = norm.slice(i + 'node_modules/'.length).split('/');
    const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
    // resolve against our own tree: the map's relative path is only a hint
    const abs = path.resolve(TMP, norm.slice(0, i + 'node_modules/'.length), name);
    pkgDirs.add(fs.existsSync(path.join(abs, 'package.json')) ? abs : path.join(ROOT, 'node_modules', name));
  }
}

// 2b. The main process runs from node_modules, not from the bundle: whatever main.cjs and
// preload.cjs require ships with its whole dependency tree. (JSZip is in both places: the
// renderer bundles its prebuilt dist file, which has pako, lie and readable-stream inside.)
const { builtinModules } = require('module');
const runtimeRoots = new Set();
for (const entry of ['main.cjs', 'preload.cjs']) {
  const src = fs.readFileSync(path.join(ROOT, entry), 'utf8');
  for (const m of src.matchAll(/require(s*['"]([^'"]+)['"]s*)/g)) {
    const id = m[1];
    if (id.startsWith('.') || id === 'electron' || id.startsWith('node:')) continue;
    if (builtinModules.includes(id.split('/')[0])) continue;
    runtimeRoots.add(id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0]);
  }
}
function findPackage(name, from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const p = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(p, 'package.json'))) return p;
    if (path.dirname(dir) === dir) return null;
  }
}
const seenDirs = new Set();
function addClosure(name, from) {
  const dir = findPackage(name, from);
  if (!dir || seenDirs.has(dir)) return;
  seenDirs.add(dir);
  pkgDirs.add(dir);
  const deps = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).dependencies || {};
  for (const d of Object.keys(deps)) addClosure(d, dir);
}
for (const root of runtimeRoots) addClosure(root, ROOT);
// Everything under the bundle's own jszip entry needs its tree too, whether or not the
// source map expanded it.
if (pkgDirs.has(findPackage('jszip', ROOT))) addClosure('jszip', ROOT);

// 2c. Fonts are copied into the build as files, so they never show up in a JS source map.
// They are imported from the stylesheet; pick them up from there.
const css = fs.readFileSync(path.join(ROOT, 'src', 'index.css'), 'utf8');
for (const m of css.matchAll(/@import\s+["'](@fontsource\/[^/"']+)\//g)) addClosure(m[1], ROOT);

// 3. Read each package.
const LICENSE_FILE = /^(licen[sc]e|copying|unlicen[sc]e)(\.(md|txt|markdown))?$/i;
const packages = [];
for (const dir of pkgDirs) {
  const pj = path.join(dir, 'package.json');
  if (!fs.existsSync(pj)) continue;
  const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
  const licenseField = j.license ?? j.licenses;
  const license = !licenseField
    ? 'UNDECLARED'
    : typeof licenseField === 'string'
      ? licenseField
      : Array.isArray(licenseField)
        ? licenseField.map(x => x.type || x).join(' OR ')
        : licenseField.type || JSON.stringify(licenseField);
  const file = fs.readdirSync(dir).find(n => LICENSE_FILE.test(n));
  const text = file ? fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim() : null;
  const repo = typeof j.repository === 'string' ? j.repository : j.repository?.url || j.homepage || '';
  packages.push({
    name: j.name,
    version: j.version,
    license,
    text,
    link: repo
      .replace(/^git\+/, '')
      .replace(/\.git$/, '')
      .replace(/^git:\/\//, 'https://')
      .replace(/^([\w.-]+\/[\w.-]+)$/, 'https://github.com/$1'),
  });
}
packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

// 4. Group identical licence texts so a thousand-line file is not a thousand copies of MIT.
const groups = new Map();
const missing = [];
for (const p of packages) {
  if (!p.text) { missing.push(p); continue; }
  const key = crypto.createHash('sha256').update(p.text).digest('hex');
  if (!groups.has(key)) groups.set(key, { text: p.text, members: [] });
  groups.get(key).members.push(p);
}

const electron = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8'));

// 5. Write the file.
const lines = [];
lines.push('# Third-party notices', '');
lines.push(
  'Tessarios includes the software listed below. Each package is distributed under its own',
  'licence, reproduced in full in the second part. This file is generated by',
  '`npm run licenses` from the contents of the production build; do not edit it by hand.',
  ''
);

lines.push('## Runtime', '');
lines.push(
  `- **Electron** ${electron.version} — ${electron.license}. https://www.electronjs.org`,
  '  Electron bundles Chromium and other components under their own licences. Those licence',
  '  texts are distributed with the application as `LICENSES.chromium.html`.',
  ''
);

lines.push('## Packages shipped with the application', '');
lines.push(`${packages.length} packages.`, '', '| Package | Version | Licence |', '|---|---|---|');
for (const p of packages) lines.push(`| ${p.link ? `[${p.name}](${p.link})` : p.name} | ${p.version} | ${p.license} |`);
lines.push('');

lines.push('## Licence texts', '');
let n = 0;
for (const { text, members } of [...groups.values()].sort((a, b) => b.members.length - a.members.length)) {
  n++;
  lines.push(`### Text ${n}`, '', `Applies to: ${members.map(m => `${m.name}@${m.version}`).join(', ')}`, '', '```text', text, '```', '');
}

if (missing.length) {
  lines.push('## Packages that declare a licence but ship no licence file', '');
  lines.push('Their licence is taken from the package metadata; the terms are those published for that identifier.', '');
  for (const p of missing) lines.push(`- ${p.name}@${p.version} — ${p.license}${p.link ? ` (${p.link})` : ''}`);
  lines.push('');
}

fs.writeFileSync(OUT, lines.join('\n'));
fs.rmSync(TMP, { recursive: true, force: true });

const undeclared = packages.filter(p => p.license === 'UNDECLARED');
console.log(`THIRD_PARTY_NOTICES.md written: ${packages.length} packages, ${groups.size} distinct licence texts.`);
if (missing.length) console.log(`  ${missing.length} without a licence file:`, missing.map(p => p.name).join(', '));
if (undeclared.length) {
  console.error('  UNDECLARED licence:', undeclared.map(p => p.name).join(', '));
  process.exitCode = 1;
}
