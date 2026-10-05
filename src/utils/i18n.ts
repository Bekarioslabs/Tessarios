/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { EntityType, Template } from '../types';
import { DEFAULT_TEMPLATES } from '../data/templates';
import { DEFAULT_TEMPLATES_EN } from '../data/templates_en';

export type Language = 'de' | 'en';

export const UI_TRANSLATIONS: Record<Language, Record<string, string>> = {
  de: {
    // General
    app_title: 'Archivar-Chroniken',
    tagline: 'Lokaler Worldbuilding-Tresor',
    search_placeholder: 'Durchsuche deinen Tresor...',
    all_categories: 'Alle Kategorien',
    empty_vault_title: 'Dein Tresor ist leer',
    empty_vault_desc: 'Erstelle deinen ersten Weltenbau-Eintrag im linken Seitenmenü!',
    new_entry: 'Neuer Eintrag',
    add_button: 'Hinzufügen',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    save: 'Speichern',
    saved: 'Gespeichert',
    saving: 'Wird gespeichert...',
    dirty: 'Ungespeicherte Änderungen',
    back: 'Zurück',
    confirm_delete_title: 'Eintrag löschen?',
    confirm_delete_msg: 'Bist du sicher, dass du den Eintrag „{title}“ löschen möchtest? Dies kann nicht rückgängig gemacht werden.',
    confirm_template_title: 'Vorlage anwenden?',
    confirm_template_msg: 'Möchtest du die Vorlage „{name}“ auf diesen Eintrag anwenden? Die Standard-Felder, Tags und Gliederung werden an das Ende deines Eintrags angehängt.',
    template_applied: 'Vorlage erfolgreich angewendet!',

    // Workspace Modes
    mode_edit: 'Schmiede (Editor)',
    mode_preview: 'Betrachten-Modus',

    // View Modes
    view_metadata: 'Dossier',
    view_split: 'Split',
    view_prose: 'Text',

    // Editor & Fields
    yaml_tags: 'YAML-TAGS',
    add_tag_placeholder: 'Tag hinzufügen (z.B. antagonist)...',
    suggested_tags: 'Empfohlen:',
    dossier_builder: 'STECKBRIEF / DOSSIER-FELDER',
    add_field_placeholder: 'Neues Feld (z.B. Haarfarbe)...',
    field_value_placeholder: 'Wert eintragen...',
    empty_dossier_fields: 'Noch keine Dossier-Felder vorhanden. Erstelle oben ein neues Feld oder wende eine Vorlage an!',
    relations: 'BEZIEHUNGEN & VERKNÜPFUNGEN',
    add_relation: 'Verbindung schmieden',
    relation_target: 'Ziel-Eintrag wählen...',
    relation_type_placeholder: 'Art der Verbindung (z.B. Mentor von)...',
    no_relations: 'Dieser Eintrag hat noch keine Verbindungen zu anderen Elementen des Universums.',
    wiki_links: 'MARKDOWN-MODUS (kompatibel mit `[[WikiLinks]]`)',
    wiki_links_desc: 'Beginne hier deine Geschichte zu weben...\n- Nutze [[WikiLinks]], um Seiten einfach zu verbinden\n- Klicke auf den Dossier-Reiter, um das formatierte Blatt anzuzeigen',
    incoming_links: 'EINGEHENDE VERKNÜPFUNGEN (BACKLINKS)',
    no_incoming_links: 'Noch keine eingehenden Verknüpfungen von anderen Einträgen vorhanden.',

    // Sidebar
    export_all: 'Tresor exportieren (ZIP)',
    import_files: 'Einträge importieren (MD/ZIP)',
    delete_vault: 'Tresor löschen',

    // Map Editor
    map_prompt_placeholder: 'Gib eine Beschreibung für das KI-Karten-Design ein...',
    map_generate: 'Karte mit KI zeichnen',
    map_generating: 'KI zeichnet Karte...',
    map_markers: 'Kartenmarkierungen',
    map_add_marker: 'Markierung an dieser Stelle hinzufügen',
    map_marker_label_placeholder: 'Name des Ortes/Markers...',
    map_marker_desc_placeholder: 'Kurzbeschreibung...',
    map_marker_link_placeholder: 'Verknüpften Eintrag wählen...',
  },
  en: {
    // General
    app_title: 'Archivist Chronicles',
    tagline: 'Local Worldbuilding Vault',
    search_placeholder: 'Search your vault...',
    all_categories: 'All Categories',
    empty_vault_title: 'Your Vault is empty',
    empty_vault_desc: 'Create your first worldbuilding entry in the left sidebar!',
    new_entry: 'New Entry',
    add_button: 'Add',
    cancel: 'Cancel',
    delete: 'Delete',
    save: 'Save',
    saved: 'Saved',
    saving: 'Saving...',
    dirty: 'Unsaved Changes',
    back: 'Back',
    confirm_delete_title: 'Delete entry?',
    confirm_delete_msg: 'Are you sure you want to delete the entry "{title}"? This cannot be undone.',
    confirm_template_title: 'Apply template?',
    confirm_template_msg: 'Would you like to apply the template "{name}" to this entry? Default fields, tags, and outline will be appended to your content.',
    template_applied: 'Template applied successfully!',

    // Workspace Modes
    mode_edit: 'Forge (Editor)',
    mode_preview: 'Dossier View',

    // View Modes
    view_metadata: 'Dossier',
    view_split: 'Split',
    view_prose: 'Text',

    // Editor & Fields
    yaml_tags: 'YAML TAGS',
    add_tag_placeholder: 'Add tag (e.g., antagonist)...',
    suggested_tags: 'Recommended:',
    dossier_builder: 'DOSSIER / CHARACTER SHEET FIELDS',
    add_field_placeholder: 'New field (e.g., Hair Color)...',
    field_value_placeholder: 'Enter value...',
    empty_dossier_fields: 'No dossier fields yet. Create a new field above or apply a template!',
    relations: 'RELATIONS & LINKAGES',
    add_relation: 'Forge connection',
    relation_target: 'Choose target entry...',
    relation_type_placeholder: 'Connection type (e.g., Mentor of)...',
    no_relations: 'This entry has no connections to other elements of the universe yet.',
    wiki_links: 'MARKDOWN MODE (supports `[[WikiLinks]]`)',
    wiki_links_desc: 'Begin weaving your story here...\n- Use [[WikiLinks]] to connect pages easily\n- Click the Dossier tab to view the formatted sheet',
    incoming_links: 'INCOMING LINKAGES (BACKLINKS)',
    no_incoming_links: 'No incoming connections from other entries yet.',

    // Sidebar
    export_all: 'Export Vault (ZIP)',
    import_files: 'Import Entries (MD/ZIP)',
    delete_vault: 'Delete Vault',

    // Map Editor
    map_prompt_placeholder: 'Enter description for AI map generation...',
    map_generate: 'Generate Map with AI',
    map_generating: 'AI is drawing map...',
    map_markers: 'Map Markers',
    map_add_marker: 'Add marker at this spot',
    map_marker_label_placeholder: 'Name of the place/marker...',
    map_marker_desc_placeholder: 'Brief description...',
    map_marker_link_placeholder: 'Link to an entry...',
  }
};

