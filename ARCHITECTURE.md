# Tessarios Architecture & Developer Guide

Welcome to the **Tessarios** codebase. This guide gives contributors a factual, current
overview of the tech stack, code organization, and extension points.

> **Looking for the AI system specifically?** What the AI does, what it deliberately does
> not do, and why is written down in [`docs/ki-spezifikation.md`](docs/ki-spezifikation.md)
> (German). This file stays at the "how the app is put together" level.

---

## Tech Stack & Overview

* **Framework**: React 19 + TypeScript + Vite 6
* **Runtime**: Electron — this is a desktop app, not a browser app. `main.cjs` is the
  Electron main process; `preload.cjs` exposes a narrow `window.vault` bridge to the
  renderer via `contextBridge`.
* **Styling**: Tailwind CSS v4 + Lucide Icons (`lucide-react`)
* **Graph rendering**: `d3`
* **Markdown engine**: custom parser supporting Obsidian-style syntax —
  WikiLinks (`[[Entity Title]]`), callout boxes (`> [!note]`, `> [!warning]`, `> [!tip]`,
  `> [!quote]`, `> [!bug]`, `> [!example]`), checklists (`- [ ]` / `- [x]`), tables. No
  LaTeX/math rendering.
* **AI**: a local, OpenAI-compatible chat endpoint (LM Studio or Ollama by default,
  configurable in Settings → AI) — not a cloud AI provider. `main.cjs` proxies the request;
  no API key is stored or required.
* **Persistence**: the vault is a folder of `.md` files on disk, read and written through
  the Electron IPC bridge (`src/utils/storage/ElectronStorage.ts`). No browser storage
  (localStorage/IndexedDB) holds vault data — only small UI preferences do. Export is ZIP
  only; there is no JSON export/import.

---

## Directory & File Structure

```
├── main.cjs                     # Electron main process: window, IPC handlers, AI proxy
├── preload.cjs                  # contextBridge: exposes window.vault to the renderer
├── ARCHITECTURE.md              # This file
├── AGENTS.md                    # Coding rules for this repo (not the AI's own rules)
├── docs/                        # AI specification, vault-authoring guide
├── scripts/check-rules.cjs      # Mechanical checks behind `npm run check`
├── src/
│   ├── main.tsx                 # App entry point
│   ├── App.tsx                  # Top-level layout, view routing, orchestrates the hooks below
│   ├── types.ts                 # Core TypeScript interfaces (LoreEntity, Template, Relation, …)
│   ├── index.css                # Design tokens (Tailwind v4 @theme) — dark/light mode source
│   │
│   ├── hooks/                   # State and orchestration, split by concern
│   │   ├── useEntityCrud.ts     # Create/update/delete entities, apply AI writes
│   │   ├── useVaultStorage.ts   # Vault folder lifecycle: connect, load, merge, sync
│   │   ├── useLooseMedia.ts     # Media not attached to any entity
│   │   ├── useDialogState.ts    # Shared confirm/alert dialog state
│   │   ├── useAiConnectionStatus.ts  # Polls the configured AI provider for readiness
│   │   ├── useManuscriptChat.ts # The manuscript companion: prompt assembly + conversation
│   │   └── useEntityTidyUp.ts   # "Tidy up entry": sorts Open Questions into other sections
│   │
│   ├── components/
│   │   ├── Editor.tsx           # Dossier editor: frontmatter fields + Markdown body
│   │   ├── MarkdownTextEditor.tsx    # The actual text area: toolbar, slash menu, shortcuts
│   │   ├── ManuscriptEditor.tsx # Book → Chapter → Scene workspace, with the AI tab
│   │   ├── MapEditor.tsx        # Interactive map canvas: pins, regions, floors
│   │   ├── GraphView.tsx        # d3 force-graph of entities connected by WikiLinks
│   │   ├── MediaView.tsx        # Media gallery, grouped by linked entity
│   │   ├── VaultStatsView.tsx   # Word counts, category breakdown, activity
│   │   ├── Sidebar.tsx          # Navigation tree, search, vault switcher
│   │   ├── SettingsModal.tsx    # Appearance, storage, AI provider and context budget, help
│   │   ├── UserManualModal.tsx  # In-app user manual (data in src/data/userManual.ts)
│   │   ├── AIAssistant.tsx      # Right-panel AI chat for dossiers
│   │   ├── ai/                  # ManuscriptChatPanel, TidyUpProposalList
│   │   ├── BaseModal.tsx        # Shared modal primitive — all dialogs go through this
│   │   ├── ErrorBoundary.tsx    # Top-level render-crash fallback
│   │   └── ui/                  # Small shared primitives (IconButton, CollapseToggle, …)
│   │
│   ├── ai/                      # The AI engine
│   │   ├── AGENTS.md            # The AI's own constitution (not this repo's coding rules)
│   │   ├── SOUL.md              # Conversational style
│   │   ├── PROJECT.md           # Generic project-orientation fallback
│   │   └── engine/              # Prompt composition, context resolution, section edits,
│   │                            # consistency checks, tidy-up logic; tests in __tests__/
│   │
│   ├── templates/{de,en}/       # Entity templates: *.json (fields/sections) + optional *.ai.md
│   │
│   └── utils/
│       ├── storage/              # IVaultStorage interface + ElectronStorage implementation
│       ├── vaultManager.ts       # Load/save the whole vault, backups
│       ├── templateLoader.ts     # Built-in + custom vault templates
│       ├── templateMatching.ts   # Recovers a template from an entity's tags; dossier gap calc
│       ├── markdown.ts           # Frontmatter serialize/parse, WikiLink detection
│       ├── manuscript.ts         # Book/Chapter/Scene hierarchy, status, word counts
│       ├── aiSettings.ts         # Context budget and the model's context length
│       ├── aiCancellation.ts     # Request ids and cancelling an in-flight AI request
│       ├── chatDraftStore.ts     # Per-entry unfinished chat drafts, persisted to the vault
│       └── i18n.ts               # DE/EN translations, built-in template registry
```

