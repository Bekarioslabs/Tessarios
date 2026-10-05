# Tessarios-Vault: Bauanleitung für ChatGPT

Dieses Dokument fügst du komplett in einen ChatGPT-Chat ein (als Systemanweisung oder als
erste Nachricht), gefolgt von deinem bestehenden Material. ChatGPT soll daraus
fertige `.md`-Dateien erzeugen, die du unverändert in den passenden Ordner legst — Tessarios
liest sie beim nächsten Öffnen des Tresors ein.

**Bilder sind hier bewusst ausgeklammert** — die fügst du selbst über die App ein.

---

## 1. Verzeichnisstruktur

Ein Tessarios-Tresor ist ein Ordner mit Unterordnern nach Kategorie. Du musst die Ordner
nicht von Hand anlegen — die App legt sie beim ersten Eintrag automatisch an —, aber wenn
ChatGPT dir fertige Dateien gibt, sollen sie gleich am richtigen Platz liegen:

```
Mein-Vault/
├── Books/
├── Chapters/
├── Scenes/
├── Characters/
├── Relationships/
├── Organizations/
├── Places/
├── Powers/
├── Items/
├── Lore/
├── Storylines/
├── Visuals/
├── Maps/
├── Notes/
├── Brainstorms/
└── .tessarios/              (legt die App selbst an — hier NICHTS von Hand reinlegen)
    ├── AGENTS.md            (optional, überschreibt die eingebauten KI-Regeln)
    ├── SOUL.md              (optional, überschreibt den Gesprächsstil)
    └── PROJECT.md           (empfohlen — siehe Abschnitt 5)
```