export const ENTITY_TYPE_TRANSLATIONS: Record<Language, Record<EntityType, string>> = {
  de: {
    book: 'Buch',
    chapter: 'Kapitel',
    character: 'Charakter',
    relationship: 'Beziehung',
    item: 'Gegenstand',
    map: 'Karte',
    power: 'Kraft / System',
    lore: 'Wissen / Mythos',
    organization: 'Organisation',
    place: 'Ort',
    scene: 'Szene',
    storyline: 'Chronik / Handlungsstrang',
    brainstorm: 'Brainstorming',
    note: 'Arbeitsnotiz',
    visual: 'Visuelle Entwicklung',
  },
  en: {
    book: 'Book',
    chapter: 'Chapter',
    character: 'Character',
    relationship: 'Relationship',
    item: 'Item',
    map: 'Map',
    power: 'Power / Magic System',
    lore: 'Lore / Mythos',
    organization: 'Organization',
    place: 'Place',
    scene: 'Scene',
    storyline: 'Chronicle / Storyline',
    brainstorm: 'Brainstorming',
    note: 'Working Note',
    visual: 'Visual Development',
  }
};

export const getSuggestedTags = (type: EntityType, lang: Language): string[] => {
  if (lang === 'en') {
    switch (type) {
      case 'character':
        return ['hero', 'protagonist', 'side-character', 'antagonist', 'student', 'mentor', 'companion', 'villain', 'daily-life', 'supporter'];
      case 'item':
        return ['gadget', 'item', 'gear', 'invention', 'weapon', 'tool', 'relic'];
      case 'lore':
        return ['lore', 'myth', 'legend', 'magic', 'history', 'secret'];
      case 'place':
        return ['place', 'hideout', 'headquarters', 'meeting-point', 'city', 'building'];
      case 'power':
        return ['superpower', 'magic-system', 'ability', 'spell'];
      case 'organization':
        return ['faction', 'team', 'club', 'organization', 'guild', 'gang'];
      default:
        return [type];
    }
  } else {
    switch (type) {
      case 'character':
        return ['held', 'protagonist', 'nebencharakter', 'antagonist', 'schüler', 'mentor', 'gefährte', 'schurke', 'alltag', 'unterstützer'];
      case 'item':
        return ['gadget', 'gegenstand', 'ausrüstung', 'erfindung', 'waffe', 'werkzeug', 'relikt'];
      case 'lore':
        return ['wissen', 'mythos', 'legende', 'magie', 'historie', 'geheimnis'];
      case 'place':
        return ['ort', 'versteck', 'treffpunkt', 'stadt', 'gebäude'];
      case 'power':
        return ['superkraft', 'magiesystem', 'fähigkeit', 'zauber'];
      case 'organization':
        return ['fraktion', 'team', 'club', 'organisation', 'gilde', 'bande'];
      default:
        return [type];
    }
  }
};

