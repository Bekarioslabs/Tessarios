# Example vault

`demo-vault/` is a small, fictional vault — *The Lamp Under the Pier*, a children's adventure
set in a harbour town — that exercises most of what Tessarios does. It is plain Markdown; open
the folder as a vault (**Settings → Storage → Select Vault Folder**) and set the interface to
English.

It contains no images. Add your own to see covers, galleries and maps with markers.

## What to look at

| Where | What it shows |
|---|---|
| `Characters/Mira Okafor` | A full character dossier. Its **Open Questions** hold five loose points, which is what **Tidy up entry** sorts into the other sections. |
| `Scenes/Scene_K02_S01 – Mr. Halvorsen Says Nothing` → AI tab → **Editor** | The scene calls him "fully informed"; his dossier says `clueless`. The editor role flags it by plain text search, without asking the model. |
| Manuscript workspace | Book → chapter → scene with status and word counts. |
| Graph view | Every entry links to others through `[[wikilinks]]` in its fields and text. |
| `.tessarios/PROJECT.md` | The project-orientation file the AI reads on every request (genre, tone, audience). |

## Use it as a reference

Each file follows the format described in
[`docs/tessarios-vault-bauanleitung.md`](../docs/tessarios-vault-bauanleitung.md): frontmatter
fields from the English templates, the template's sections, links as `[[Title]]`, no
`relations:` block, and filenames that are the slug of the title.

The AI features need a local model server (LM Studio or Ollama); everything else works without
one. Saving from the app rewrites files, so work on a copy if you want to keep the example
pristine.
