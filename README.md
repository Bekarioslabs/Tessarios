# Tessarios

A local desktop app for building story worlds and writing the book inside them.

Everything lives as plain Markdown files with YAML frontmatter in a folder on your disk
(a *vault*, Obsidian-compatible). An optional AI companion runs on a local model, proposes
text as a before/after card, and never changes a file until you click.

> **Tessarios is finished.** This is the final version: no updates, no bug fixes, no
> support; issues and pull requests are not accepted. The source is public under the AGPL so
> anyone can use, study and continue it. Forks are welcome.

## Download and run

Download `Tessarios-1.0.0-win.zip` from the repository's Releases page, unzip it anywhere
and start `Tessarios.exe`. Nothing is installed, and you do not need Node.js or npm. It is
a 64-bit Windows 10/11 build.

The zip also contains a folder `Tessarios Wiki`: a small wiki written as a vault, with one
example for every entry type. On the start screen, **Open the Tessarios Wiki** copies it to
`Documents/Tessarios Wiki` and opens that copy, so the folder next to the exe stays as the
original. Start with the note *Start here*. To start over, delete the copy in Documents and
click the button again.

The build is not code-signed, so Windows may show "Windows protected your PC". Click
"More info", then "Run anyway". Only do this if you trust where you got the file; you can
also build it yourself from the source (below) and compare.

## Limitations

- Developed and tested on Windows only. Builds are not code-signed.
- No update check and no auto-update. The Chromium inside Electron stays at the version of
  the build and will age. The app loads no remote content, which limits the exposure, but do
  not use it to browse the web.
- **The AI features are an early beta. Use them with care.** A local model can be wrong, invent
  details or ignore your notes, so read every proposal before you apply it. They were tried with
  LM Studio and Ollama but not tested exhaustively; the quality depends on your model. Nothing is
  written without your click and the previous file version is saved first, but that is a safety
  net, not a guarantee. Anyone who wants to improve them is welcome to fork.
- **Tessarios is a complete tool without the AI.** The vault of typed entries, the manuscript
  workspace, the relationship graph, maps, media, search and the version history all work without
  any model.
- German and English interface only. The files are Obsidian-compatible, but Obsidian plugins
  and Canvas are not supported.
- Keep your own backups. The app saves older versions under `.tessarios/backups/`, which is a
  safety net and not a substitute.

## What it does

- **Vault of typed entries** — characters, places, organisations, powers, items, lore,
  storylines, maps and more, each from a template with typed fields (dropdowns, links to
  other entries) and fixed sections. German and English templates and interface.
- **Manuscript workspace** — Book → Chapter → Scene with status and word counts.
- **Local AI (early beta), proposals only** — a dossier chat aimed at one section at a time, a writing
  partner / editor beside each scene, and a "tidy up" step that sorts Open Questions into
  better-fitting sections. Every write is a before/after proposal you confirm, and the
  previous file version is saved first. See [`docs/ki-spezifikation.md`](docs/ki-spezifikation.md)
  (German).
- **Relationship graph, interactive maps, media gallery, revision history.**

## Requirements

Only to build from source; the zip needs none of this.

- Node.js and npm
- For the AI features: [LM Studio](https://lmstudio.ai) or [Ollama](https://ollama.com)
  running locally. No API key and no cloud account are involved; the rest of the app works
  without it.

## Run it

```bash
npm install
npm run electron:dev    # Vite dev server + Electron window
```

Other commands:

```bash
npm test                # AI engine and manuscript test suite
npm run check           # type check, production build, repo rules, tests
npm run electron:build  # production build and Windows zip in release/ (electron-builder)
```

`npm run check` must pass before a change is considered done; the rules it enforces are
explained in [`AGENTS.md`](AGENTS.md).

## Where to look

| | |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the app is put together, and where to extend it |
| [`AGENTS.md`](AGENTS.md) | Coding rules this project learned the hard way |
| [`docs/ki-spezifikation.md`](docs/ki-spezifikation.md) | What the AI does and deliberately does not do |
| [`docs/tessarios-vault-bauanleitung.md`](docs/tessarios-vault-bauanleitung.md) | Building a vault from existing text (e.g. with ChatGPT), German |
| [`examples/`](examples/) | A wiki written as a vault: one example per entry type, plus notes on the app |
| [`FUTURE_IDEAS.md`](FUTURE_IDEAS.md) | Ideas that are not built |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | Licences of bundled components |

## Licence

Tessarios is free software under the **GNU Affero General Public License, version 3 or
later** ([`LICENSE`](LICENSE)). Copyright (C) 2026 Beka Gwarliani (Bekarioslabs).

In short: you may use, study, change and share it, including for paid work. If you
distribute it or run a modified version as a network service, you must offer the source of
your version under the same licence. Forks should use a different name and logo. The example
images in `examples/wiki-vault/assets/` (generated with ChatGPT and Gemini) are not covered by the
AGPL.

Third-party components and their licences are listed in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), generated by `npm run licenses`;
regenerate it whenever dependencies change. The app makes no network requests of its own
(fonts are bundled, there is no telemetry); the only traffic is to the AI address you
configure. The project is finished and takes no contributions: see
[`CONTRIBUTING.md`](CONTRIBUTING.md).