export interface EntityTypeGroup {
  category: { de: string; en: string };
  types: EntityType[];
}

export const CATEGORIZED_ENTITY_TYPES: EntityTypeGroup[] = [
  {
    category: { de: '📚 Manuskript & Chronik', en: '📚 Manuscript & Chronicles' },
    types: ['book', 'chapter', 'scene', 'storyline']
  },
  {
    category: { de: '👥 Figuren & Beziehungen', en: '👥 Characters & Relationships' },
    types: ['character', 'relationship', 'organization']
  },
  {
    category: { de: '🗺️ Welt & Schauplätze', en: '🗺️ World & Locations' },
    types: ['place', 'map']
  },
  {
    category: { de: '⚡ Systeme & Gegenstände', en: '⚡ Systems & Items' },
    types: ['power', 'item', 'lore']
  },
  {
    category: { de: '🎨 Visuals & Notizen', en: '🎨 Visuals & Notes' },
    types: ['visual', 'note', 'brainstorm']
  }
];

export const DEFAULT_TEMPLATES_LOCALIZED: Record<Language, Template[]> = {
  de: DEFAULT_TEMPLATES,
  en: DEFAULT_TEMPLATES_EN
};

// We will export a simple translation helper
export function getTranslation(key: string, lang: Language, replacements?: Record<string, string>): string {
  let text = UI_TRANSLATIONS[lang]?.[key] || UI_TRANSLATIONS['de']?.[key] || key;
  if (replacements) {
    Object.entries(replacements).forEach(([k, v]) => {
      text = text.replace(new RegExp(`{${k}}`, 'g'), v);
    });
  }
  return text;
}

export function getTypeTranslation(type: EntityType | 'all', lang: Language): string {
  if (type === 'all') return getTranslation('all_categories', lang);
  return ENTITY_TYPE_TRANSLATIONS[lang]?.[type] || ENTITY_TYPE_TRANSLATIONS['de']?.[type] || type;
}

