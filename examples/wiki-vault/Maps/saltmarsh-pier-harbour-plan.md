---
id: "saltmarsh-pier-harbour-plan"
type: map
title: "Saltmarsh Pier Harbour Plan"
lastModified: 2026-10-27
tags:
  - map
MapType: "Site Plan"
Area: "[[Saltmarsh Pier]]"
MapStatus: "Work in Progress"
Scale: "schematic"
Orientation: "North"
cssclasses:
  - dossier
  - dossier-map
imageUrl: "assets/Map 02.jpg"
---

> [!tip] Regions and floors on a map
> Besides pins, a map can have regions (areas you draw as polygons) and floors (several levels on one map).
>
> **What you can do:** Draw a region around an area, name it, colour it and link it to an entry. Add a floor for interiors or another level; each region belongs to one floor.
>
> **Connects to:** Regions can link to entries just like pins. Pins and regions are stored as plain data in the file, so they survive in any Markdown editor.
>
> **Try this:** Open the map, switch from the main floor to *Interiors* and watch which region appears.

## Overview
A close-up of the harbour end of [[Saltmarsh Pier]]. It exists to show regions, floors and pins on one map.

## Geographical Structure
The long deck runs left to right, the watchtower stands at its head, and the slipway leads down to the shore. The big building at the bottom right is drawn twice: once as a region on the main floor, once as its courtyard on the *Interiors* floor.

## Open Questions
- Who owns the tackle shop?

## Legend & Markers

| Marker | Relative pos (X, Y) | Linked entry | Description |
| --- | --- | --- | --- |
| **Slipway** | `0.53, 0.29` (53%, 29%) | *(unlinked)* | Where small boats are hauled out. |
| **Drying Racks** | `0.64, 0.46` (64%, 46%) | *(unlinked)* | Wooden frames for nets and fish. |
| **Tackle and Bait Shop** | `0.57, 0.60` (57%, 60%) | *(unlinked)* | The only shop on the pier. |

<!-- MAP_MARKERS_DATA: [{"id":"marker-slipway","x":53,"y":29,"label":"Slipway","floorId":"main","color":"#f59e0b","icon":"Flag","description":"Where small boats are hauled out."},{"id":"marker-drying-racks","x":64,"y":46,"label":"Drying Racks","floorId":"main","color":"#06b6d4","icon":"MapPin","description":"Wooden frames for nets and fish."},{"id":"marker-bait-shop","x":57,"y":60,"label":"Tackle and Bait Shop","floorId":"main","color":"#f43f5e","icon":"Crown","description":"The only shop on the pier."}] -->
<!-- MAP_STUDIO_DATA: {"markers":[{"id":"marker-slipway","x":53,"y":29,"label":"Slipway","floorId":"main","color":"#f59e0b","icon":"Flag","description":"Where small boats are hauled out."},{"id":"marker-drying-racks","x":64,"y":46,"label":"Drying Racks","floorId":"main","color":"#06b6d4","icon":"MapPin","description":"Wooden frames for nets and fish."},{"id":"marker-bait-shop","x":57,"y":60,"label":"Tackle and Bait Shop","floorId":"main","color":"#f43f5e","icon":"Crown","description":"The only shop on the pier."}],"floors":[{"id":"main","name":"Main Map (Ground Floor)","imageUrl":"vault://assets/Map 02.jpg"},{"id":"floor-interiors","name":"Interiors","imageUrl":"vault://assets/Map 02.jpg"}],"regions":[{"id":"region-docking-area","name":"Main Docking Area","color":"#6366f1","floorId":"main","targetEntityId":"saltmarsh-pier","description":"The long deck where the boats tie up.","points":[{"x":10.7,"y":23.6},{"x":10.6,"y":35.8},{"x":45,"y":36.2},{"x":44.4,"y":31.3},{"x":40.1,"y":31.8},{"x":40.1,"y":24.5}]},{"id":"region-watchtower","name":"Harbormaster's Watchtower","color":"#10b981","floorId":"main","targetEntityId":"harbour-authority-office","description":"The square tower at the head of the deck.","points":[{"x":40.6,"y":19.8},{"x":40.8,"y":29.6},{"x":47.8,"y":30.4},{"x":48.1,"y":20.4}]},{"id":"region-fountain-hall","name":"Fountain Hall","color":"#f43f5e","floorId":"main","description":"A courtyard building on the shore. Switch to the Interiors floor to see its inner area.","points":[{"x":59.5,"y":83.8},{"x":68.4,"y":72.7},{"x":78.5,"y":85.8},{"x":77.6,"y":88.7},{"x":74.6,"y":88.5},{"x":69,"y":95.8},{"x":59.8,"y":83.8}]},{"id":"region-fountain-court","name":"Fountain Hall – Courtyard","color":"#06b6d4","floorId":"floor-interiors","description":"Drawn on the Interiors floor: a region belongs to exactly one floor.","points":[{"x":59.5,"y":83.5},{"x":68.6,"y":72.5},{"x":73.7,"y":78.4},{"x":64.2,"y":89.3}]}]} -->