---

## Core Concepts

### The vault is the source of truth
A vault is a folder of Markdown files with YAML frontmatter, read and written through
`IVaultStorage`. Everything else — the in-memory entity index, revision backups under
`.tessarios/backups/`, unfinished chat drafts in `.tessarios/*-drafts.json` — is a derived
view that can be deleted and rebuilt. Nothing but the `.md` files themselves is canon.

### Entities & Templates
An entity (`LoreEntity` in `types.ts`) has a `type` (15 values — character, place,
organization, item, power, book, chapter, scene, storyline, relationship, map, lore, note,
brainstorm, visual), Markdown `content`, and `customFields` (the frontmatter). A `Template`
defines a starting point for a type: default fields with their input types
(`fieldConfig`), default `##` sections, and default tags. Multiple templates can share one
`type` (e.g. `character-hero` vs `character-antagonist`) — which one an entity came from is
recovered from the tags the template stamped on it (`resolveTemplateForEntity` in
`templateMatching.ts`), since the choice itself isn't stored on the entity.

### The AI
The AI is a set of small, separate features around one rule: **the app decides where
something goes, the AI only supplies what goes there**, and nothing is written until the
user clicks.

- **Dossier chat** (`AIAssistant.tsx`) — a conversation about the active entry, always aimed
  at one `##` section chosen from a dropdown.
- **Manuscript companion** (`useManuscriptChat.ts`, `ManuscriptChatPanel.tsx`) — beside an
  open scene, with two roles: a writing partner (proposals can be appended or written over
  a marked passage) and an editor (comments only, and a text-search check of the scene
  against the dossiers it links to).
- **Tidy up entry** (`aiTidyUp.ts`, `useEntityTidyUp.ts`) — an explicitly triggered step
  that proposes moving points out of "Open Questions" into better-fitting sections.

The AI never fills frontmatter fields and replies are plain prose, never a structured
action format a model has to get exactly right. The system prompt is assembled from layered
files — a global constitution (`src/ai/AGENTS.md`), conversational style (`SOUL.md`),
project orientation (`PROJECT.md`), and optionally a per-template `.ai.md`. Each has a
per-vault override under `.tessarios/` in the user's own vault, checked before the built-in
fallback. See [`docs/ki-spezifikation.md`](docs/ki-spezifikation.md) for the details.

---

## How to Extend Tessarios

### Add a keyboard shortcut or slash-menu item
Both live in `src/components/MarkdownTextEditor.tsx`: shortcuts in
`handleEditorKeyDown`, slash-menu items in the list feeding the `/` popup.

### Add a chapter to the in-app user manual
Append a `ManualSection` entry to `src/data/userManual.ts` — localized `en`/`de` title,
description, and content blocks. `UserManualModal.tsx` picks it up automatically.

### Add a new entity type or template
1. Add the type to `EntityType` in `types.ts` if it's genuinely new (not just a new
   template for an existing type).
2. Add a `*.json` template under `src/templates/de/` and `src/templates/en/`.
3. Optionally add a matching `*.ai.md` next to it for AI section/context rules — without
   one, the engine derives a default spec from the template's own `##` headings.
4. Register the type's icon/color in `EntityTypeBadge.tsx`.

### Add a context rule for the AI
Rules are a closed list in `VALID_CONTEXT_RULES` (`src/ai/engine/aiFrontmatterParser.ts`),
implemented in `AIContextResolver`. An unknown rule throws instead of silently resolving to
nothing — add it in both places and cover it in `__tests__/aiEnginePhase2.test.ts`.

---

## Development & Building

```bash
npm run electron:dev    # Dev server + Electron window (use this, not a stale build)
npm test                # AI engine and manuscript test suite
npm run check           # tsc --noEmit && vite build && rule checks && tests
npm run electron:build  # Production build + installer via electron-builder
```

`AGENTS.md` at the repo root documents the coding rules this project has learned the hard
way — read it before making structural changes.
