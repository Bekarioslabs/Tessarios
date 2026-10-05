# Spezifikation — Die KI in Tessarios

Stand: 20.08.2026

Dieses Dokument beschreibt, was die KI in Tessarios tut, was sie ausdrücklich nicht tut
und warum die Grenzen dort liegen, wo sie liegen.

---

## 1. Leitsatz

**Die Anwendung entscheidet, wohin etwas gehört. Die KI liefert nur, was dort hingehört.**

Daraus folgt alles Weitere: Es gibt immer genau ein Ziel, dieses Ziel wählt der Nutzer,
und geschrieben wird erst nach einem bewussten Klick.

---

## 2. Was die KI nicht tut

- **Sie füllt keine Frontmatter-Felder.** Alter, Rolle, Gruppe und Verknüpfungen trägt
  der Autor selbst ein. Das ist schneller als jedes Gespräch darüber und macht die
  strukturierten Daten zu etwas, das nachweislich vom Menschen stammt.
- **Sie legt keine Einträge an.** Neue Dossiers entstehen ausschließlich über die
  Oberfläche.
- **Sie wählt kein Ziel.** Der Abschnitt kommt aus einer Auswahlliste, nie aus dem Modell.
- **Sie schreibt nie direkt.** Jede Antwort ist ein Vorschlag, bis er übernommen wird.

---

## 3. Warum es keinen Aktionsvertrag gibt

Eine frühere Fassung zwang das lokale Modell auf strukturiertes JSON
(`{"action": "set-field", …}`), prüfte es gegen den aktuellen Schritt eines geführten
Ablaufs und verwarf die Antwort nach einem Wiederholungsversuch.

Das ist gescheitert, und zwar an einer Stelle, die von außen falsch aussah: Verfehlte das
Modell das Format, erschien im Chat „Diese Antwort passte nicht zum aktuellen Schritt" —
eine Meldung über die Eingabe des *Nutzers*, obwohl das Problem beim *Modell* lag. Bei
einem lokal laufenden Modell mittlerer Größe passiert das oft genug, um den Modus
unbenutzbar zu machen.

Die Antwort ist deshalb heute schlichter Fließtext. Es gibt kein Format, das ein Modell
verfehlen könnte, und damit auch keine Fehlerklasse, die es zu erklären gälte.

Der geführte Schritt-für-Schritt-Modus wurde am 20.08.2026 vollständig entfernt. Der
letzte Stand mit diesem Modus liegt unter dem Git-Tag `pre-chronicler-removal`.

---

## 4. Prompt-Aufbau

`composePrompt` (`src/ai/engine/aiPromptComposer.ts`) staffelt sechs Ebenen vom
Allgemeinen zum Besonderen. Jede außer der ersten ist optional:

| # | Ebene | Quelle | Pro Tresor überschreibbar |
|---|---|---|---|
| 1 | Verfassung | `src/ai/AGENTS.md` | `.tessarios/AGENTS.md` |
| 2 | Gesprächsstil | `src/ai/SOUL.md` | `.tessarios/SOUL.md` |
| 3 | Projekt-Orientierung | `src/ai/PROJECT.md` | `.tessarios/PROJECT.md` |
| 4 | Vorlagen-Anweisung | `src/templates/<lang>/*.ai.md` | `.tessarios/templates/` |
| 5 | Arbeitsmodus | `getModeSemanticConfig` | — |
| 6 | Aufgelöster Kontext | `AIContextResolver` | — |

Die Ebenen 1–4 sind reine Textdateien. Ein anderes Genre, ein anderer Ton oder andere
Schreibregeln brauchen deshalb keine Codeänderung, sondern eine Datei im Tresor.

### Arbeitsmodi

`getModeSemanticConfig` bildet einen Modusnamen auf eine Anweisung und eine Temperatur
ab: `collaborative`, `muse` (kreativ, höhere Temperatur), `canon-sensitive` (Konsistenz
vor Originalität, 0.2), `structured`, `analytical` (kritische Prüfung, 0.2). Eine
`.ai.md` legt den Modus pro Abschnitt fest; ein Aufrufer kann ihn direkt übergeben.

---

## 5. Kontextbeschaffung

`AIContextResolver` (`src/ai/engine/aiContextResolver.ts`) löst benannte Regeln zu Text
auf, mit einem Zeichenbudget statt eines vollständigen Tresor-Dumps.

Die zulässigen Regeln sind eine **geschlossene Liste**. Eine unbekannte Regel wirft einen
Fehler, statt still zu nichts aufzulösen — genau dieses stille Nichts hatte dazu geführt,
dass vier von acht Regeln in `character-hero.ai.md` monatelang wirkungslos blieben, ohne
dass es jemandem auffiel.

### Budget und was es weglässt

