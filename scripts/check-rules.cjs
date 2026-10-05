#!/usr/bin/env node
/**
 * Mechanical enforcement for the rules in AGENTS.md.
 *
 * Prose rules alone did not hold. The rule "use design tokens, not hardcoded hex"
 * already existed — naming the exact values bg-[#09090b] and bg-[#0d0d12] — while the
 * codebase accumulated 227 of them. So every rule that a machine can check is checked
 * here, and a violation is an exit code rather than a matter of opinion.
 *
 *   npm run check          (needs a current build for the class-existence check)
 *
 * Findings are either ERROR (fix it) or WARN (known, accepted, tracked). Warnings do
 * not fail the run — but each one needs a reason recorded below, so the exception list
 * stays a deliberate decision instead of quiet drift.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let errors = 0;
const report = (level, rule, msg, hits) => {
  if (level === 'ERROR') errors++;
  console.error(`\n${level === 'ERROR' ? '✗' : '!'} ${rule}`);
  console.error(`  ${msg}`);
  hits.slice(0, 12).forEach((h) => console.error(`    ${h}`));
  if (hits.length > 12) console.error(`    … und ${hits.length - 12} weitere`);
};
const ok = (rule) => console.log(`✓ ${rule}`);

function sourceFiles(dir = SRC, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') sourceFiles(p, acc);
    } else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const lines = (f) => fs.readFileSync(f, 'utf8').split('\n');
const files = sourceFiles();

// ---------------------------------------------------------------------------
// 1. No hardcoded color values in components.
// ---------------------------------------------------------------------------
{
  // EntityTypeBadge: the type table is data describing categories, and carries raw hex
  // for canvas rendering where CSS cannot reach.
  // SettingsModal: the two theme preview tiles must show what the *other* theme looks
  // like while you are still in the current one, so they cannot use live tokens.
  const EXEMPT = /(EntityTypeBadge|SettingsModal)\.tsx$/;
  const hits = [];
  for (const f of files) {
    if (EXEMPT.test(f)) continue;
    lines(f).forEach((line, i) => {
      const m = line.match(/(?:bg|text|border|ring|from|to|via)-\[#[0-9a-fA-F]{3,8}\]/g);
      if (m) hits.push(`${rel(f)}:${i + 1}  ${[...new Set(m)].join(' ')}`);
    });
  }
  hits.length
    ? report('ERROR', 'Keine fest eingetragenen Farbwerte',
        'Farben laufen über Token aus src/index.css (bg-surface-card, text-ink-muted, border-line …).', hits)
    : ok('Keine fest eingetragenen Farbwerte');
}

// ---------------------------------------------------------------------------
// 2. Every color utility used must actually produce CSS.
//    Catches the "invented a utility that silently does nothing" class of bug:
//    zinc-850/zinc-750 appeared 20 times and generated no rule at all, so those
//    borders fell back to currentColor and drew in the element's text color.
// ---------------------------------------------------------------------------
{
  const distDir = path.join(ROOT, 'dist', 'assets');
  const cssFile = fs.existsSync(distDir)
    && fs.readdirSync(distDir).filter((f) => f.endsWith('.css'))
      .map((f) => path.join(distDir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

  if (!cssFile) {
    console.log('! Klassen-Existenzprüfung übersprungen — kein Build in dist/ (npm run build)');
  } else {
    const css = fs.readFileSync(cssFile, 'utf8');
    const known = new Set([...css.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    // Only names that claim to be colors: a palette step (zinc-850) or one of our own
    // token families. Everything else on these prefixes is a size/side/layout utility.
    const LOOKS_LIKE_COLOR = /^([a-z]+-\d{2,3}|(surface|line|ink|danger|brand|graph)(-[a-z]+)*|overlay)$/;
    const hits = [];
    for (const f of files) {
      lines(f).forEach((line, i) => {
        for (const m of line.matchAll(/\b(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|to|via)-([a-z][a-z0-9-]*)(?:\/\d+)?\b/g)) {
          const name = m[1];
          if (!LOOKS_LIKE_COLOR.test(name) || known.has(name)) continue;
          hits.push(`${rel(f)}:${i + 1}  ${m[0]}`);
        }
      });
    }
    hits.length
      ? report('ERROR', 'Alle Farbklassen erzeugen auch CSS',
          'Diese Klassen erzeugen keine CSS-Regel — sie tun im Browser nichts.', hits)
      : ok('Alle Farbklassen erzeugen auch CSS');
  }
}

// ---------------------------------------------------------------------------
// 3. No user-visible German text without an English branch.
//
// The first version of this rule only looked for umlauts inside `>text<` and a few
// attributes. It missed "Spalte", "Zeilen", "Abbrechen" (no umlaut), text that sits on a
// line of its own inside a JSX element (`Tabelle einfügen`), and the dialog texts a hook
// hands to the UI (useVaultStorage.ts). All of those shipped untranslated.
//
// Three kinds of place are checked. A line can opt out with `// i18n-ok`.
// ---------------------------------------------------------------------------
{
  // Words that are German and not also an everyday English or technical word. Not a
  // dictionary — just the vocabulary an interface uses. Extend it when a miss turns up.
  const GERMAN_WORDS = new RegExp(
    '(?<![\\p{L}])(' + [
      'Abbrechen', 'Speichern', 'Löschen', 'Zeile', 'Zeilen', 'Spalte', 'Spalten', 'Tabelle', 'Einfügen', 'einfügen',
      'Hinzufügen', 'hinzufügen', 'Entfernen', 'Bearbeiten', 'bearbeiten', 'Schließen', 'Öffnen', 'Erstellen', 'erstellen',
      'Suche', 'Suchen', 'Alle', 'Keine', 'Kein', 'Wähle', 'wählen', 'Neue', 'Neuer', 'Neueste', 'Titel', 'Beschreibung',
      'Karte', 'Bereich', 'Bereiche', 'Etage', 'Markierung', 'Eintrag', 'Einträge', 'Datei', 'Dateien', 'Ordner', 'Bild',
      'Fehler', 'Zurück', 'Weiter', 'Übernehmen', 'Verwerfen', 'Anhängen', 'Zeichen', 'anwenden', 'Notizen',
      'oder', 'und', 'nicht', 'wird', 'wurde', 'wurden', 'für', 'mit', 'deine', 'deiner', 'dein', 'Dein',
    ].join('|') + ')(?![\\p{L}])', 'u');
  const UMLAUT = /[äöüßÄÖÜ]/;
  const isGerman = (t) => UMLAUT.test(t) || GERMAN_WORDS.test(t);
  // "Schließen / Close" carries both languages in one string.
  const bothLanguages = (t) => /[äöüßÄÖÜ][^"<>]*\/\s*[A-Z][a-z]+/.test(t);
  const languageNearby = (ls, i, back = 4, fwd = 1) =>
    /language\s*===|getTranslation|getTypeTranslation|labelDe|descDe|\btr\(|isEn\b/.test(ls.slice(Math.max(0, i - back), i + fwd + 1).join(' '));

  const hits = [];
  for (const f of files) {
    const ls = lines(f);
    const isTsx = f.endsWith('.tsx');
    const isHook = /[\\/]hooks[\\/][^\\/]+\.ts$/.test(f);
    if (!isTsx && !isHook) continue;

    ls.forEach((line, i) => {
      if (/i18n-ok/.test(line)) return;
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      let hit = null;

      if (isTsx) {
        // (1) attributes that reach the user, (2) text between tags on one line
        if (!languageNearby(ls, i)) {
          const attr = line.match(/\b(?:title|placeholder|aria-label|alt)="([^"]*)"/);
          if (attr && isGerman(attr[1])) hit = attr[0];
          const inline = line.match(/>([^<>{}]+)</);
          if (!hit && inline && isGerman(inline[1])) hit = inline[0];
        }
        // (3) a JSX child on a line of its own: bare text right after a line that ends a tag
        if (!hit && /^[A-ZÄÖÜ][A-Za-zäöüÄÖÜß ,.:!?&()/-]*$/.test(t) && t.split(/\s+/).length <= 8) {
          let p = i - 1;
          while (p >= 0 && !ls[p].trim()) p--;
          if (p >= 0 && /[^=]>\s*$/.test(ls[p]) && !/=>\s*$/.test(ls[p]) && isGerman(t)) hit = t;
        }
      }

      if (isHook) {
        // (4) texts a hook hands to the UI: dialog title/message/label/confirmText
        const m = line.match(/\b(?:title|message|label|confirmText|cancelText)\s*:\s*([`'"])(.*)\1/);
        if (m && isGerman(m[2]) && !languageNearby(ls, i, 3, 0)) hit = m[0];
      }

      if (!hit || bothLanguages(hit)) return;
      hits.push(`${rel(f)}:${i + 1}  ${hit.trim().slice(0, 66)}`);
    });
  }
  hits.length
    ? report('ERROR', 'Keine unübersetzten Oberflächentexte',
        "Sichtbarer Text ist zweisprachig: language === 'en' ? … : …  (Ausnahme: // i18n-ok)", hits)
    : ok('Keine unübersetzten Oberflächentexte');
}

// ---------------------------------------------------------------------------
// 4. No second implementation of a shared primitive.
//    There were 14 hand-rolled modal overlays before BaseModal was adopted.
// ---------------------------------------------------------------------------
{
  // Accepted: BaseModal/DangerConfirmDialog are the primitives themselves; the splash
  // screen and the error boundary render before/outside the normal dialog stack; the
  // Editor's lightbox and fullscreen map are image viewers, not dialogs — they carry
  // no header, no footer, and dismiss on any click.
  const PRIMITIVE = /(BaseModal|DangerConfirmDialog|ErrorBoundary|SplashScreenModal)\.tsx$/;
  const VIEWER_LINES = { 'src/components/Editor.tsx': [1607, 1698] };
  const errorsFound = [], warns = [];
  for (const f of files) {
    if (PRIMITIVE.test(f)) continue;
    lines(f).forEach((line, i) => {
      if (!/fixed inset-0/.test(line) || !/(bg-overlay|bg-black\/)/.test(line)) return;
      const where = `${rel(f)}:${i + 1}`;
      if ((VIEWER_LINES[rel(f)] || []).some((n) => Math.abs(n - (i + 1)) <= 2)) return;
      (/rose-|AlertTriangle|Delete|löschen/i.test(lines(f).slice(i, i + 12).join(' '))
        ? warns : errorsFound).push(`${where}  ${line.trim().slice(0, 62)}`);
    });
  }
  if (errorsFound.length) {
    report('ERROR', 'Dialoge laufen über BaseModal',
      'Handgebautes Vollbild-Overlay — BaseModal benutzen.', errorsFound);
  }
  if (warns.length) {
    report('WARN', 'Gefahr-Dialoge noch handgebaut',
      'Doppeln DangerConfirmDialog. Bekannt und erfasst — beim nächsten Anfassen zusammenführen.', warns);
  }
  if (!errorsFound.length && !warns.length) ok('Dialoge laufen über BaseModal');
}

// ---------------------------------------------------------------------------
// 5. No unreachable handler functions. Five fully implemented export/import
//    functions sat in Sidebar.tsx that no button could ever reach.
// ---------------------------------------------------------------------------
{
  const hits = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bconst (handle[A-Z]\w*)\s*=/g)) {
      const uses = (src.match(new RegExp(`\\b${m[1]}\\b`, 'g')) || []).length;
      if (uses <= 1) hits.push(`${rel(f)}  ${m[1]}() — definiert, nirgends benutzt`);
    }
  }
  hits.length
    ? report('ERROR', 'Keine toten Handler',
        'Über die Oberfläche nicht erreichbar — verdrahten oder entfernen.', hits)
    : ok('Keine toten Handler');
}

// ---------------------------------------------------------------------------
// 6. No runtime guard around a build-time construct.
//    `import.meta.glob` is rewritten by Vite before the code runs, so it never
//    exists as a function in the browser. Guarding it with `typeof ... === 'function'`
//    always evaluates to false: the files get bundled but stay unreachable, and the
//    AI silently ran with an empty constitution and no workflows for a while.
//    Use try/catch instead — Vite replaces the call, Node throws into the fallback.
// ---------------------------------------------------------------------------
{
  const hits = [];
  for (const f of files) {
    lines(f).forEach((line, i) => {
      const code = line.trim();
      // Skip comment lines: the rule is about the construct, not about prose
      // explaining why the construct is wrong.
      if (code.startsWith('*') || code.startsWith('//')) return;
      if (/typeof\s+.{0,20}\.glob\s*[!=]==?\s*['"]function['"]/.test(code)) {
        hits.push(`${rel(f)}:${i + 1}  ${code.slice(0, 70)}`);
      }
    });
  }
  hits.length
    ? report('ERROR', 'Keine Laufzeitprüfung auf import.meta.glob',
        'import.meta.glob wird beim Bauen ersetzt und existiert zur Laufzeit nie — die Prüfung ist immer falsch. try/catch benutzen.', hits)
    : ok('Keine Laufzeitprüfung auf import.meta.glob');
}

// ---------------------------------------------------------------------------
// 7. Licence headers and nothing fetched from the network at runtime.
//
//    The project is AGPL-3.0-or-later with a commercial option. Every source file says so,
//    so a stray header from a template (this repo started with Apache-2.0 ones) cannot
//    creep back in, and a file cannot ship with no statement at all.
//
//    The app is local-first and its privacy text in Settings says it makes no network
//    requests of its own. Fonts and images must therefore be files in the build, never a
//    URL: a Google Fonts @import and a picsum.photos fallback image both used to be here,
//    each one leaking the user's IP address to a third party on every launch.
// ---------------------------------------------------------------------------
{
  const missing = [];
  for (const f of files) {
    const head = fs.readFileSync(f, 'utf8').slice(0, 400);
    if (!/SPDX-License-Identifier: AGPL-3\.0-or-later/.test(head)) missing.push(rel(f));
  }
  missing.length
    ? report('ERROR', 'Jede Quelldatei trägt den AGPL-Header',
        'Erwartet: "SPDX-License-Identifier: AGPL-3.0-or-later" in den ersten Zeilen.', missing)
    : ok('Jede Quelldatei trägt den AGPL-Header');

  const hits = [];
  const EXTERNAL_HOSTS = /(picsum\.photos|unsplash\.com|googleapis\.com|gstatic\.com|cdn\.jsdelivr|unpkg\.com|cdnjs\.)/;
  for (const f of files) {
    lines(f).forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith('*') || code.startsWith('//')) return;
      if (EXTERNAL_HOSTS.test(code)) hits.push(`${rel(f)}:${i + 1}  ${code.slice(0, 70)}`);
    });
  }
  for (const f of [path.join(SRC, 'index.css'), path.join(ROOT, 'index.html')]) {
    lines(f).forEach((line, i) => {
      if (/@import\s+url\(\s*['"]?https?:|(src|href)=["']https?:|url\(\s*['"]?https?:/.test(line)) {
        hits.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 70)}`);
      }
    });
  }
  hits.length
    ? report('ERROR', 'Keine Ressource wird zur Laufzeit aus dem Netz geladen',
        'Schriften und Bilder gehören als Dateien in den Build (z. B. @fontsource), nicht als URL.', hits)
    : ok('Keine Ressource wird zur Laufzeit aus dem Netz geladen');
}

console.log('');
if (errors) {
  console.error(`${errors} Regel(n) verletzt. Begründungen in AGENTS.md.`);
  process.exit(1);
}
console.log('Alle maschinell prüfbaren Regeln eingehalten.');
