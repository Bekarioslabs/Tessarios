/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export interface ManualSection {
  id: string;
  title: { en: string; de: string };
  iconName: string;
  description: { en: string; de: string };
  content: {
    en: { heading: string; body: string }[];
    de: { heading: string; body: string }[];
  };
}

export const USER_MANUAL_DATA: ManualSection[] = [
  {
    id: 'vault-is-truth',
    title: { en: '1. The Vault Is the Truth', de: '1. Der Tresor ist die Wahrheit' },
    iconName: 'BookOpen',
    description: {
      en: 'What a vault actually is on disk, and why everything else can be deleted and rebuilt.',
      de: 'Was ein Tresor auf der Festplatte wirklich ist, und warum alles andere löschbar und neu aufbaubar ist.'
    },
    content: {
      en: [
        {
          heading: 'Plain Markdown files, nothing hidden',
          body: 'A Tessarios vault is a folder of `.md` files on your computer, one per entry, with a short block of structured data (frontmatter) at the top and your actual text below. There is no database and no proprietary format. You can open any file in a plain text editor, or in Obsidian, and read exactly what Tessarios sees.'
        },
        {
          heading: 'Connecting a folder',
          body: 'In **Settings -> Storage -> Select Vault Folder**, pick or create a folder on disk. From then on, every change is written straight to those files. Nothing lives only in the app.'
        },
        {
          heading: 'What is derived, not truth',
          body: 'Inside your vault, Tessarios keeps a hidden `.tessarios/` folder: `backups/` (older versions of each entry), `freeform-drafts.json` (an in-progress chat message per entry), and optionally your own `PROJECT.md`/`SOUL.md`/`AGENTS.md` overrides. Everything in `.tessarios/` can be deleted without losing your actual entries — it will simply be rebuilt or start fresh.'
        }
      ],
      de: [
        {
          heading: 'Reine Markdown-Dateien, nichts versteckt',
          body: 'Ein Tessarios-Tresor ist ein Ordner mit `.md`-Dateien auf deinem Computer, eine pro Eintrag, oben ein kurzer Block strukturierter Daten (Frontmatter) und darunter dein eigentlicher Text. Keine Datenbank, kein Sonderformat. Du kannst jede Datei in einem normalen Texteditor oder in Obsidian öffnen und siehst genau das, was Tessarios sieht.'
        },
        {
          heading: 'Einen Ordner verbinden',
          body: 'Unter **Einstellungen -> Speicher -> Tresor-Ordner auswählen** wählst oder erstellst du einen Ordner auf der Festplatte. Ab dann schreibt jede Änderung direkt in diese Dateien. Nichts existiert nur in der App.'
        },
        {
          heading: 'Was abgeleitet ist, nicht die Wahrheit',
          body: 'In deinem Tresor legt Tessarios einen versteckten Ordner `.tessarios/` an: `backups/` (ältere Fassungen jedes Eintrags), `freeform-drafts.json` (eine laufende Chat-Nachricht je Eintrag) und optional deine eigenen Überschreibungen `PROJECT.md`/`SOUL.md`/`AGENTS.md`. Alles in `.tessarios/` kann gelöscht werden, ohne dass ein Eintrag verloren geht — es wird einfach neu aufgebaut oder fängt leer an.'
        }
      ]
    }
  },
  {
    id: 'first-character-walkthrough',
    title: { en: '2. Walkthrough: Empty Vault to First Character', de: '2. Durchgang: Von leer bis zur ersten Figur' },
    iconName: 'Sparkles',
    description: {
      en: 'One concrete path from a fresh vault to a finished dossier, including what actually lands on disk.',
      de: 'Ein konkreter Weg von einem frischen Tresor bis zum fertigen Dossier, inklusive dem, was tatsächlich auf der Platte landet.'
    },
    content: {
      en: [
        {
          heading: '1. Connect a folder',
          body: 'Settings -> Storage -> Select Vault Folder. Pick an empty folder. Tessarios creates the category subfolders (Characters, Places, …) as they are needed.'
        },
        {
          heading: '2. Create the entry',
          body: 'Sidebar -> the "Forge New Entry" button. Choose type Character and the Hero template, give it a title. Tessarios writes a new file with the template\'s empty frontmatter fields and empty `##` sections already in place — nothing is guessed or pre-filled beyond that.'
        },
        {
          heading: '3. Fill in the fields yourself',
          body: 'Age, role, group, and the links to other entries are quicker to type than to talk through — start typing `[[` to link an existing entry. The right panel keeps a running line like "10 fields open - 9 sections empty"; that count is calculated from the template, not written by anyone, so it is exactly what is still blank.'
        },
        {
          heading: '4. Use the chat for the prose sections',
          body: 'The right panel is an open conversation about this entry. Pick the section you want to work on from the dropdown above the message box — that is the only place an answer can land — and ask for what you need ("what drives her?", "shorter", "make the second point more hesitant"). Nothing is written while you are talking.'
        },
        {
          heading: '5. Accept a proposal',
          body: 'The reply arrives as a card showing what the section says today next to what is proposed, with "Apply", "Append" and "Discard". Only a click writes it to the file — Append keeps what is already there and adds below it.'
        },
        {
          heading: '6. What actually landed on disk',
          body: 'Open the file in a text editor and you will see exactly this shape:\n\n```\n---\nid: "ilka"\ntype: character\ntitle: "Ilka"\nAlter: "8"\nRolle: "Hauptheld"\n---\n\n## Charakterkern\nSie will beweisen, dass klein sein kein Nachteil ist...\n\n## Alltag & Persönlichkeit\n```\n\nA field you typed is a plain frontmatter line. A section you accepted is plain text under its `##` heading. Nothing more.'
        },
        {
          heading: '7. Pause and come back',
          body: 'Closing the panel (or the whole app) does not lose an unfinished draft. Each entry keeps its own — the chosen section, your typed message, and the latest unapplied reply — in `.tessarios/freeform-drafts.json`, so coming back later finds it as you left it.'
        }
      ],
      de: [
        {
          heading: '1. Ordner verbinden',
          body: 'Einstellungen -> Speicher -> Tresor-Ordner auswählen. Einen leeren Ordner wählen. Tessarios legt die Kategorie-Unterordner (Charaktere, Orte, …) an, sobald sie gebraucht werden.'
        },
        {
          heading: '2. Eintrag anlegen',
          body: 'Sidebar -> Knopf "Neuen Eintrag schmieden". Typ Charakter und Vorlage Held wählen, Titel vergeben. Tessarios schreibt eine neue Datei mit den leeren Frontmatter-Feldern und leeren `##`-Abschnitten der Vorlage — mehr wird nicht geraten oder vorbelegt.'
        },
        {
          heading: '3. Die Felder selbst ausfüllen',
          body: 'Alter, Rolle, Gruppe und die Verknüpfungen zu anderen Einträgen sind schneller getippt als besprochen — `[[` eingeben verlinkt einen bestehenden Eintrag. Die rechte Leiste führt nebenher eine Zeile wie "10 Felder offen · 9 Abschnitte leer" mit; diese Zahl wird aus der Vorlage berechnet, von niemandem hingeschrieben, und zeigt exakt, was noch fehlt.'
        },
        {
          heading: '4. Den Chat für die Fließtext-Abschnitte nutzen',
          body: 'Die rechte Leiste ist ein offenes Gespräch über diesen Eintrag. Wähle über der Auswahlliste den Abschnitt, an dem du arbeiten willst — nur dort kann eine Antwort landen — und frag, was du brauchst („was treibt sie an?", „kürzer", „mach den zweiten Punkt zurückhaltender"). Während des Gesprächs wird nichts geschrieben.'
        },
        {
          heading: '5. Einen Vorschlag übernehmen',
          body: 'Die Antwort kommt als Karte, die zeigt, was im Abschnitt bisher steht, daneben den Vorschlag, mit "Übernehmen", "Anhängen" und "Verwerfen". Erst ein Klick schreibt in die Datei — "Anhängen" behält das Bestehende und setzt darunter.'
        },
        {
          heading: '6. Was tatsächlich auf der Platte steht',
          body: 'Öffnest du die Datei in einem Texteditor, siehst du genau das:\n\n```\n---\nid: "ilka"\ntype: character\ntitle: "Ilka"\nAlter: "8"\nRolle: "Hauptheld"\n---\n\n## Charakterkern\nSie will beweisen, dass klein sein kein Nachteil ist...\n\n## Alltag & Persönlichkeit\n```\n\nEin getipptes Feld ist eine schlichte Frontmatter-Zeile. Ein übernommener Abschnitt ist schlichter Text unter seiner `##`-Überschrift. Nicht mehr.'
        },
        {
          heading: '7. Pausieren und wiederkommen',
          body: 'Die Leiste zu schließen (oder die ganze App) verliert einen unfertigen Entwurf nicht. Jeder Eintrag hält seinen eigenen — den gewählten Abschnitt, deine getippte Nachricht und die letzte noch nicht übernommene Antwort — in `.tessarios/freeform-drafts.json`. Später wiederkommen findet alles unverändert vor.'
        }
      ]
    }
  },
  {
    id: 'entries-and-templates',
    title: { en: '3. Entries & Templates', de: '3. Einträge & Vorlagen' },
    iconName: 'FileText',
    description: {
      en: 'The 15 entry types, what a template defines, and how entries link to each other.',
      de: 'Die 15 Eintragstypen, was eine Vorlage festlegt, und wie Einträge sich verlinken.'
    },
    content: {
      en: [
        {
          heading: 'Types & templates',
          body: 'Tessarios has 15 entry types: characters, places, organizations, items, powers, books, chapters, scenes, storylines, relationships, maps, lore, notes, brainstorms, and visuals. Several types have more than one template — for example Character has separate Hero, Antagonist, and Supporting templates, each with different frontmatter fields and dossier sections.'
        },
        {
          heading: 'WikiLinks',
          body: 'Type `[[` and start typing a title to link to another entry — Tessarios suggests existing entries or lets you create a new one on the spot. "Auto-Detect WikiLinks" scans your text for names that match existing entries and offers to link them automatically.'
        },
        {
          heading: 'Custom templates',
          body: 'A `.tessarios/templates/*.json` file in your vault adds or overrides a template without touching the app itself. The same applies to a matching `.tessarios/templates/*.ai.md` for AI-specific instructions — see the AI Chronikler section.'
        }
      ],
      de: [
        {
          heading: 'Typen & Vorlagen',
          body: 'Tessarios kennt 15 Eintragstypen: Charaktere, Orte, Organisationen, Gegenstände, Kräfte, Bücher, Kapitel, Szenen, Storylines, Beziehungen, Karten, Lore, Notizen, Brainstorms und Visuals. Mehrere Typen haben mehr als eine Vorlage — Charakter etwa hat getrennte Vorlagen für Held, Antagonist und Nebenfigur, jede mit eigenen Frontmatter-Feldern und Dossier-Abschnitten.'
        },
        {
          heading: 'WikiLinks',
          body: 'Tippe `[[` und beginne einen Titel zu schreiben, um einen anderen Eintrag zu verlinken — Tessarios schlägt bestehende Einträge vor oder legt auf der Stelle einen neuen an. "Auto-Detect WikiLinks" durchsucht deinen Text nach Namen, die zu bestehenden Einträgen passen, und bietet an, sie automatisch zu verlinken.'
        },
        {
          heading: 'Eigene Vorlagen',
          body: 'Eine Datei `.tessarios/templates/*.json` in deinem Tresor ergänzt oder überschreibt eine Vorlage, ohne die App selbst anzufassen. Dasselbe gilt für eine passende `.tessarios/templates/*.ai.md` für KI-spezifische Anweisungen — siehe Abschnitt zum KI-Chronikler.'
        }
      ]
    }
  },
  {
    id: 'manuscript-workspace',
    title: { en: '4. Manuscript Workspace', de: '4. Manuskript-Arbeitsplatz' },
    iconName: 'PenTool',
    description: {
      en: 'Book -> Chapter -> Scene hierarchy, status tracking, and word counts.',
      de: 'Buch -> Kapitel -> Szene Hierarchie, Statusverfolgung und Wortzählung.'
    },
    content: {
      en: [
        {
          heading: 'Hierarchy',
          body: 'The Manuscript workspace organizes writing as Book -> Chapter -> Scene. A chapter cannot be created without first choosing a book; a scene needs a chapter. This keeps the tree meaningful instead of a flat list of loose scenes.'
        },
        {
          heading: 'Status & word counts',
          body: 'Each scene and chapter carries a status (Draft, In Progress, In Revision, Done) and an automatically computed word count, rolled up from scene to chapter to book.'
        },
        {
          heading: 'Manuscript vs. planning text',
          body: 'A chapter or scene entry can have both a `## Manuskript` section (the actual prose) and other sections for planning notes. Only the Manuskript section is meant to be the story itself.'
        },
        {
          heading: 'Writing with the AI',
          body: 'The right column has two tabs: **Dossier** (look something up while writing) and **AI**. The AI tab works on the open scene and wears one of two hats. **Writing partner** proposes prose; **Editor** only comments and has no apply buttons at all, so you cannot accidentally paste a critique into your story.'
        },
        {
          heading: 'Two ways in, no blind overwrite',
          body: '**Append** adds the proposal to the end of the scene — nothing already written can be lost. **Replace selection** becomes available once you mark a passage in the editor, and writes over exactly that passage; a single undo takes it back. There is no button that overwrites a whole scene.'
        },
        {
          heading: 'What it knows',
          body: 'It sees the scene, which book and chapter it belongs to, how the previous scene ends (so a continuation actually joins on), and the dossier of every entry the scene links with `[[…]]` — no need to maintain relations first. Your `PROJECT.md` supplies genre, tone and audience.'
        },
        {
          heading: 'The context bar',
          body: 'Under the message box, a bar shows how full the model\'s context would be for your *next* request — including everything: the prompt layers, the scene, the previous scene\'s ending, linked dossiers and the running conversation. Amber means it is getting tight (the answer needs room too); red means your server is already discarding the front of the prompt. Set your model\'s context length under Settings -> AI so the bar has something true to measure against. The token count is an estimate — only your server knows the exact number.'
        },
        {
          heading: 'The consistency check runs without being asked',
          body: 'In the Editor role, a warning box lists where the scene disagrees with a dossier it links to — the dossier says "Protagonist", the scene calls her the "Antagonist". This is plain text search over dropdown-field values, not the AI, so it stands there before you type anything and costs nothing. It is shown, never enforced: the scene may simply be ahead of a dossier you have not updated yet.'
        }
      ],
      de: [
        {
          heading: 'Hierarchie',
          body: 'Der Manuskript-Arbeitsplatz gliedert Text als Buch -> Kapitel -> Szene. Ein Kapitel lässt sich nicht anlegen, ohne vorher ein Buch zu wählen; eine Szene braucht ein Kapitel. Das hält den Baum sinnvoll, statt zu einer losen Liste von Szenen zu werden.'
        },
        {
          heading: 'Status & Wortzahl',
          body: 'Jede Szene und jedes Kapitel trägt einen Status (Entwurf, In Bearbeitung, In Überarbeitung, Fertig) und eine automatisch berechnete Wortzahl, die von Szene über Kapitel bis zum Buch aufsummiert wird.'
        },
        {
          heading: 'Manuskript vs. Planungstext',
          body: 'Ein Kapitel- oder Szene-Eintrag kann sowohl einen Abschnitt `## Manuskript` (die eigentliche Prosa) als auch andere Abschnitte für Planungsnotizen haben. Nur der Manuskript-Abschnitt ist als eigentliche Geschichte gedacht.'
        },
        {
          heading: 'Mit der KI schreiben',
          body: 'Die rechte Spalte hat zwei Reiter: **Dossier** (beim Schreiben etwas nachschlagen) und **KI**. Der KI-Reiter arbeitet an der geöffneten Szene und trägt einen von zwei Hüten. Der **Schreibpartner** schlägt Text vor; der **Lektor** kommentiert nur und hat gar keine Übernehmen-Knöpfe — eine Kritik kann so nicht versehentlich in der Geschichte landen.'
        },
        {
          heading: 'Zwei Wege hinein, kein blindes Überschreiben',
          body: '**Anhängen** setzt den Vorschlag an das Ende der Szene — Geschriebenes kann dabei nicht verloren gehen. **Auswahl ersetzen** wird erst aktiv, wenn du im Editor eine Stelle markierst, und überschreibt genau diese Stelle; ein einzelnes Rückgängig nimmt es zurück. Einen Knopf, der eine ganze Szene überschreibt, gibt es nicht.'
        },
        {
          heading: 'Was sie weiß',
          body: 'Sie sieht die Szene, zu welchem Buch und Kapitel sie gehört, wie die vorherige Szene endet (damit eine Fortsetzung wirklich anschließt) und das Dossier jedes Eintrags, den die Szene mit `[[…]]` verlinkt — Beziehungen müssen dafür nicht gepflegt sein. Genre, Ton und Zielgruppe kommen aus deiner `PROJECT.md`.'
        },
        {
          heading: 'Der Kontext-Balken',
          body: 'Unter dem Nachrichtenfeld zeigt ein Balken, wie voll der Kontext des Modells bei deiner *nächsten* Anfrage wäre — mit allem darin: Prompt-Ebenen, Szene, Ende der vorherigen Szene, verlinkte Dossiers und der laufende Gesprächsverlauf. Bernstein heißt, es wird eng (die Antwort braucht auch Platz); Rot heißt, dein Server wirft bereits den Anfang des Prompts weg. Trag unter Einstellungen -> KI die Kontextlänge deines Modells ein, damit der Balken etwas Wahres als Maßstab hat. Die Token-Zahl ist geschätzt — die genaue kennt nur dein Server.'
        },
        {
          heading: 'Die Konsistenzprüfung läuft ungefragt',
          body: 'In der Lektor-Rolle listet ein Warnkasten auf, wo die Szene einem verlinkten Dossier widerspricht — im Dossier steht „Protagonist", die Szene nennt sie „Antagonist". Das ist schlichte Textsuche über Auswahlfeld-Werte, nicht die KI: Es steht da, bevor du irgendetwas tippst, und kostet nichts. Es wird angezeigt, nie erzwungen — die Szene kann einem Dossier schlicht voraus sein, das du noch nicht nachgezogen hast.'
        }
      ]
    }
  },
  {
    id: 'ai-chronicler',
    title: { en: '5. The AI', de: '5. Die KI' },
    iconName: 'Sparkles',
    description: {
      en: 'Where the AI appears, what controls its behavior, and how to override it per vault.',
      de: 'Wo die KI auftaucht, was ihr Verhalten steuert, und wie du es pro Tresor überschreibst.'
    },
    content: {
      en: [
        {
          heading: 'The guiding rule',
          body: 'The app decides *where* something goes; the AI only supplies *what* goes there. The AI is never asked to pick a destination — you choose the section, and its answer can reach nowhere else.'
        },
        {
          heading: 'Where it appears',
          body: 'In the Chronicles view it is the right panel: an open conversation about the active entry, always targeting one named `##` section chosen from a dropdown above the message box. There is no way to ask it to rewrite a whole entry; the dropdown is the only destination it can write to. Frontmatter fields are yours alone — it neither fills them nor changes them. In the Manuscript workspace it appears instead as the AI tab of the right column, working on the open scene (see section 4).'
        },
        {
          heading: 'Nothing is written without you',
          body: 'The AI never edits a file directly. A reply lands as a card showing what the section currently says next to what is proposed, with "Apply"/"Append"/"Discard". Until one of those is clicked, nothing has changed on disk.'
        },
        {
          heading: 'Drafts persist too',
          body: 'Each entry keeps its own draft — the chosen section, your typed message, and the latest unapplied reply — saved to disk, so switching to another entry to check something and coming back leaves it exactly as you left it. A "Reset" button appears once there is something to clear, wiping that entry\'s draft from disk immediately. Only the latest reply is saved to disk across a restart — see "Refining a draft" below for what stays in memory while a conversation is running.'
        },
        {
          heading: 'Refining a draft',
          body: 'You can push back on a proposal instead of accepting or discarding it outright — "make the first point more hesitant", "shorter" — and the AI revises with the earlier round in mind. The chosen *section* is the topic that memory belongs to: switching the dropdown starts it fresh, on purpose. This working memory isn\'t written to disk; only the latest state is (see above and the walkthrough\'s section 7).'
        },
        {
          heading: 'Tidy up entry',
          body: 'Answers to questions you asked while an entry\'s "Offene Fragen"/"Open Questions" section was targeted pile up there permanently — the dropdown always writes to one chosen destination, it never guesses a better one. "Tidy up entry" is a separate, explicitly triggered step for exactly that: it shows up only when the entry has its own standalone Open Questions section (not a combined one like "Secrets & Open Questions"), and proposes moving individual points into better-fitting sections. Review each proposal, uncheck any you want left alone, and only "Apply" writes — one point of certainty: nothing is deleted, only moved, and a backup of the pre-change file is made automatically like any other edit.'
        },
        {
          heading: 'Local AI, not cloud',
          body: 'Tessarios talks to a local AI server you run yourself — LM Studio or Ollama by default, configurable in Settings -> AI. No API key, no cloud account, no data leaves your machine unless you point it at one yourself.'
        },
        {
          heading: 'What shapes its behavior',
          body: 'The AI\'s system prompt is built from a few plain text files, each overridable per vault:\n\n- `AGENTS.md` — general rules (never invent facts, respect existing canon, write only into the requested field or section).\n- `SOUL.md` — conversational tone.\n- `PROJECT.md` — your project\'s genre, tone, and standing rules (age group, what kind of danger is allowed, narrative POV rules). Deliberately *not* a place for character names or plot facts — those live in the entries themselves and are pulled in automatically when relevant.\n\nDrop your own version of any of these as `.tessarios/AGENTS.md`, `.tessarios/SOUL.md`, or `.tessarios/PROJECT.md` inside your vault, and it takes priority over the built-in default — no code changes needed.'
        }
      ],
      de: [
        {
          heading: 'Der Leitsatz',
          body: 'Die Anwendung entscheidet, *wohin* etwas gehört; die KI liefert nur, *was* dort hingehört. Die KI wird nie gefragt, wo etwas landen soll — du wählst den Abschnitt, und woanders kann ihre Antwort gar nicht hin.'
        },
        {
          heading: 'Wo sie auftaucht',
          body: 'In der Chronik-Ansicht ist sie die rechte Leiste: ein offenes Gespräch über den aktiven Eintrag, immer auf genau einen benannten `##`-Abschnitt gerichtet, gewählt über eine Auswahlliste oberhalb des Nachrichtenfelds. Es gibt keine Möglichkeit, sie einen ganzen Eintrag neu schreiben zu lassen; die Auswahlliste ist das einzige Ziel, in das sie schreiben kann. Die Frontmatter-Felder gehören dir allein — sie füllt sie weder aus noch ändert sie sie. Im Manuskript-Arbeitsplatz sitzt sie stattdessen im KI-Reiter der rechten Spalte und arbeitet an der geöffneten Szene (siehe Abschnitt 4).'
        },
        {
          heading: 'Nichts wird ohne dich geschrieben',
          body: 'Die KI ändert nie direkt eine Datei. Eine Antwort landet als Karte, die zeigt, was im Abschnitt bisher steht neben dem Vorschlag, mit "Übernehmen"/"Anhängen"/"Verwerfen". Bis eines davon geklickt ist, hat sich auf der Platte nichts geändert.'
        },
        {
          heading: 'Auch Entwürfe bleiben erhalten',
          body: 'Jeder Eintrag hält seinen eigenen Entwurf — den gewählten Abschnitt, deine getippte Nachricht und die letzte noch nicht übernommene Antwort — auf der Platte gespeichert. Kurz bei einem anderen Eintrag nachschauen und zurückkommen lässt alles unverändert. Ein "Zurücksetzen"-Knopf erscheint, sobald es etwas zu löschen gibt, und entfernt den Entwurf sofort, auch von der Platte. Nur die letzte Antwort übersteht einen Neustart — was während eines laufenden Gesprächs zusätzlich im Gedächtnis bleibt, steht unter "Einen Entwurf verfeinern".'
        },
        {
          heading: 'Einen Entwurf verfeinern',
          body: 'Statt einen Vorschlag nur zu übernehmen oder zu verwerfen, kannst du nachbessern — „mach den ersten Punkt zurückhaltender", „kürzer" — und die KI überarbeitet mit der vorherigen Runde im Kopf. Der gewählte *Abschnitt* ist das Thema, zu dem dieses Gedächtnis gehört: Die Auswahlliste zu wechseln fängt bewusst neu an. Dieses Arbeitsgedächtnis wird nicht auf die Platte geschrieben, nur der letzte Stand (siehe oben und Abschnitt 7 des Durchgangs).'
        },
        {
          heading: 'Eintrag aufräumen',
          body: 'Antworten auf Fragen, die du gestellt hast, während „Offene Fragen" als Ziel gewählt war, sammeln sich dort dauerhaft — die Auswahlliste schreibt immer an genau ein gewähltes Ziel, sie rät nie ein besseres. „Eintrag aufräumen" ist ein eigener, bewusst ausgelöster Schritt genau dafür: erscheint nur, wenn der Eintrag einen eigenen, eigenständigen Abschnitt „Offene Fragen" hat (nicht einen kombinierten wie „Geheimnisse & offene Fragen"), und schlägt vor, einzelne Punkte in besser passende Abschnitte zu verschieben. Jeden Vorschlag prüfen, einzelne abwählen, und erst „Anwenden" schreibt — ein Punkt zur Sicherheit: Nichts wird gelöscht, nur verschoben, und eine Sicherung der Datei vor der Änderung entsteht automatisch, wie bei jeder anderen Bearbeitung auch.'
        },
        {
          heading: 'Lokale KI, keine Cloud',
          body: 'Tessarios spricht mit einem lokalen KI-Server, den du selbst betreibst — standardmäßig LM Studio oder Ollama, einstellbar unter Einstellungen -> KI. Kein API-Schlüssel, kein Cloud-Konto, keine Daten verlassen deinen Rechner, außer du richtest es selbst so ein.'
        },
        {
          heading: 'Was ihr Verhalten prägt',
          body: 'Der System-Prompt der KI setzt sich aus wenigen Textdateien zusammen, jede pro Tresor überschreibbar:\n\n- `AGENTS.md` — allgemeine Regeln (keine Fakten erfinden, bestehenden Kanon respektieren, nur ins angeforderte Feld oder den angeforderten Abschnitt schreiben).\n- `SOUL.md` — Gesprächston.\n- `PROJECT.md` — Genre, Ton und feste Regeln deines Projekts (Altersgruppe, welche Art Gefahr erlaubt ist, Regeln zur Erzählperspektive). Bewusst *kein* Ort für Figurennamen oder Handlungsfakten — die stehen in den Einträgen selbst und werden bei Bedarf automatisch herangezogen.\n\nLege deine eigene Fassung als `.tessarios/AGENTS.md`, `.tessarios/SOUL.md` oder `.tessarios/PROJECT.md` in deinem Tresor ab, und sie hat Vorrang vor dem eingebauten Standard — ohne Codeänderung.'
        }
      ]
    }
  },
  {
    id: 'maps-graph-media-stats',
    title: { en: '6. Maps, Graph, Media & Stats', de: '6. Karten, Graph, Medien & Statistiken' },
    iconName: 'Map',
    description: {
      en: 'The views that visualize your vault instead of editing it directly.',
      de: 'Die Ansichten, die deinen Tresor visualisieren, statt ihn direkt zu bearbeiten.'
    },
    content: {
      en: [
        {
          heading: 'Interactive Maps',
          body: 'A Map entry holds an image with pins, regions, and optional floor levels. Pins and regions can link directly to any other entry — click one to jump to it.'
        },
        {
          heading: 'Knowledge Graph',
          body: 'The Graph view plots every entry as a node and every WikiLink as a connecting line. Drag nodes around, filter by type, or click a node to open it.'
        },
        {
          heading: 'Media Library',
          body: 'The Media view groups every image by which entries actually link to it — an image can belong to more than one entry, or none yet ("unlinked").'
        },
        {
          heading: 'Vault Stats',
          body: 'Word and character counts, category breakdown, and recent activity across the whole vault.'
        }
      ],
      de: [
        {
          heading: 'Interaktive Karten',
          body: 'Ein Karten-Eintrag hält ein Bild mit Markierungen, Regionen und optionalen Ebenen. Markierungen und Regionen können direkt auf jeden anderen Eintrag verweisen — ein Klick springt dorthin.'
        },
        {
          heading: 'Beziehungsgraph',
          body: 'Die Graph-Ansicht stellt jeden Eintrag als Knoten und jeden WikiLink als verbindende Linie dar. Knoten verschieben, nach Typ filtern, oder auf einen Knoten klicken, um ihn zu öffnen.'
        },
        {
          heading: 'Medien-Galerie',
          body: 'Die Medien-Ansicht gruppiert jedes Bild danach, welche Einträge tatsächlich darauf verweisen — ein Bild kann zu mehreren Einträgen gehören, oder noch zu keinem ("unverlinkt").'
        },
        {
          heading: 'Tresor-Statistiken',
          body: 'Wort- und Zeichenzahlen, Kategorienverteilung und letzte Aktivität über den ganzen Tresor.'
        }
      ]
    }
  },
  {
    id: 'safety-backups',
    title: { en: '7. Safety: Backups & Versions', de: '7. Sicherheit: Backups & Versionen' },
    iconName: 'History',
    description: {
      en: 'What is saved automatically, what is not, and where to find an older version.',
      de: 'Was automatisch gesichert wird, was nicht, und wo eine ältere Fassung zu finden ist.'
    },
    content: {
      en: [
        {
          heading: 'Per-entry backups',
          body: 'Every time you edit an entry, Tessarios keeps up to 10 previous versions as files under `.tessarios/backups/`. Open **Revision History** on any entry to compare an older version and restore it with one click.'
        },
        {
          heading: 'Orphaned backups clean themselves up',
          body: 'If you delete an entry, its backups are not deleted immediately — they are kept for 30 days (configurable in Settings -> Storage) in case the deletion was a mistake, then removed automatically.'
        },
        {
          heading: 'Full vault snapshots',
          body: '"Create ZIP Backup Now" in Settings -> Storage exports your entire vault as a ZIP file. Tessarios also creates one automatically before a risky operation, like replacing your vault with a different folder.'
        }
      ],
      de: [
        {
          heading: 'Backups je Eintrag',
          body: 'Bei jeder Bearbeitung eines Eintrags hält Tessarios bis zu 10 frühere Fassungen als Dateien unter `.tessarios/backups/` vor. Öffne **Revisionsverlauf** an jedem Eintrag, um eine ältere Version zu vergleichen und mit einem Klick wiederherzustellen.'
        },
        {
          heading: 'Verwaiste Backups räumen sich selbst auf',
          body: 'Löschst du einen Eintrag, werden seine Backups nicht sofort gelöscht — sie bleiben 30 Tage erhalten (einstellbar unter Einstellungen -> Speicher), falls das Löschen ein Versehen war, und werden danach automatisch entfernt.'
        },
        {
          heading: 'Vollständige Tresor-Sicherungen',
          body: '"ZIP-Backup jetzt erstellen" unter Einstellungen -> Speicher exportiert den gesamten Tresor als ZIP-Datei. Tessarios legt außerdem automatisch eine an, bevor eine riskante Aktion ansteht, etwa das Ersetzen deines Tresors durch einen anderen Ordner.'
        }
      ]
    }
  },
  {
    id: 'markdown-shortcuts',
    title: { en: '8. Markdown Syntax & Keyboard Shortcuts', de: '8. Markdown-Syntax & Tastenkürzel' },
    iconName: 'FileText',
    description: {
      en: 'The reference: editor shortcuts, WikiLinks, and supported Markdown elements.',
      de: 'Die Referenz: Editor-Tastenkürzel, WikiLinks und unterstützte Markdown-Elemente.'
    },
    content: {
      en: [
        {
          heading: 'Keyboard shortcuts',
          body: '`Ctrl+B` bold - `Ctrl+I` italic - `Ctrl+K` link the selection - `Ctrl+Shift+H` highlight - `Ctrl+Shift+X` strikethrough - `Ctrl+Shift+C` inline code - `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo - `/` opens the quick-insert menu for tables, callouts, and checklists.'
        },
        {
          heading: 'WikiLinks',
          body: '`[[Entity Title]]` links to another entry. `[[Title|Display Text]]` links but shows different text. `![[image.png]]` embeds an image.'
        },
        {
          heading: 'Callout boxes',
          body: '`> [!note]`, `> [!warning]`, `> [!tip]`, `> [!quote]`, `> [!bug]`, and `> [!example]`, each followed by a title and indented body text.'
        },
        {
          heading: 'Other elements',
          body: 'Standard Markdown tables, checklists (`- [ ]` / `- [x]`), and fenced code blocks are all supported. There is no math/LaTeX rendering.'
        }
      ],
      de: [
        {
          heading: 'Tastenkürzel',
          body: '`Strg+B` fett - `Strg+I` kursiv - `Strg+K` Auswahl verlinken - `Strg+Umschalt+H` hervorheben - `Strg+Umschalt+X` durchstreichen - `Strg+Umschalt+C` Inline-Code - `Strg+Z` / `Strg+Umschalt+Z` rückgängig/wiederholen - `/` öffnet das Schnellmenü für Tabellen, Callouts und Checklisten.'
        },
        {
          heading: 'WikiLinks',
          body: '`[[Eintragstitel]]` verlinkt einen anderen Eintrag. `[[Titel|Anzeigetext]]` verlinkt, zeigt aber anderen Text. `![[bild.png]]` bettet ein Bild ein.'
        },
        {
          heading: 'Callout-Boxen',
          body: '`> [!note]`, `> [!warning]`, `> [!tip]`, `> [!quote]`, `> [!bug]` und `> [!example]`, jeweils gefolgt von einem Titel und eingerücktem Text.'
        },
        {
          heading: 'Weitere Elemente',
          body: 'Normale Markdown-Tabellen, Checklisten (`- [ ]` / `- [x]`) und Code-Blöcke werden unterstützt. Es gibt kein Mathe-/LaTeX-Rendering.'
        }
      ]
    }
  }
];