Das Zeichenbudget ist eine Einstellung (`src/utils/aiSettings.ts`, vier Stufen von ~2.700
bis ~33.000 Token), keine feste Zahl. Die richtige Wahl hängt von zwei Dingen ab, die die
Anwendung nicht sehen kann: der im Server eingestellten Kontextlänge und dem VRAM, das der
KV-Cache dort belegen darf. Ist der Prompt zu lang, meldet kein Server einen Fehler — er
wirft stillschweigend den *Anfang* weg, und dort stehen Verfassung und Projektbibel.

`resolveContextDetailed` meldet zusätzlich, welche Einträge mitgingen und welche das
Budget gekappt hat. Der Manuskript-Begleiter zeigt beides unter der Antwort an. Grund: Ein
wegen Budget fehlendes Dossier sieht für den Autor exakt aus wie ein Dossier, das die KI
ignoriert hat — und führt zu ganz anderen Schlüssen.

### Füllstandsanzeige

Unter dem Eingabefeld zeigt ein Balken, wie voll der Kontext beim *nächsten* Zug wäre —
nicht beim letzten. Gemessen wird an den echten zusammengebauten Nachrichten:
`assembleRequest` baut das Nachrichten-Array, `send` schickt es, und die Anzeige misst
dasselbe Ergebnis über `measureMessages`. Zwei getrennte Berechnungen würden
auseinanderdriften, sobald sich eine Seite ändert, und ein falscher Balken ist schlimmer
als keiner — man würde ihm glauben.

Der Nenner ist die **Kontextlänge des Modells**, eine Angabe des Autors
(`getModelContextTokens`). `ai:contextLength` versucht sie vom Server zu lesen, aber kein
Server garantiert das Feld und die Namen unterscheiden sich — ein Fehlschlag wird als
solcher gemeldet, statt eine Zahl zu raten.

`contextLoad` schlägt bei 70% auf gelb und bei **90%** auf rot, nicht erst bei 100%: Die
Antwort muss in dasselbe Fenster passen. Rot heißt, dass der Server gerade den Anfang des
Prompts verwirft — dort stehen Verfassung und Projektbibel.

### Temperatur

`getModeSemanticConfig` liefert pro Modus eine Temperatur (muse ~0,9, analytical und
canon-sensitive 0,2), die über `composePrompt` als `recommendedTemperature` zum Aufrufer
und von dort an den Server geht. Sie war zuvor in `main.cjs` fest auf 0,7 verdrahtet,
wodurch alle Modi gleich klangen.

---

## 6. Widerspruchsprüfung

`src/ai/engine/aiContradictionDetector.ts` prüft in beide Richtungen, beide Male per
deterministischer Textsuche ohne Modellaufruf:

- `findFieldContradiction`: ein **Feldwert** gegen das Manuskript. Durchsucht nur Szenen
  und Kapitel, die die Figur überhaupt erwähnen.
- `findSceneContradictions`: eine **Szene** gegen die Dossiers, die sie verlinkt. Das ist
  die Prüfung, die der Lektor-Reiter anzeigt.

Der Trick, der beides ohne Sprachverständnis möglich macht: Geprüft werden nur
`select`-Felder gegen ihre eigenen Geschwister-Optionen. Die Optionen eines Feldes *sind*
das Vokabular der Domäne — „das Dossier sagt Protagonist, die Szene sagt Antagonist" ist
damit per Textsuche entscheidbar. Freitext bleibt unangetastet: Dort ließe sich ein
Widerspruch nicht von einer Formulierung unterscheiden.

Damit ein Fund nicht aus Zufallstreffern besteht, gelten zwei Einschränkungen von
`findSceneContradictions`: Eine Option zählt nur, wenn sie im Text **nahe einer Erwähnung
der Figur** steht (±120 Zeichen; Titel, Heldenname/Alias und einzelne Namenswörter), und
Optionen, die in Prosa gewöhnliche Wörter sind (`yes`/`no`, `low`/`high`, `ja`/`nein` …),
werden nie gesucht. Ohne beides meldete die Prüfung einen Widerspruch, weil irgendwo im
Dialog „No." stand. Der Preis: Aussagen nur über ein Pronomen („Sie ist der Antagonist")
werden nicht erkannt.

Ein Fund wird angezeigt, nie automatisch aufgelöst und nie blockierend — eine Szene kann
einem Dossier schlicht voraus sein.

---

## 7. Schreibpfad

Ein übernommener Vorschlag geht durch `handleApplyAISection`
(`src/hooks/useEntityCrud.ts`) und `updateMarkdownSection`. Dabei gilt:

- Es wird genau ein `##`-Abschnitt ersetzt oder ergänzt.
- Frontmatter und alle übrigen Abschnitte bleiben unangetastet.
- `lastModified` bewegt sich nur, weil der Schreibvorgang stattgefunden hat.

---

## 8. Eintrag aufräumen — Offene Fragen nachträglich einsortieren

