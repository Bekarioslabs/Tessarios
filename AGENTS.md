# Tessarios — Agent Rules

> **Run `npm run check` before you say you are done.** It runs the type check, the build,
> and `scripts/check-rules.cjs`, which mechanically enforces the rules marked ⚙ below.
> A rule that a machine can verify is not a matter of opinion — if the check fails, the
> work is not finished.
>
> Why this file leads with that: an earlier version of it already said "use design tokens,
> not hardcoded hex", naming `bg-[#09090b]` and `bg-[#0d0d12]` explicitly. The codebase
> then accumulated **227** of them. Prose alone did not hold. The checks did.

---

## The five mistakes that actually happened

Each of these cost a full cleanup pass. They are listed first because they are the ones
that recur, not because they are the most interesting.

### 1 ⚙ Reinventing a component that already exists
There were **14** hand-rolled modal overlays while `BaseModal` sat unused; **3** byte-identical
copies of the right-panel tab bar; **3** separate toast implementations with different
positions, styling and timings; and a second dialog system (`CustomDialog`) duplicating
`BaseModal` but without ESC or click-outside.

**Before writing a component, grep for one that does the job.** The shared primitives are
`BaseModal`, `DangerConfirmDialog`, `Toast`, `RightPanelTabBar`, `IconButton`,
`CollapseToggle`, `EntityTypeBadge`. If you find two implementations of the same control
while working, consolidate them as part of the change you are already making.

### 2 ⚙ Inventing utility classes that generate nothing
`bg-zinc-850` and `bg-zinc-750` were used **20 times**. Neither exists in Tailwind, neither
was defined. They produced no CSS rule at all, so those borders fell back to `currentColor`
and drew in the element's text color. The same happened with a `light-mode:` variant that
was never registered.

**A class name that looks plausible is not a class name that exists.** The checker verifies
every color utility against the built stylesheet.

### 3 ⚙ Hardcoding values that belong in one place
227 raw hex colors, of which ~38 were near-duplicate typos of each other (`#09090c`,
`#0a0a0f`, `#0d0d13` — all within 1–3 luminance points of a dominant neighbour). The same
color was written two ways at once: `zinc-950` and `#09090b` are byte-identical.

Colors live in `src/index.css` as `--color-*` tokens. See the token list below.

### 4 ⚙ Leaving code that nothing can reach
Five fully implemented export/import functions in `Sidebar.tsx` that no button called.
A `linkNotification` state that was set but never rendered. An `associatedEntityId` field
updated on rename but never written by the linking UI. 68 unused imports in one file.
Three fully tested AI engine modules wired to nothing.

**Delete it or wire it.** Half-built is worse than absent — it reads as working.

### 5 ⚙ Translating some strings but not others
The English branch of the AI placeholder contained the German text verbatim. The main
navigation was never translated at all. The whole manuscript workspace was German-only.
Switching to English produced a half-German app.

Every user-visible string is bilingual: `language === 'en' ? '…' : '…'`.

---

## Rules a machine cannot check — but that still hold

- **Two systems for one concept is a bug, even when both work.** Loose media carried a
  fixed single category *and* a many-to-many link list; the category was never updated by
  the linking UI, so images stayed filed wherever they were uploaded. Before adding a
  field, check whether the relationship it describes is already expressed elsewhere.
- **Derive state rather than storing it** when the source of truth already exists. Media
  categories are now computed from actual links, so they cannot go stale.
- **Destructive actions confirm.** Deleting a map floor silently took every marker and
  region on it. Anything irreversible asks first, and says what will be lost.
- **Status indicators must reflect real state.** The footer read "AI Chronicler Ready"
  unconditionally, including when no model was loaded.
- **A render crash must not produce a blank window.** `ErrorBoundary` stays in place. For
  an app holding someone's entire writing vault, a white screen reads as data loss.
- **Stacking order is a system, not a per-case guess.** Ad-hoc z-index values (50, 80, 100,
  200, 1200, 9999) put the undo toast *below* every dialog, so its 7-second window could
  expire unseen.

---

## Design tokens

Defined in `src/index.css`. **This list is the truth; do not invent neighbours.**