Jede Datei liegt **direkt** im Kategorie-Ordner, kein weiteres Unterverzeichnis pro Figur
o. ä. Der Dateiname ist die **`id`** des Eintrags plus `.md` — also der Titel in Kleinbuchstaben,
Leerzeichen zu `-`, Umlaute transliteriert (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`), alle anderen
Sonderzeichen (Punkte, Gedankenstriche, Klammern …) entfernt. Der eigentliche Titel mit
Groß-/Kleinschreibung und Sonderzeichen steht nur im Frontmatter als `title`:

```
Characters/ilka.md                          (title: "Ilka")
Characters/jonas-berger.md                   (title: "Jonas Berger")
Places/leuchtturm-club.md                      (title: "Leuchtturm-Club")
Scenes/szene_k01_s01-ankunft-im-leuchtturm.md  (title: "Szene_K01_S01 – Ankunft im Leuchtturm")
```

Warum nicht einfach der Titel als Dateiname: Beim ersten Speichern schreibt die App jeden
Eintrag unter genau diesem Namen. Weicht dein Dateiname ab, legt sie die Datei beim ersten
Bearbeiten neu an und löscht die alte (vorher wird eine Sicherung angelegt). Das funktioniert,
aber es ist unnötige Bewegung im Vault. Unterscheidet sich der Name nur durch Groß-/Kleinschreibung (`Ilka.md`
gegen `ilka.md`), erkennt die App unter Windows, dass es dieselbe Datei ist, und speichert sie
an Ort und Stelle unter ihrem bisherigen Namen.

---

## 2. Das Dateiformat

Jede Datei hat genau diese Form: YAML-Frontmatter, dann `##`-Abschnitte als Markdown.

```markdown
---
id: "ilka"
type: character
title: "Ilka"
lastModified: 2026-08-20
tags:
  - character
  - hero
Name: "Ilka"
Alter: "8"
Heldenname: "Nachtfalke"
Rolle: "Protagonist"
Gruppe: "[[Leuchtturm-Club]]"
cssclasses:
  - dossier
  - dossier-character
---

## Charakterkern
Sie will beweisen, dass klein sein kein Nachteil ist...

## Alltag & Persönlichkeit
...
```

**Regeln, die ChatGPT genau befolgen muss:**

- `id`: der Titel in Kleinbuchstaben, Leerzeichen zu `-`, Umlaute transliteriert
  (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`). „Jonas Berger" → `jonas-berger`. Wenn unsicher: `id`
  einfach weglassen, die App berechnet sie automatisch aus dem Dateinamen.
- `type`: exakt einer der Typ-Codes aus der Tabelle in Abschnitt 3 (englisch, klein
  geschrieben — `character`, nicht `Charakter`).
- `title`: der Anzeigename des Eintrags mit Groß-/Kleinschreibung und Sonderzeichen, in
  Anführungszeichen. **Nicht** der Dateiname — der ist die `id` (siehe Abschnitt 1).
- `lastModified`: Datum im Format `JJJJ-MM-TT`. Bei neu erstellten Dateien einfach das
  heutige Datum.
- `tags`: kommt 1:1 aus `defaultTags` der jeweiligen Vorlage (siehe Abschnitt 3) — nicht
  frei erfinden.
- Danach folgen die **Felder aus `defaultFields`** der Vorlage als flache YAML-Zeilen
  (`Feldname: "Wert"`), nur ausgefüllt mit echtem Inhalt. Leere Felder ganz weglassen,
  nicht mit `""` auffüllen — ein leeres Feld ist in Tessarios ein offenes Feld, kein
  Platzhalter.
- **Kein `relations:`-Block.** Verknüpfungen entstehen ausschließlich über `[[WikiLinks]]`
  (siehe Abschnitt 4). Der Grund: das `relations`-YAML-Format ist intern und fehleranfällig
  von Hand zu schreiben; die App liest `[[…]]`-Links ohnehin für alles Wichtige aus
  (Kontext für die KI, Beziehungsgraph, Widerspruchsprüfung). Fehlt der `relations`-Block,
  passiert nichts Schlechtes — die App ergänzt ihn bei Bedarf selbst.
- Die letzten drei Zeilen `cssclasses: / - dossier / - dossier-<type>` immer anhängen,
  das ist reine Optik in Obsidian und schadet nicht, wenn es fehlt — aber gehört zum
  Format.
- Danach die `##`-Abschnitte **exakt** wie in `defaultContent` der Vorlage aufgelistet
  (Reihenfolge und Wortlaut übernehmen), jeweils mit dem passenden Inhalt aus deinem
  Material gefüllt. Ein Abschnitt, zu dem du noch nichts hast: leer lassen (nur die
  Überschrift), nicht erfinden.

---

## 3. Alle Presets (Vorlagen)

Für jeden Typ: Ordner, Zweck, Felder (mit erlaubten Werten bei Auswahlfeldern), und die
Standard-Abschnitte in exakter Reihenfolge.

Feldtypen kurz erklärt:
- **Text** — freier Text
- **Zahl** — nur Ziffern
- **Auswahl** — ausschließlich einer der genannten Werte, nichts Eigenes erfinden
- **Mehrfachauswahl** — mehrere der genannten Werte, kommagetrennt
- **Verweis (Link)** — genau ein `[[Titel]]`, muss auf einen Eintrag des genannten Zieltyps
  zeigen
- **Mehrfachverweis (Multilink)** — mehrere `[[Titel]]`, kommagetrennt

### 3.1 Held — `character-hero` → `Characters/`
*Haupt- oder Nebenheld mit Kräften, Heldenidentität und optionalem Kostüm.*

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Name | Text, Pflicht | — |
| Alter | Zahl | — |
| Heldenname | Text | — |
| Geheime Identität | Auswahl | ja / nein / offen |
| Rolle | Auswahl | Protagonist / Hauptheld / Nebenheld |
| Gruppe | Verweis | organization |
| Schule/Klasse | Text | — |
| Kraftsystem | Verweis | power |
| Kostüm | Verweis | item **oder** visual |
| Kostümphase | Auswahl | keins / geplant / vorhanden / beschädigt / verloren |

`tags: [character, hero]`

Abschnitte: Charakterkern · Alltag & Persönlichkeit · Entdeckung der Kräfte · Kräfte &
Grenzen · Heldenidentität & Kostüm · Rolle in der Gruppe · Wichtige Beziehungen · Rolle in
der Handlung · Geheimnisse & offene Fragen

### 3.2 Nebencharakter — `character-supporting` → `Characters/`
*Zivile Nebenfigur: Elternteil, Lehrer, Mitschüler, Nachbar.*

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Alter | Zahl | — |
| Rolle | Text | — |
| Beruf/Funktion | Text | — |
| Wohnort | Verweis | place |
| Bezugsperson | Verweis | character |
| Familie/Gruppe | Verweis | organization |
| Wissensstand | Auswahl | unwissend / ahnungslos / misstrauisch / Teilwissen / eingeweiht |

`tags: [character, supporting]`

Abschnitte: Charakterkern · Alltag & Persönlichkeit · Beziehung zu wichtigen Figuren ·
Rolle im Alltag · Rolle in der Handlung · Wissen über die Ereignisse · Konflikte &
Entwicklung · Offene Fragen

### 3.3 Antagonist — `character-antagonist` → `Characters/`
*Gegenspieler mit eigener Motivation, Ressourcen und Rolle im Konflikt.*

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Alter | Zahl | — |
| Alias | Text | — |
| Beruf/Funktion | Text | — |
| Antagonistenrolle | Auswahl | Hauptantagonist / Nebenantagonist / Rivale |
| Organisation | Verweis | organization |
| Basis/Ort | Verweis | place |
| Gegenspieler | Mehrfachverweis | character **oder** organization |
| Bedrohungsart | Mehrfachauswahl | wissenschaftlich / körperlich / sozial / politisch / psychologisch / übernatürlich |
| Wissensstand | Auswahl | unbekannt / Verdacht / Teilwissen / umfassend |
| Entwicklungsbogen | Verweis | storyline |

`tags: [character, antagonist]`

Abschnitte: Charakterkern · Öffentliche Rolle & Auftreten · Ziele & Motivation · Methoden &
Ressourcen · Wissen über die Ereignisse · Beziehung zu den Gegenspielern · Bedrohung &
Eskalation · Schwächen & Grenzen · Geheimnisse · Entwicklung in der Handlung · Offene Fragen

### 3.4 Buch — `book-template` → `Books/`
*Zentrale Übersicht eines Buches.*

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Reihe | Verweis | storyline |
| Bandnummer | Zahl | Standard: 1 |
| Arbeitstitel | Text | — |
| Status | Auswahl | Planung / Entwurf / In Bearbeitung / In Überarbeitung / Fertig / Pausiert |
| Format | Auswahl | Kinderroman / Roman / Comic / Graphic Novel / Novelle |
| Zielgruppe | Auswahl | 6–8 / 8–10 / 9–12 / 12–14 / Young Adult / All Age |
| Genre | Mehrfachauswahl | Abenteuer / Fantasy / Science-Fiction / Superhelden / Mystery / Krimi / Coming-of-Age |
| Hauptfiguren | Mehrfachverweis | character |
| Kapitelzahl | Zahl | — |
| Wortziel | Zahl | Standard: 35000 |

`tags: [book]`

Abschnitte: Überblick & Prämisse · Zentrale Fragen & Konflikt · Figurenfokus ·
Handlungsbogen (mit Unterabschnitten ### Anfang, ### Mittelteil, ### Finale) ·
Kapitelübersicht · Offene Fragen

### 3.5 Kapitel — `chapter-template` → `Chapters/`
*Planungseinheit eines Buches.* **Titel-Konvention und Verknüpfung zum Buch: siehe
Abschnitt 6 — das ist der wichtigste Teil für ein funktionierendes Manuskript.**

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Buch | Verweis | book |
| Kapitelnummer | Zahl | — |
| Status | Auswahl | Planung / Entwurf / In Bearbeitung / In Überarbeitung / Fertig / Pausiert |
| Perspektive | Verweis | character |
| Hauptschauplatz | Verweis | place |
| Beteiligte Figuren | Mehrfachverweis | character |
| Wortziel | Zahl | — |

`tags: [chapter]`

Abschnitte: Überblick · Funktion des Kapitels · Figurenfokus · Kapitelkonflikt ·
Kapitelablauf · Wendepunkt · Ergebnis & Übergang · Szenenübersicht · Offene Fragen

### 3.6 Szene — `scene-template` → `Scenes/`
*Konkrete Handlungseinheit eines Kapitels. Der letzte Abschnitt `## Manuskript` enthält den
tatsächlichen Fließtext der Geschichte — alles davor ist Planung.* **Titel-Konvention:
siehe Abschnitt 6.**

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Kapitel | Verweis | chapter |
| Szenennummer | Zahl | — |
| Status | Auswahl | Planung / Entwurf / In Bearbeitung / In Überarbeitung / Fertig / Pausiert |
| Perspektive | Verweis | character |
| Hauptschauplatz | Verweis | place |
| Beteiligte Figuren | Mehrfachverweis | character |
| Wortziel | Zahl | — |

`tags: [scene]`

Abschnitte: Überblick · Szenenfunktion · Ausgangslage · Ziel der Figur · Konflikt ·
Szenenablauf · Ergebnis & Folgen · Kontinuität · Offene Fragen · **Manuskript**

### 3.7 Storyline / Chronik — `storyline-template` → `Storylines/`
*Zeitlicher oder dramaturgischer Verlauf eines Handlungs-, Figuren- oder Entwicklungsstrangs.*

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Storylinetyp | Auswahl | Handlung / Figurenentwicklung / Beziehung / Antagonist / Mysterium / Lore / Kraftentwicklung |
| Status | Auswahl | Planung / Aktiv / In Überarbeitung / Abgeschlossen / Pausiert |
| Reihe | Verweis | storyline (für übergeordnete Reihen) |
| Bücher | Mehrfachverweis | book |
| Hauptfiguren | Mehrfachverweis | character |
| Priorität | Auswahl | niedrig / mittel / hoch |

`tags: [storyline]`

Abschnitte: Überblick · Ausgangspunkt · Verlauf (mit ### Phase 1, ### Phase 2, ### Phase 3)
· Schlüsselereignisse · Ziel / Auflösung · Offene Fragen

### 3.8 Beziehung — `relationship-template` → `Relationships/`
*Ausführliches Dossier für eine erzählerisch wichtige Beziehung zwischen zwei Figuren.*
Nur für Beziehungen anlegen, die eine eigene Entwicklung über die Geschichte haben — nicht
für jede beliebige Bekanntschaft.

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Person A | Verweis | character |
| Person B | Verweis | character |
| Beziehungstyp | Auswahl | Freundschaft / Familie / Partnerschaft / Rivalität / Feindschaft / Bekanntschaft / Mentorenschaft |
| Beziehungsstatus | Auswahl | eng / stabil / angespannt / distanziert / zerbrochen / wechselhaft |
| Dynamik | Mehrfachauswahl | ergänzend / beschützend / vertrauensvoll / konfliktreich / konkurrierend / abhängig / misstrauisch / ungleich |
| Konfliktgrad | Auswahl | keiner / niedrig / mittel / hoch |
| Entwicklungsbogen | Verweis | storyline |

`tags: [relationship]`

Abschnitte: Überblick · Ursprung der Beziehung · Dynamik · Konflikte & Spannungen ·
Entwicklung · Schlüsselereignisse · Offene Fragen

### 3.9 Ort — `place-template` → `Places/`

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Ortstyp | Auswahl | Stadt / Stadtteil / Gebäude / Schule / Wohnort / Versteck / Naturgebiet / Außenbereich / Innenraum / Anlage / Sonstiges |
| Status | Auswahl | aktiv / verlassen / zerstört / unzugänglich / unbekannt |
| Standort | Verweis | place (übergeordneter Ort) |
| Besitzer/Nutzer | Mehrfachverweis | character **oder** organization |
| Zugang | Text | — |
| Sichtbarkeit | Auswahl | öffentlich / privat / versteckt / geheim / unbekannt |
| Übergeordneter Ort | Verweis | place |

`tags: [place]`

Abschnitte: Überblick · Lage & Umgebung · Zugang · Aufbau & Bereiche · Ausstattung ·
Nutzung & Alltag · Atmosphäre · Geschichte · Geheimnisse & Gefahren · Rolle in der
Handlung · Visuelle Referenzen · Offene Fragen

### 3.10 Organisation — `organization-template` → `Organizations/`
*Gruppe, Fraktion, Institut, Behörde, Team.*

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Organisationstyp | Auswahl | Team / Familie / Verein / Institut / Behörde / Unternehmen / Forschungsteam / Geheimbund / Schulgruppe / Fraktion / Sonstiges |
| Status | Auswahl | in Gründung / aktiv / inaktiv / zerstritten / aufgelöst |
| Struktur | Auswahl | informell / hierarchisch / demokratisch / dezentral / familiär |
| Leitung | Verweis | character |
| Hauptquartier | Verweis | place |
| Mitglieder | Mehrfachverweis | character |
| Einflussbereich | Auswahl | Schule / Stadtteil / lokal / regional / national / global |
| Sichtbarkeit | Auswahl | unbekannt / geheim / teilweise bekannt / öffentlich |

`tags: [organization]`

Abschnitte: Überblick · Entstehung · Ziele & Interessen · Mitglieder & Rollen · Struktur &
Entscheidungen · Kultur & Gruppendynamik · Hauptquartier & Ressourcen · Verbündete &
Gegner · Ruf & Einfluss · Rolle in der Handlung · Geheimnisse & offene Fragen

### 3.11 Kraftsystem — `power-template` → `Powers/`

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Betroffene/Träger | Mehrfachverweis | character **oder** organization |
| Grundsystem | Verweis | power (übergeordnetes System, falls diese Kraft eine Variante ist) |
| Eissorte | Text | frei — projektspezifisches Feld, ggf. umbenennen |
| Kraftbereich | Text | — |

`tags: [power]`

Abschnitte: Überblick · Ursprung & Entstehung · Fähigkeiten · Auslösung & Kontrolle ·
Grenzen & Kosten · Erste Manifestation · Entwicklung · Wechselwirkungen · Sonderregeln &
Ausnahmen · Offene Fragen

### 3.12 Lore — `lore-template` → `Lore/`
*Weltenwissen, Regeln, Ereignisse, die mehrere Figuren oder Bereiche betreffen.*

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Loretyp | Auswahl | Weltenregel / Ereignis / Ursprung / Phänomen / Geschichte / Wissenschaft / Mythos |
| Kanonstatus | Auswahl | gesetzter Kanon / vorläufig / Legende / unbekannt / widersprüchlich |
| Zeitraum | Text | — |
| Schauplatz | Verweis | place |
| Beteiligte | Mehrfachverweis | character **oder** organization |
| Zugehöriges System | Verweis | power **oder** lore |

`tags: [lore]`

Abschnitte: Überblick · Ursprung & Hintergrund · Ablauf oder Funktionsweise · Regeln &
Grenzen · Auswirkungen · Wissen innerhalb der Welt · Rolle in der Handlung · Geheimnisse &
Enthüllungen · Offene Fragen

### 3.13 Gegenstand — `item-template` → `Items/`

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Gegenstandstyp | Auswahl | Waffe / Kostüm / Werkzeug / Gerät / Artefakt / Probe / Fahrzeug / Sonstiges |
| Besitzer/Nutzer | Mehrfachverweis | character **oder** organization |
| Hersteller/Erfinder | Verweis | character **oder** organization |
| Herkunft | Verweis | place **oder** lore **oder** organization |
| Material | Text | — |
| Status | Auswahl | geplant / vorhanden / beschädigt / verloren / zerstört |
| Aufbewahrungsort | Verweis | place |

`tags: [item]`

Abschnitte: Überblick · Aussehen & Beschaffenheit · Herkunft & Herstellung · Funktionen &
Einsatz · Grenzen & Schwachstellen · Nutzung & Handhabung · Aufbewahrung · Rolle in der
Handlung · Visuelle Referenzen · Offene Fragen

### 3.14 Visual Design & Prompting — `visual-template` → `Visuals/`
*Bildliche Referenz und KI-Bildprompts. Hier NICHT selbst Prompt-Tests erfinden — dieser
Typ ist für später, wenn du wirklich Bilder generierst. Für den Texttransfer reicht es,
den Eintrag mit den ersten Abschnitten (visuelles Ziel, verbindliche Merkmale) anzulegen.*

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Visualtyp | Auswahl | Charakter / Kostüm / Ort / Gegenstand / Styleguide / Prompt-Test / Workflow |
| Bezugsobjekt | Verweis | character **oder** place **oder** item |
| Designstatus | Auswahl | Konzept / Test / Arbeitsstand / Festgelegt / Final |
| Workflow | Verweis | visual |

`tags: [visual]`

Abschnitte (Auszug, die für Texttransfer relevanten): Visuelles Ziel · Verbindliche
Merkmale · Form & Silhouette · Farben & Materialien · Kostümteile & Details · Variable
Merkmale · Referenzbilder · Basis-Prompt · Negative / Vermeiden · Prompt-Tests · Aktueller
Produktions-Prompt · Bekannte Probleme · Produktionshinweise · Offene Fragen

### 3.15 Karte — `map-template` → `Maps/`
*Nur anlegen, wenn du wirklich ein Kartenbild hast — sonst überspringen, das ist reine
Bild-Funktionalität.*

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Kartentyp | Auswahl | Weltkarte / Regionalkarte / Stadtkarte / Stadtteilkarte / Geländeplan / Gebäudeplan / Raumplan |
| Gebiet | Verweis | place |
| Kartenstatus | Auswahl | Konzept / Arbeitsstand / Festgelegt / Final |
| Maßstab | Auswahl | schematisch / annähernd / maßstäblich / unbekannt |
| Ausrichtung | Auswahl | Norden / frei / unbekannt |

`tags: [map]`

Abschnitte: Überblick · Kartenansicht · Geografische Struktur · Marker & Orte · Wege &
Entfernungen · Legende · Offene Fragen

### 3.16 Arbeitsnotiz — `note-template` → `Notes/`
*Für alles, was noch keine feste Form hat: Ideen, offene Fragen, Rechercheergebnisse.*

| Feld | Typ | Werte / Zieltyp |
|---|---|---|
| Notiztyp | Auswahl | Idee / Frage / Problem / Recherche / Variante / Entscheidung / Erinnerung |
| Status | Auswahl | offen / prüfen / angenommen / abgelehnt / integriert / archiviert |
| Bereich | Auswahl | Handlung / Figur / Beziehung / Kraft / Ort / Lore / Dialog / Visual / Produktion |
| Priorität | Auswahl | niedrig / mittel / hoch |
| Buch | Verweis | book |
| Ziel | Verweis | book, chapter, scene, character, place, organization, power, lore, item **oder** visual |

`tags: [note]`

Abschnitte: Inhalt · Überlegungen · Entscheidung / Ergebnis · Integration

---

## 4. Verknüpfungsregeln

Zwei Orte, an denen `[[Titel]]` benutzt wird:

1. **In einem Verweis-/Mehrfachverweis-Feld** (siehe Tabellen oben): `Gruppe: "[[Leuchtturm-Club]]"`
2. **Im Fließtext eines Abschnitts**, überall dort, wo eine Figur, ein Ort o. ä. erwähnt
   wird: „Sie trifft [[Jonas Berger]] vor dem [[Leuchtturm-Club]]." — genau das ist es, was
   die KI später als Kontext lädt, wenn du an dieser Szene weiterschreibst.

**Wichtig für ChatGPT:**
- Der Text in `[[…]]` muss exakt dem `title` einer anderen Datei entsprechen (Groß-/
  Kleinschreibung wird beim Matching ignoriert, der Wortlaut nicht).
- Existiert der Zieleintrag noch nicht, trotzdem verlinken — Tessarios markiert das nur
  als Hinweis, blockiert nichts. Besser konsequent verlinken und später fehlende Einträge
  nachtragen, als früh inkonsequent zu sein.
- Kein `relations:`-Block im Frontmatter (siehe Abschnitt 2).

---

## 5. `.tessarios/PROJECT.md` — die Projektbibel

Das ist **keine Vorlage für einen Eintrag**, sondern eine einzelne Freitext-Datei direkt
unter `.tessarios/PROJECT.md`, die der KI in jedem Gespräch mitgegeben wird — Ton, Genre,
Altersgruppe, Stilregeln. Genau das Material, das in deinen ChatGPT-Chats vermutlich schon
als große Anweisung existiert, gehört hierher, nicht in einzelne Dossiers. Beispielhafte
Gliederung:

```markdown
# Project Orientation — <Projektname>

Name: ...
Format: ...
Zielgruppe: ...

## Ton & Tonalität
...

## Erzählrahmen
...

## Stil der Dossiertexte
...

## Arbeitsweise
- Der Tresor ist die Wahrheit. Neue Ideen sind Vorschläge, bis der Autor sie übernimmt.
```

Lass ChatGPT diese Datei als eigenständiges Ergebnis am Ende ausgeben, einmalig, nicht pro
Eintrag wiederholen.

---

## 6. Sonderfall: Buch → Kapitel → Szene

Das ist der Teil, bei dem die App am strengsten ist — hält sich ChatGPT nicht an die
Titel-Konvention, hängt die Szene später lose in der App und nicht im richtigen Kapitel.

**Kapitel-Titel:** `Kapitel <NN> – <Untertitel>`, zweistellig mit führender Null.
Beispiel: `Kapitel 01 – Der erste Flug`

**Szenen-Titel:** `Szene_K<NN>_S<NN> – <Untertitel>`, beide Nummern zweistellig.
Beispiel: `Szene_K01_S01 – Ankunft im Leuchtturm`

Die Nummer **muss** zum Kapitel passen: Die dritte Szene in Kapitel 2 heißt
`Szene_K02_S03 – …`.

**Zusätzlich im Frontmatter der Szene** das Feld `Kapitel` mit dem exakten Kapitel-Titel
(mit oder ohne `[[…]]` — beides wird erkannt):
```yaml
Kapitel: "Kapitel 01 – Der erste Flug"
```

Bei **mehr als einem Buch** im selben Tresor zusätzlich im Kapitel-Frontmatter:
```yaml
Buch: "<Buchtitel>"
```
(Bei nur einem Buch im Tresor ist das Feld optional — die App ordnet dann automatisch
alles diesem einen Buch zu.)

**Der Manuskripttext gehört ausschließlich in den letzten Abschnitt `## Manuskript`** der
Szene-Datei. Alles davor (Ausgangslage, Konflikt, Kontinuität …) ist Planungstext, den die
App nicht als Story-Text behandelt. Wenn du reinen Fließtext aus ChatGPT überträgst, der
noch nicht in Szenen aufgeteilt ist: ChatGPT soll ihn sinnvoll in Szenen zerlegen (eine
Szene = ein Ort/eine zusammenhängende Handlungseinheit) und jede unter ihrem eigenen
`## Manuskript` ablegen — nicht einen Roman-Fließtext in eine einzige Datei packen.

---

## 7. Anleitung für ChatGPT — so ausgeben

Füge diesen Block als letzten Teil der Anweisung an ChatGPT an:

> Du bekommst im Anschluss mein bisheriges Worldbuilding-Material (Charaktere, Orte,
> Handlung, Regeln — unstrukturiert, so wie es in unseren bisherigen Gesprächen entstanden
> ist). Wandle es Schritt für Schritt in Tessarios-Dateien um, exakt nach den Regeln oben:
>
> 1. Identifiziere zuerst grob, welche Entitäten in meinem Material vorkommen (Figuren,
>    Orte, Organisationen, Kräfte, Handlungsstränge, Kapitel/Szenen, offene Fragen) und
>    nenne mir kurz die Liste mit vorgeschlagenem Vorlagentyp, bevor du Dateien schreibst.
>    Ich bestätige oder korrigiere diese Liste.
> 2. Erzeuge danach für jede Entität eine vollständige Datei nach dem Format aus
>    Abschnitt 2, mit der passenden Vorlage aus Abschnitt 3.
> 3. Erfinde keine Fakten, die in meinem Material nicht vorkommen oder sich nicht direkt
>    daraus ableiten lassen. Ein Abschnitt, zu dem nichts vorliegt, bleibt leer (nur die
>    Überschrift) — das ist besser als eine erfundene Ausschmückung.
> 4. Verlinke konsequent mit `[[Titel]]`, sobald ein Eintrag einen anderen erwähnt, auch
>    wenn die Zieldatei noch nicht existiert.
> 5. Gib pro Datei einen eigenen Code-Block aus, mit dem vollständigen Zielpfad als
>    Überschrift direkt darüber. Der Dateiname ist der Slug der `id` aus Abschnitt 1 (klein,
>    mit Bindestrichen, Umlaute als ae/oe/ue/ss), nicht der Titel. Zum Beispiel:
>
>    **`Characters/ilka.md`**
>    ```markdown
>    ---
>    ...
>    ---
>    ## Charakterkern
>    ...
>    ```
> 6. Bei sehr vielen Einträgen: arbeite in Gruppen von 3–5 Dateien pro Antwort, nicht
>    alles auf einmal — dann kann ich zwischendurch gegenlesen.
> 7. Am Ende, einmalig: erzeuge `.tessarios/PROJECT.md` nach Abschnitt 5, aus Ton, Genre,
>    Zielgruppe und Stilregeln, die sich aus unseren bisherigen Gesprächen ergeben.

---

## Kurz-Checkliste beim Reinkopieren in den Vault

- [ ] Datei liegt im richtigen Ordner (Abschnitt 1)
- [ ] Dateiname = `id` (Slug des Titels, siehe Abschnitt 1) + `.md`, `id:` im Frontmatter ist derselbe Slug
- [ ] `type:` stimmt mit dem Ordner überein
- [ ] Kein `relations:`-Block
- [ ] Kapitel-/Szenentitel folgen der Nummerierung aus Abschnitt 6
- [ ] Szenentext steht unter `## Manuskript`, nicht irgendwo davor