Der freie Chat schreibt immer in genau einen gewählten Abschnitt — dadurch landen Antworten
auf Rückfragen, die während des Schreibens unter „Offene Fragen" gestellt wurden, auch
dauerhaft dort, selbst wenn sie inhaltlich anderswo hingehören. „Eintrag aufräumen"
(`src/ai/engine/aiTidyUp.ts`, `src/hooks/useEntityTidyUp.ts`) ist ein eigener, vom Nutzer
ausgelöster Schritt dagegen — **kein** automatisches Umsortieren durch die KI beim
Schreiben, das würde dem Grundprinzip widersprechen.

Nur sichtbar, wenn der Eintrag einen Abschnitt hat, dessen Überschrift exakt „Offene
Fragen" oder „Open Questions" lautet — eine kombinierte Überschrift wie „Geheimnisse &
offene Fragen" zählt bewusst nicht, weil sich dort nicht ohne Raten trennen lässt, was
Geheimnis und was offene Frage ist. `character-hero` und `organization` haben deshalb seit
diesem Umbau zwei getrennte Abschnitte statt eines kombinierten.

Ablauf: Die Punkte unter „Offene Fragen" werden durchnummeriert (`splitIntoPoints` — per
Aufzählungszeichen, sonst Absatz-Fallback), **ein** Modellaufruf ordnet jeden Punkt einem
der anderen Abschnitte zu oder lässt ihn, wie er ist (`N: <Abschnittsname>` / `N: bleibt`,
reiner Text, kein JSON-Vertrag). Die Antwort wird streng validiert
(`parseTidyUpResponse`): nur ein Abschnittsname, der exakt einem echten Abschnitt dieses
Eintrags entspricht, erzeugt einen Vorschlag — alles andere fällt zurück auf „bleibt", nie
auf eine Vermutung. Der Nutzer wählt pro Vorschlag einzeln ab, „Anwenden" schreibt dann in
einem Zug (`applyTidyUp`): Verschobene Punkte verschwinden aus „Offene Fragen" und werden
per `appendToSection` in ihren Zielabschnitt gehängt — derselbe Schreibpfad wie überall
sonst, eine Sicherungskopie entsteht automatisch.

Schreibschutz: Der Text von „Offene Fragen" wird beim Erzeugen der Vorschläge festgehalten.
Weicht er beim Anwenden vom dann aktuellen Inhalt ab, wird nichts geschrieben — die
Vorschläge bleiben stehen, mit einem Hinweis, neu vorzuschlagen, statt zwei Stände still
zusammenzuführen.

## 9. Der Begleiter im Manuskript

Im Manuskript-Arbeitsbereich sitzt die KI in der rechten Spalte, als zweiter Reiter neben
der Dossier-Vorschau (`ManuscriptChatPanel.tsx`, `useManuscriptChat.ts`). Sie arbeitet
immer an genau einer geöffneten Szene; in der Buch- oder Kapitelansicht gibt es keinen
einzelnen Text, in den etwas geschrieben werden könnte, und das Panel sagt das auch.

### Zwei Rollen

| Rolle | Modus | Übernehmen möglich |
|---|---|---|
| Schreibpartner | `muse` | ja |
| Lektor | `analytical` | nein — konstruktiv keine Schaltflächen |

Der Lektor ist bewusst eine eigene Rolle und kein Formulierungshinweis: Wer prüfen will,
soll nicht versehentlich Text übernehmen können.

### Was das Modell sieht

1. **Erzählverortung** (`buildNarrativePosition`): Buch, Kapitel, Position der Szene
   innerhalb des Kapitels und das Ende der vorhergehenden Szene. Ohne dieses Ende kann
   eine Fortsetzung nicht anschließen — sie würde den Moment neu beginnen.
2. **Verlinkte Dossiers** über die Kontextregel `mentioned:dossiers`: jeder `[[…]]`-Verweis
   im Szenentext, aufgelöst zu seinem Eintrag, unabhängig von der Kategorie und ohne dass
   Beziehungen gepflegt sein müssen. Manuskript-Einträge sind ausgenommen — eine verlinkte
   Nachbarszene würde das Budget allein aufbrauchen.
3. **Den Szenentext selbst** und, falls vorhanden, **die markierte Stelle**.

### Schreibziele

Zwei, nie ein blindes Überschreiben der ganzen Szene:

- **Anhängen** setzt an das Szenenende. Bereits Geschriebenes kann so nicht verloren gehen.
- **Auswahl ersetzen** schreibt über genau die markierten Zeichenpositionen — per Bereich,
  nicht per Textsuche, da dieselben Worte in einer Szene mehrfach vorkommen können. Der
  Knopf ist ohne Markierung deaktiviert.

Beides geht durch `handleUpdateSceneManuscriptText` und damit durch denselben Schreibpfad
wie das Tippen von Hand. Eine Ersetzung läuft über die Historie des Editors: ein einzelnes
Rückgängig nimmt sie zurück.