| Group | Tokens |
|---|---|
| Surfaces | `surface-base` `surface-card` `surface-elevated` `surface-control` `surface-hover` `surface-active` |
| Lines | `line-subtle` `line` `line-strong` `line-highlight` |
| Text | `ink-heading` `ink-bright` `ink` `ink-secondary` `ink-muted` `ink-faint` `ink-disabled` |
| Other | `danger-surface` `overlay` `graph-edge` |

Used as `bg-surface-card`, `text-ink-muted`, `border-line/80` — opacity modifiers work.

Accent and status colors use the Tailwind scales (`indigo` = brand, `amber` = warning,
`emerald` = ok, `rose` = danger). Entity type hues live in `EntityTypeBadge.tsx`, which is
the single source for "which color means which category".

**Light mode is variables only.** `[data-theme="light"]` in `src/index.css` redefines
tokens and scale steps; Tailwind v4 compiles even its built-in colors to
`var(--color-amber-400)`, so a redefinition flips every usage. Never add a component-level
light-mode override, and never `!important` — the previous light mode was 215 lines of
exactly that, and it flattened every surface to two colors.

Two deliberate exceptions to the mirroring, both documented in `index.css`: the `900` step
does not mirror cleanly because it serves as both a tinted background and a chip border,
and the lower half of the ink ramp sits one step darker than a mirror would put it, because
grey-on-white loses perceived weight faster than grey-on-black.

---

## Stack

React 19 + TypeScript (`strict: true`) · Tailwind CSS v4 (`src/index.css`) · Vite ·
Electron (`main.cjs` / `preload.cjs`, `contextIsolation: true`) · local filesystem only ·
local AI via LM Studio / Ollama OpenAI-compatible endpoints. No cloud provider, no
IndexedDB, no browser storage.

State: `App.tsx` composes four hooks — `useEntityCrud`, `useVaultStorage`, `useLooseMedia`,
`useDialogState`. New cross-cutting state goes into a hook, not back into `App.tsx`.

## Vault layout (Obsidian-compatible)

```
<VaultRoot>/
├── Books/ Chapters/ Scenes/ Characters/ Relationships/ Organizations/ Places/
│   Powers/ Items/ Lore/ Storylines/ Visuals/ Maps/ Notes/ Brainstorms/
├── assets/                     # media as real files, referenced by relative path
└── .tessarios/                 # app-internal; tell Obsidian users to ignore this
    ├── backups/<Category>/<id>/<YYYY-MM-DD_HH-mm-ss>.md
    ├── full-backups/<YYYY-MM-DD_HH-mm-ss>.zip     # rolling, last 5
    ├── freeform-drafts.json, manuscript-drafts.json   # unfinished AI chat drafts
    └── AGENTS.md, SOUL.md, PROJECT.md, templates/     # optional per-vault overrides
```

Every `.md` must stand on its own as a readable Obsidian note: YAML frontmatter plus
Markdown body, images by relative path — not base64 buried in a field.

## Entity ID vs filename — never conflate

- **`id`**: stable, internal, assigned once, never changes. Lives in frontmatter.
  `relations[].targetId` and `mapMarkers[].targetEntityId` reference it. Never derived
  from a filename.
- **filename**: the slugified current title, for human legibility. Changes on rename.
- On rename: actually rename the file. Never leave the old one, never create a second
  file for the same `id`.
- **Collisions are never resolved silently.** If a target filename exists and belongs to a
  different `id`, stop and ask. Never auto-suffix, never auto-overwrite. Same for `assets/`.

## Storage boundary

- `markdown.ts` is the only place converting Entity ↔ Markdown.
- Nothing outside the storage adapter calls `window.vault` directly.
- Every `ipcMain.handle('vault:…')` validates paths against the vault root.
- Writes go through the sequential save queue.
- Before any save that modifies an existing entity, and before any delete, write the
  pre-change version to `.tessarios/backups/`.
- Deleting in the UI deletes the real file. No soft-delete-only-in-state.

## Working style

- German with the user; English for code, comments and commit messages.
- Complex changes: plan first, wait for approval. Simple fixes: proceed.
- `npm run check` before reporting done. Persistence changes get tested against a real
  app restart, not just hot reload.
- Report honestly. If something is untested, say which part. If a check fails, say so
  rather than describing the intent as if it were the outcome.
