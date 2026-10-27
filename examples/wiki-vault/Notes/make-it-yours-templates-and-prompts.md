---
id: "make-it-yours-templates-and-prompts"
type: note
title: "Make it yours: templates and prompts"
lastModified: 2026-10-27
tags:
  - note
  - wiki
NoteType: "Reminder"
Status: "Accepted"
Category: "Production"
Priority: "Low"
cssclasses:
  - dossier
  - dossier-note
---

## Content
You can change how Tessarios behaves without touching the program, by dropping files into the vault's `.tessarios/` folder.

- **Templates:** a file `.tessarios/templates/<name>.json` adds a template or replaces one with the same id. A matching `<name>.ai.md` adds AI instructions for that template.
- **Prompts:** `.tessarios/AGENTS.md` (general rules), `.tessarios/SOUL.md` (tone) and `.tessarios/PROJECT.md` (your project's genre, audience and standing rules) replace the built-in defaults. This vault ships a `PROJECT.md` as an example.

Put *style and rules* in `PROJECT.md`, not names and plot facts: those live in the entries and are pulled in when relevant.