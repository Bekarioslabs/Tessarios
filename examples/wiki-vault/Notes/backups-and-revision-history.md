---
id: "backups-and-revision-history"
type: note
title: "Backups and revision history"
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
- **Per entry:** every time you edit an entry, Tessarios keeps previous versions under `.tessarios/backups/`. Open **Revision History** on an entry to compare an older version and restore it. How many it keeps is set in Settings → Storage & Vault (*Checkpoints per entry*).
- **After a deletion:** the backups of a deleted entry are kept for 30 days by default (*Keep deleted entries'* setting), then removed.
- **Whole vault:** *Create ZIP Backup Now* in Settings → Storage & Vault writes the entire vault to a ZIP file. Tessarios also makes one before risky steps, such as replacing the vault with a different folder.
- **The AI:** before any change that modifies an existing entry, the previous file version is saved. A proposal only reaches a file when you click.

**Still:** keep your own backups. These are a safety net, not a substitute for one.