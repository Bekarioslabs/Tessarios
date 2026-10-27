# Example vault: the Tessarios wiki

`wiki-vault/` is a vault about Tessarios, written as a vault. Open it in the app and learn the
app by using it: every one of the 15 entry types has an example entry with a tip box at the top
that says what the type is for and what you can do with it, and a set of notes explains the
app around the entries (files, links, the manuscript workspace, the AI, maps and media, backups,
settings).

The example world is a children's adventure, *The Lamp Under the Pier*. It is only there so the
examples have something to talk about.

## Open it

In the Windows zip this folder is already there, next to `Tessarios.exe`, named `Tessarios Wiki`.

1. Copy the `wiki-vault` folder somewhere you can write to. Saving from the app rewrites files,
   so work on a copy if you want to keep this one pristine.
2. In Tessarios: **Settings → Storage & Vault → Select Vault Folder**, pick the copy.
3. Set the interface to English (**Settings → General**) and start with the note **Start here**.

The AI features need a local model server (LM Studio or Ollama) and are beta; everything else
works without one.

## What is in it

| Where | What it shows |
|---|---|
| `Notes/Start here` | An index with one example per entry type, and links to every note |
| `Characters/Mira Okafor` | A full dossier with a cover image. Its **Open Questions** hold five loose points for **Tidy up entry** |
| `Scenes/Scene_K02_S01 – Mr. Halvorsen Says Nothing` | In the manuscript workspace, the AI tab in the Editor role flags that the scene contradicts his dossier, without asking the model |
| `Maps/Greywater Bay Map` | Pins linked to entries |
| `Maps/Saltmarsh Pier Harbour Plan` | Regions, two floors and pins on one map |
| `Items/Star Blade`, `Visuals/Mira Okafor – Reference Board` | Concept art as a cover image, and a gallery |
| `assets/Character sheet 02.png` | Deliberately not linked to anything: the media note shows how to link it |
| `.tessarios/PROJECT.md` | The project-orientation file the AI reads on every request |

All images are in `wiki-vault/assets/`. They are examples and not part of the program.

## Format

Each file follows the format in
[`docs/tessarios-vault-bauanleitung.md`](../docs/tessarios-vault-bauanleitung.md): frontmatter
fields from the English templates, the template's sections, links as `[[Title]]`, and file names
that are the slug of the title. `npm test` loads this vault with the app's own loader and checks
that every entry type is present, every link and map pin resolves, and every image exists.
