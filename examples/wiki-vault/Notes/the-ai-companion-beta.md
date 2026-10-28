---
id: "the-ai-companion-beta"
type: note
title: "The AI companion (beta)"
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
**The AI features are an early beta. Use them with care.** A local model can be wrong, invent details or ignore your notes, so read every proposal before you apply it. They were tried with LM Studio and Ollama but not tested exhaustively; quality depends on your model. Anyone who wants to improve them is welcome to fork the project.

**Tessarios is already a complete tool without the AI.** Entries, manuscript, graph, maps, media and backups all work without any model. You can ignore this note and lose nothing.

**The rule behind everything:** the app decides *where* something goes, the AI only supplies *what*. It never edits a file by itself. A reply arrives as a card showing the section as it is now next to the proposal, with Apply, Append and Discard. Until you click one, nothing has changed on disk. Fields in the frontmatter are yours alone: the AI neither fills nor changes them.

**It is local.** Tessarios talks to a server you run yourself, LM Studio or Ollama. No account, no API key, no cloud, unless you point the address at a remote server yourself.

### Set it up
1. Start LM Studio (or Ollama) and load a model.
2. In Tessarios: Settings → Local AI. Check the server address, press *Refresh Models*, choose the model.
3. Tell it your model's context length (*Context budget*) so the bar under the message box can warn you before the prompt gets too long.

### Two places it appears
- **Chronicles view:** the right panel is a conversation about the open entry. A dropdown above the message box names the one section the answer can land in.
- **Manuscript workspace:** the AI tab of the right column, working on the open scene (see [[Writing a book: the manuscript workspace]]).

### Tidy up entry
Answers to questions asked while *Open Questions* was targeted pile up in that section. **Tidy up entry** is a separate step that proposes moving single points into better-fitting sections. You review each one, and only Apply writes. Nothing is deleted, only moved, and a backup of the previous file is made first. Try it on [[Mira Okafor]].

### What shapes its answers
Plain text files, each overridable per vault: general rules (`AGENTS.md`), tone (`SOUL.md`), and your project's genre and audience (`PROJECT.md`). See [[Make it yours: templates and prompts]].