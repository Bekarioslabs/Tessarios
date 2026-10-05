# 🚀 Tesserios — Extension Ideas & Feature Roadmap

This document outlines potential future modules, tools, and enhancements for **Tesserios** (Offline-first Worldbuilding & Universe Management Suite).

---

## 🗺️ 1. Interactive Maps & Cartography Extensions
* **Multi-Layer Maps**: Toggle layers for Politics, Climate, Trade Routes, Topography, and Secret Factions.
* **Territory & Realm Borders**: Draw vector polygons or regions on maps with linked realm/faction entities.
* **Scale & Distance Measurement Tool**: Define canvas scale (e.g., `100px = 50km`) and calculate travel time or distance between pins.
* **Fog of War / Discovery Modes**: Mask unexplored regions for TTRPG campaign sessions or reader reveals.

---

## ⏳ 2. Interactive Timelines & Era System
* **Global Universe Timeline**: Visual linear & multi-track chronological timeline (Eras, Ages, Wars, Dynasties).
* **Entity Event Hooks**: Attach date ranges or timestamps to characters, events, and locations to automatically populate the timeline.
* **Concurrent Character Timelines**: Compare life spans and paths of multiple characters side-by-side.

---

## 🌳 3. Family Trees & Lineage Graph
* **Visual Genealogy Generator**: Interactive family trees for royal houses, bloodlines, and mentor/apprentice lineages.
* **Relationship Matrix**: Grid view highlighting alliance, rivalry, romance, or conflict between all active characters.

---

## ✍️ 4. Novel Writing & Manuscript Outliner
* **Chapter & Scene Manager**: Drag-and-drop hierarchy for organizing chapters, scenes, and acts.
* **POV & Location Tagging**: Assign point-of-view characters and locations to scenes with word count goals per chapter.
* **Character Arc Tracker**: Track character development stages, motivations, and internal/external conflicts across chapters.

---

## 🔍 5. AI Assistant & Consistency Audit Engine
* **Lore Consistency Auditor**: Scan markdown texts for conflicting statements (e.g., dead character acting in a later chapter, wrong birthplace).
* **AI World Generator Presets**: Custom prompt templates for generating names, heraldry, magic systems, and flora/fauna.
* **Smart Name Generator**: Culture-specific name synthesizer matching language aesthetics of specific factions.

---

## 📤 6. Export & Reader Suite
* **Interactive Vault Reader Mode**: Clean, presentation-style view for sharing lore with readers or players without edit controls.
* **EPUB & PDF Book Exporter**: Compile selected entities, chapters, and maps into formatted ebooks.
* **Obsidian & Notion Import/Export**: Bi-directional conversion between Markdown vault formats.

---

## 📦 7. File History & Vault Backup System
*(See proposed versioning architecture for non-cluttering revision history)*

---

## 📖 8. System Documentation for Forks & Contributors
*Not a feature — a prerequisite for anyone building on this without reverse-engineering it first.*

The pieces of the system are individually documented (`AGENTS.md` for coding rules,
`ARCHITECTURE.md` for structure, `docs/ki-spezifikation.md` for the AI), but
there is no single document explaining **how the whole thing fits together**. Someone
forking the project to add a new chronicle type, a new AI mode, or a different storage
backend currently has to read the source to find out what the extension points are.

What such a document needs to cover:

* **Vault format as the contract**: markdown files with YAML frontmatter are the only
  source of truth; everything else (index, summaries, sessions) is a derived view that
  may be deleted and rebuilt.
* **Template system**: what a `*.json` template defines, how `defaultContent` headings
  become dossier sections, how `fieldConfig` types drive both the editor and the AI's
  field validation, and how to add a template without touching code.
* **The `.ai.md` language**: the declarative per-section spec (`mode`, `creativity`,
  `context`, `corePoints`, `writePolicy`), the full list of supported context rules, and
  the default spec derived from the template when no `.ai.md` exists.
* **Workflow files**: how `src/ai/workflows/*.md` define steps, target sections/fields,
  and completion conditions.
* **The prompt layer stack**: which file supplies which layer (`AGENTS.md` constitution,
  `SOUL.md` conversational style, `PROJECT.md` per-vault orientation, `.ai.md` template
  instructions, workflow step, mode, resolved context, turn contract) and which of these
  a fork is expected to replace.
* **The action contract**: the `AIWorkflowAction` union as the only channel through which
  a model can affect the vault, and how validation constrains it per step.
* **Adding a new AI mode**: what mode 2 (Muse) and mode 3 (Lektor) plug into, and what a
  fourth one would need to implement.
* **Storage abstraction**: `IVaultStorage` as the seam for replacing the Electron file
  backend.
* **Theming**: the 18 semantic color tokens in `src/index.css` and why light mode works
  purely by variable redefinition.

Best written **after** the three AI modes are implemented, so it documents what exists
rather than what was planned — but before the API surface is treated as stable.
