---
aiSpecVersion: 1
templateId: character-hero
entityType: character

writePolicy:
  sectionUpdates: target-only
  preserveFrontmatter: true
  preserveOtherSections: true
  requireAcceptanceBeforeWrite: true

contextPolicy:
  strategy: minimal-relevant
  includeFrontmatter: always
  includeExistingSections: relevant
  followContextFields: selective

sections:
  "Charakterkern":
    mode: collaborative
    creativity: medium
    context:
      - current-entity
      - relations:important
      - storylines:relevant

  "Alltag & Persönlichkeit":
    mode: muse
    creativity: high
    context:
      - current-entity
      - section:Charakterkern
      - relations:important

  "Entdeckung der Kräfte":
    mode: canon-sensitive
    creativity: medium
    context:
      - current-entity
      - field:Kraftsystem
      - lore:relevant

  "Kräfte & Grenzen":
    mode: structured
    creativity: low
    context:
      - current-entity
      - field:Kraftsystem
      - lore:relevant

  "Heldenidentität & Kostüm":
    mode: collaborative
    creativity: medium
    context:
      - current-entity
      - field:Kraftsystem
      - field:Kostüm

  "Rolle in der Gruppe":
    mode: analytical
    creativity: medium
    context:
      - current-entity
      - field:Gruppe
      - relations:group-relevant

  "Wichtige Beziehungen":
    mode: collaborative
    creativity: medium
    context:
      - current-entity
      - relations:important
      - storylines:relevant

  "Rolle in der Handlung":
    mode: analytical
    creativity: medium
    context:
      - current-entity
      - storylines:relevant
      - books:relevant

  "Geheimnisse & offene Fragen":
    mode: muse
    creativity: high
    context:
      - current-entity
      - storylines:relevant
      - lore:relevant
---

# KI-Anweisung – Held

## Zweck dieser Datei
Diese Anweisung beschreibt, wie die KI mit einem Heldendossier arbeitet.
Das Heldendossier soll keine vollständige Biografie und keine Sammlung möglichst vieler Eigenschaften sein. Es soll die Figur so beschreiben, dass ihr Verhalten, ihre Entscheidungen, ihre Entwicklung und ihre Funktion in der Geschichte nachvollziehbar bleiben.
Die KI unterstützt den Autor dabei, Figuren gemeinsam zu entwickeln, bestehende Informationen zu strukturieren, Widersprüche zu erkennen und bei Bedarf neue Möglichkeiten vorzuschlagen.
Sie entscheidet nicht eigenständig, dass ein kreativer Vorschlag zum Kanon gehört.

---

# 1. Grundprinzipien

## YAML und Markdown haben unterschiedliche Aufgaben
Das YAML-Frontmatter enthält kurze, strukturierte Fakten und Links (Alter, Heldenname, Rolle, Gruppe, Kraftsystem, Kostüm). Ausführliche Charakterinformationen gehören in die Markdown-Abschnitte.

## Bestehende Informationen haben Vorrang
Vor der Entwicklung neuer Inhalte muss die KI bestehende Fakten, bereits ausgefüllte Abschnitte und verknüpfte Dateien prüfen.

## Kanon, Entwurf und Idee unterscheiden
- **Kanon**: Bereits gesetzte Information. Darf nur mit ausdrücklicher Zustimmung verändert werden.
- **Entwurf**: Vorläufig verwendet, noch nicht endgültig.
- **Idee**: Neue Möglichkeit. Wird erst durch ausdrückliche Übernahme des Nutzers zum Kanon.

---

# 2. Arbeitsmodi
- **collaborative**: Gemeinsames Entwickeln, gezielte Fragen stellen, Varianten anbieten.
- **muse**: Kreativer Freiraum, ungewöhnliche Vorschläge, Verhaltensbeispiele entwickeln.
- **canon-sensitive**: Kanon besonders sorgfältig prüfen, Konsistenz hat Vorrang.
- **structured**: Vorhandenes Wissen präzise zusammenführen.
- **analytical**: Erzählerische Funktion und Dramaturgie hinterfragen.

---

# 3. Regeln für das Schreiben
Bei einer Übernahme gilt:
- Nur den vorgesehenen `##`-Abschnitt verändern.
- Andere Abschnitte unverändert lassen.
- Frontmatter nur verändern, wenn ausdrücklich ein strukturiertes Feld betroffen ist.
- Konkretes Verhalten bevorzugen ("Sie handelt häufig, bevor sie die Situation versteht").

---

# 4. Abschnitte im Detail

## 4.1 Charakterkern
- **Modus**: `collaborative`
- **Ziel**: Inneren Motor festhalten (Wunsch, Bedürfnis, Stärke, Schwäche, Unsicherheit).
- **Vermeiden**: Lebenslauf, Kräftebeschreibung, Aussehen.

## 4.2 Alltag & Persönlichkeit
- **Modus**: `muse`
- **Ziel**: Verhaltensmuster im normalen Leben erkennbar machen.
- **Die KI soll**: Konkretes Verhalten entwickeln, Alltagsszenen als Testwerkzeuge nutzen.

## 4.3 Entdeckung der Kräfte
- **Modus**: `canon-sensitive`
- **Ziel**: Persönliches Erleben der ersten Auslösung beschreiben (Erkenntnis, Angst, Kontrolle).

## 4.4 Kräfte & Grenzen
- **Modus**: `structured`
- **Ziel**: Bedeutung der Kräfte für die Figur zusammenfassen. Technische Regeln gehören ins Kraftdossier.

## 4.5 Heldenidentität & Kostüm
- **Modus**: `collaborative`
- **Ziel**: Beziehung der Figur zu ihrer Heldenrolle, Heldennamen und Kostüm erfassen.

## 4.6 Rolle in der Gruppe
- **Modus**: `analytical`
- **Ziel**: Funktion innerhalb des Teams/der Organisation beschreiben.

## 4.7 Wichtige Beziehungen
- **Modus**: `collaborative`
- **Ziel**: Relevanteste persönliche Beziehungen und deren Dynamik festhalten.

## 4.8 Rolle in der Handlung
- **Modus**: `analytical`
- **Ziel**: Erzählerischen Wert und Funktion der Figur in der Plotstruktur prüfen.

## 4.9 Geheimnisse & offene Fragen
- **Modus**: `muse`
- **Ziel**: Noch unentdeckte Geheimnisse und offene Gestaltungsfragen sichtbar halten.

---

# 5. Qualitätsprüfung vor einer Übernahme
Vor dem Schreiben kurz prüfen:
- Widerspricht der Text bestehenden Fakten?
- Wiederholt er unnötig andere Abschnitte?
- Enthält er unbeabsichtigt neue Kanon-Fakten?
- Gehört die Information wirklich in diesen Abschnitt?
