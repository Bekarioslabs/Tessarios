---
id: "a-vault-is-a-folder"
type: note
title: "A vault is a folder"
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
A Tessarios vault is a folder of plain `.md` files, one per entry, plus a hidden `.tessarios/` folder. There is no database. You can open every file in a text editor, or open the folder in Obsidian.

```
Vault/
  Books/ Chapters/ Scenes/ Characters/ Relationships/ Organizations/ Places/
  Powers/ Items/ Lore/ Storylines/ Visuals/ Maps/ Notes/ Brainstorms/
  assets/            images, as real files
  .tessarios/        backups, unfinished AI drafts, optional overrides
```

**An entry file** starts with a block of fields (called frontmatter) between two `---` lines, then the sections. `id` is the entry's permanent identity; the **file name** is the title in lower case with dashes and changes when you rename the entry. Links between entries use the title: `[[Mira Okafor]]`.

**What is safe to delete:** everything in `.tessarios/` can be removed without losing an entry. It is rebuilt or starts fresh.

**Images** are real files in `assets/`, referenced by relative path, not text buried in a field.

**Rename or delete in the app** and the real file is renamed or deleted. If a new name would collide with a file that belongs to another entry, Tessarios stops and asks instead of overwriting.