/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export type EntityType = 
  | 'book' 
  | 'chapter'
  | 'character' 
  | 'relationship' 
  | 'item' 
  | 'map' 
  | 'power' 
  | 'lore' 
  | 'organization' 
  | 'place' 
  | 'scene' 
  | 'storyline'
  | 'brainstorm' 
  | 'note'
  | 'visual';

export interface Relation {
  targetId: string; // The ID (slugified filename) of the linked entity
  type: string;     // E.g., "Parent", "Allied With", "Located In", "Enemies"
}

export interface MapMarker {
  id: string;
  x: number; // Percentage coordinate (0-100)
  y: number; // Percentage coordinate (0-100)
  label: string;
  targetEntityId?: string; // Links marker to another place/character
  description?: string;
  floorId?: string; // Associated floor level
  color?: string; // Hex color for marker icon/badge
  icon?: string;  // Icon ID: 'MapPin' | 'Flag' | 'Shield' | 'Crown' | 'Flame'
}

export interface MapRegion {
  id: string;
  name: string;
  points: { x: number; y: number }[]; // Coordinates in percentage (0-100)
  color?: string; // Hex color for fill/border
  opacity?: number; // Fill opacity (0.05 to 1.0)
  description?: string;
  targetEntityId?: string;
  floorId?: string;
}

export interface MapFloor {
  id: string;
  name: string; // e.g., "Ground Floor", "Level 1", "Dungeon Level"
  imageUrl?: string; // Custom floorplan image if uploaded/different
  description?: string;
}

export interface LoreEntity {
  id: string;          // Lowercase slugified filename, e.g. "gandalf-the-grey"
  title: string;       // Obsidian filename-compatible title, e.g. "Gandalf the Grey"
  type: EntityType;
  content: string;     // Markdown body text
  tags: string[];
  relations: Relation[];
  imageUrl?: string;   // Image generated or uploaded (base64 or URL)
  galleryImageUrls?: string[]; // Additional gallery images
  lastModified: number;
  createdAt?: number;
  customFields: Record<string, string>; // Flexible character sheet attributes, place properties, etc.
  mapMarkers?: MapMarker[]; // Used if type === 'map'
  mapFloors?: MapFloor[];   // Multi-level floor support
  mapRegions?: MapRegion[]; // Drawn polygon areas on map
}

export interface LooseMediaAsset {
  id: string;          // Lowercase slugified filename or unique ID
  title: string;       // Display title e.g. "Burg-Luftaufnahme"
  imageUrl: string;   // Base64 image data URL, or a vault:// path into the assets folder
  createdAt: number;
}


export type FieldType = 'text' | 'number' | 'select' | 'multiselect' | 'link' | 'multilink' | 'date' | 'readonly';

export interface FieldDefinition {
  type: FieldType;
  options?: string[];
  targetTypes?: EntityType[];
  readonly?: boolean;
  required?: boolean;
}

export interface Template {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  defaultContent: string;
  defaultFields: Record<string, string>;
  defaultTags: string[];
  fieldConfig?: Record<string, FieldDefinition>;
  contextFields?: string[];
}
