/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import React, { useState, useRef, MouseEvent } from 'react';
import { LoreEntity, MapMarker, MapRegion, MapFloor, EntityType, LooseMediaAsset } from '../types';
import {
  PlusCircle,
  MapPin,
  Flag,
  Shield,
  Crown,
  Flame,
  Trash2,
  Globe,
  Sparkles,
  Image as ImageIcon,
  Download,
  ExternalLink,
  Move,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Plus,
  FolderOpen,
  FileImage,
  Layers,
  Shapes,
  Check,
  X,
  Palette,
  MousePointer,
  Upload,
  Edit2
} from 'lucide-react';
import { Language, getTypeTranslation } from '../utils/i18n';
import { slugify, updateMapContentWithMarkers } from '../utils/markdown';
import { bakeMarkersOntoImage } from '../utils/image';
import MediaPickerModal from './MediaPickerModal';
import { DangerConfirmDialog } from './DangerConfirmDialog';
import { ImageUploadModal, ImageUploadResult } from './ImageUploadModal';

interface MapEditorProps {
  entity: LoreEntity;
  entities: Record<string, LoreEntity>;
  looseMedia?: Record<string, LooseMediaAsset>;
  onUpdateEntity: (entity: LoreEntity) => void;
  onSelectEntity: (id: string) => void;
  onAddEntity?: (type: EntityType, title: string, parentId?: string, templateId?: string) => void;
  onAddLooseMedia?: (asset: LooseMediaAsset) => void;
  language: Language;
  readOnly?: boolean;
}

const REGION_COLORS = [
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Smaragd', hex: '#10b981' },
  { name: 'Bernstein', hex: '#f59e0b' },
  { name: 'Rubin', hex: '#f43f5e' },
  { name: 'Zyan', hex: '#06b6d4' },
  { name: 'Violett', hex: '#a855f7' },
];

const MARKER_COLORS = [
  { name: 'Bernstein', hex: '#f59e0b', labelEn: 'Amber', labelDe: 'Bernstein' },
  { name: 'Indigo', hex: '#6366f1', labelEn: 'Indigo', labelDe: 'Indigo' },
  { name: 'Smaragd', hex: '#10b981', labelEn: 'Emerald', labelDe: 'Smaragd' },
  { name: 'Rubin', hex: '#f43f5e', labelEn: 'Ruby', labelDe: 'Rubin' },
  { name: 'Zyan', hex: '#06b6d4', labelEn: 'Cyan', labelDe: 'Zyan' },
  { name: 'Violett', hex: '#a855f7', labelEn: 'Violet', labelDe: 'Violett' },
];

const MARKER_ICONS = [
  { id: 'MapPin', labelEn: 'Pin', labelDe: 'Pin / Ort', Icon: MapPin },
  { id: 'Flag', labelEn: 'Flag', labelDe: 'Flagge / Posten', Icon: Flag },
  { id: 'Shield', labelEn: 'Fortress', labelDe: 'Burg / Festung', Icon: Shield },
  { id: 'Crown', labelEn: 'Capital', labelDe: 'Krone / Stadt', Icon: Crown },
  { id: 'Flame', labelEn: 'Danger', labelDe: 'Gefahr / Magie', Icon: Flame },
];

function getMarkerIconComponent(iconId?: string) {
  switch (iconId) {
    case 'Flag':
      return Flag;
    case 'Shield':
      return Shield;
    case 'Crown':
      return Crown;
    case 'Flame':
      return Flame;
    case 'MapPin':
    default:
      return MapPin;
  }
}

export default function MapEditor({
  entity,
  entities,
  looseMedia,
  onUpdateEntity,
  onSelectEntity,
  onAddEntity,
  onAddLooseMedia,
  language,
  readOnly = false,
}: MapEditorProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Tools & Selection state
  const [activeTool, setActiveTool] = useState<'select' | 'marker' | 'region'>('select');
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);

  // Floor / Level state
  const floors: MapFloor[] = entity.mapFloors && entity.mapFloors.length > 0
    ? entity.mapFloors
    : [{ id: 'main', name: language === 'en' ? 'Main Map (Ground Floor)' : 'Hauptkarte (Erdgeschoss)', imageUrl: entity.imageUrl }];
  
  const [activeFloorId, setActiveFloorId] = useState<string>(floors[0].id);
  const [isFloorDrawerOpen, setIsFloorDrawerOpen] = useState(false);
  const [newFloorName, setNewFloorName] = useState('');
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [floorToDelete, setFloorToDelete] = useState<{ id: string; name: string; markerCount: number; regionCount: number } | null>(null);
  const [markerToDelete, setMarkerToDelete] = useState<string | null>(null);
  const [regionToDelete, setRegionToDelete] = useState<string | null>(null);

  // Region Drawing state
  const [currentRegionPoints, setCurrentRegionPoints] = useState<{ x: number; y: number }[]>([]);

  // Modals state
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [isImageMenuOpen, setIsImageMenuOpen] = useState(false);
  const [uploadModalFile, setUploadModalFile] = useState<File | null>(null);

  // Canvas Viewport & Zoom State
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  const activeFloor = floors.find((f) => f.id === activeFloorId) || floors[0];
  const activeImageSrc = activeFloor.imageUrl || entity.imageUrl || '';

  // Filter markers & regions by active floor
  const primaryFloorId = floors[0]?.id || 'main';
  
  // Local markers state for 60fps drag rendering
  const [localMarkers, setLocalMarkers] = useState<MapMarker[]>(entity.mapMarkers || []);
  
  React.useEffect(() => {
    if (!draggingMarkerId) {
      setLocalMarkers(entity.mapMarkers || []);
    }
  }, [entity.mapMarkers, draggingMarkerId]);

  // Reset selection when entity changes or when entering readOnly mode
  React.useEffect(() => {
    setSelectedMarkerId(null);
    setSelectedRegionId(null);
  }, [entity.id, readOnly]);

  const allMarkers = localMarkers;
  const activeFloorMarkers = allMarkers.filter((m) => {
    if (m.floorId) return m.floorId === activeFloorId;
    return activeFloorId === primaryFloorId;
  });

  const allRegions = entity.mapRegions || [];
  const activeFloorRegions = allRegions.filter((r) => {
    if (r.floorId) return r.floorId === activeFloorId;
    return activeFloorId === primaryFloorId;
  });

  // Selected Marker / Region
  const activeMarker = allMarkers.find((m) => m.id === selectedMarkerId);
  const activeRegion = allRegions.find((r) => r.id === selectedRegionId);

  // --- Floor Management ---
  const handleAddFloor = () => {
    if (!newFloorName.trim()) return;
    const newFloor: MapFloor = {
      id: `floor-${Date.now()}`,
      name: newFloorName.trim(),
      imageUrl: entity.imageUrl,
    };
    const updatedFloors = [...floors, newFloor];
    onUpdateEntity({
      ...entity,
      mapFloors: updatedFloors,
      lastModified: Date.now(),
    });
    setNewFloorName('');
    setActiveFloorId(newFloor.id);
  };

  const handleUpdateFloor = (floorId: string, updates: Partial<MapFloor>) => {
    const updatedFloors = floors.map((f) => (f.id === floorId ? { ...f, ...updates } : f));
    onUpdateEntity({
      ...entity,
      mapFloors: updatedFloors,
      lastModified: Date.now(),
    });
  };

  const handleDeleteFloor = (floorId: string) => {
    if (floors.length <= 1) return;
    const updatedFloors = floors.filter((f) => f.id !== floorId);
    onUpdateEntity({
      ...entity,
      mapFloors: updatedFloors,
      lastModified: Date.now(),
    });
    if (activeFloorId === floorId) {
      setActiveFloorId(updatedFloors[0].id);
    }
  };

  // --- Map Click Handler ---
  const handleMapClick = (e: MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'select' || readOnly) {
      setSelectedMarkerId(null);
      setSelectedRegionId(null);
      return;
    }

    if (!mapContainerRef.current) return;

    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = Math.round((((e.clientX - rect.left) / rect.width) * 100) * 10) / 10;
    const y = Math.round((((e.clientY - rect.top) / rect.height) * 100) * 10) / 10;

    if (activeTool === 'marker') {
      const newMarker: MapMarker = {
        id: `marker-${Date.now()}`,
        x,
        y,
        label: language === 'en' ? 'New Marker' : 'Neue Markierung',
        floorId: activeFloorId,
        color: '#f59e0b',
        icon: 'MapPin',
        description: language === 'en'
          ? 'Enter description for this location.'
          : 'Beschreibung für diesen Ort eingeben.',
      };

      const updatedMarkers = [...allMarkers, newMarker];
      const updatedContent = updateMapContentWithMarkers(entity.content, updatedMarkers, entities);
      onUpdateEntity({
        ...entity,
        mapMarkers: updatedMarkers,
        content: updatedContent,
        lastModified: Date.now(),
      });

      setSelectedMarkerId(newMarker.id);
      setSelectedRegionId(null);
      setActiveTool('select');
    } else if (activeTool === 'region') {
      setCurrentRegionPoints((prev) => [...prev, { x, y }]);
    }
  };

  // --- Finish Region Drawing ---
  const handleFinishRegion = () => {
    if (currentRegionPoints.length < 3) return;
    const newRegion: MapRegion = {
      id: `region-${Date.now()}`,
      name: language === 'en' ? 'New Area' : 'Neuer Bereich',
      points: currentRegionPoints,
      color: REGION_COLORS[Math.floor(Math.random() * REGION_COLORS.length)].hex,
      floorId: activeFloorId,
      description: language === 'en' ? 'Region description...' : 'Bereichs-Beschreibung...',
    };

    const updatedRegions = [...allRegions, newRegion];
    onUpdateEntity({
      ...entity,
      mapRegions: updatedRegions,
      lastModified: Date.now(),
    });

    setCurrentRegionPoints([]);
    setSelectedRegionId(newRegion.id);
    setSelectedMarkerId(null);
    setActiveTool('select');
  };

  const handleCancelRegion = () => {
    setCurrentRegionPoints([]);
    setActiveTool('select');
  };

  // --- Markers Operations ---
  const handleMarkerMouseDown = (e: React.MouseEvent, markerId: string) => {
    e.stopPropagation();
    setSelectedMarkerId(markerId);
    setSelectedRegionId(null);
    if (!readOnly && activeTool === 'select') {
      setDraggingMarkerId(markerId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingMarkerId || readOnly || !mapContainerRef.current) return;

    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const roundX = Math.round(x * 10) / 10;
    const roundY = Math.round(y * 10) / 10;

    setLocalMarkers((prev) =>
      prev.map((m) => (m.id === draggingMarkerId ? { ...m, x: roundX, y: roundY } : m))
    );
  };

  const handleUpdateMarker = (markerId: string, updates: Partial<MapMarker>) => {
    const updatedMarkers = localMarkers.map((m) => (m.id === markerId ? { ...m, ...updates } : m));
    const updatedContent = updateMapContentWithMarkers(entity.content, updatedMarkers, entities);
    onUpdateEntity({
      ...entity,
      mapMarkers: updatedMarkers,
      content: updatedContent,
      lastModified: Date.now(),
    });
  };

  const handleDeleteMarker = (markerId: string) => {
    const updatedMarkers = allMarkers.filter((m) => m.id !== markerId);
    const updatedContent = updateMapContentWithMarkers(entity.content, updatedMarkers, entities);
    onUpdateEntity({
      ...entity,
      mapMarkers: updatedMarkers,
      content: updatedContent,
      lastModified: Date.now(),
    });
    setSelectedMarkerId(null);
  };

  // --- Region Operations ---
  const handleUpdateRegion = (regionId: string, updates: Partial<MapRegion>) => {
    const updatedRegions = allRegions.map((r) => (r.id === regionId ? { ...r, ...updates } : r));
    onUpdateEntity({
      ...entity,
      mapRegions: updatedRegions,
      lastModified: Date.now(),
    });
  };

  const handleDeleteRegion = (regionId: string) => {
    const updatedRegions = allRegions.filter((r) => r.id !== regionId);
    onUpdateEntity({
      ...entity,
      mapRegions: updatedRegions,
      lastModified: Date.now(),
    });
    setSelectedRegionId(null);
  };

  // --- Zoom & Pan ---
  const handleWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.12 : -0.12;
    setZoomLevel((prev) => Math.max(0.4, Math.min(3.5, Math.round((prev + zoomDelta) * 100) / 100)));
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2 || e.altKey || activeTool === 'select') {
      if (e.button === 2) e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }
    handleMouseMove(e);
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
    if (draggingMarkerId) {
      const draggedMarker = localMarkers.find((m) => m.id === draggingMarkerId);
      if (draggedMarker) {
        handleUpdateMarker(draggingMarkerId, { x: draggedMarker.x, y: draggedMarker.y });
      }
      setDraggingMarkerId(null);
    }
  };

  // --- File Upload for active floor ---
  const handleFloorImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadModalFile(file);
    setIsImageMenuOpen(false);
    e.target.value = '';
  };

  const handleUploadComplete = (result: ImageUploadResult) => {
    if (onAddLooseMedia) {
      const id = 'media-' + Date.now() + '-' + slugify(result.title);
      onAddLooseMedia({
        id,
        title: result.title,
        imageUrl: result.url,
        createdAt: Date.now()
      });
    }

    handleUpdateFloor(activeFloorId, { imageUrl: result.url });
    if (activeFloorId === 'main' || floors.length === 1) {
      onUpdateEntity({
        ...entity,
        imageUrl: result.url,
        lastModified: Date.now()
      });
    }
  };

  const handleDownloadSnapshot = async () => {
    if (!activeImageSrc) return;
    try {
      const dataUrl = await bakeMarkersOntoImage(activeImageSrc, activeFloorMarkers);
      const a = document.createElement('a');
      a.download = `${slugify(entity.title)}-${activeFloor.name}.png`;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      console.error('Failed to generate snapshot:', e);
    }
  };

  const linkableEntities = Object.values(entities).filter((e) => e.id !== entity.id);

  return (
    <div className="flex flex-col h-full bg-surface-base text-ink-heading rounded-xl overflow-hidden border border-line/80 shadow-2xl">
      {/* 1. TOP MENU / TOOLBAR */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-card border-b border-line/80 z-20 gap-2 flex-wrap sm:flex-nowrap">
        {/* Tool Mode Selectors */}
        <div className="flex items-center gap-1.5 bg-surface-base p-1 rounded-xl border border-line/80">
          <button
            onClick={() => {
              setActiveTool('select');
              setCurrentRegionPoints([]);
            }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTool === 'select'
                ? 'bg-indigo-600 text-white shadow-md font-bold'
                : 'text-ink-secondary hover:text-ink-heading hover:bg-surface-control'
            }`}
            title={language === 'en' ? 'Select & Pan Tool' : 'Auswählen & Ziehen'}
          >
            <MousePointer className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{language === 'en' ? 'Select' : 'Auswählen'}</span>
          </button>

          {!readOnly && (
            <>
              <button
                onClick={() => {
                  setActiveTool('marker');
                  setCurrentRegionPoints([]);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeTool === 'marker'
                    ? 'bg-amber-600 text-white shadow-md font-bold'
                    : 'text-ink-secondary hover:text-ink-heading hover:bg-surface-control'
                }`}
                title={language === 'en' ? 'Place Landmark Pins' : 'Markierung setzen'}
              >
                <MapPin className="h-3.5 w-3.5 text-amber-300" />
                <span>{language === 'en' ? 'Marker' : 'Markierung'}</span>
              </button>

              <button
                onClick={() => {
                  setActiveTool('region');
                  setSelectedMarkerId(null);
                  setSelectedRegionId(null);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  activeTool === 'region'
                    ? 'bg-indigo-600 text-white shadow-md font-bold'
                    : 'text-ink-secondary hover:text-ink-heading hover:bg-surface-control'
                }`}
                title={language === 'en' ? 'Draw Polygon Areas' : 'Bereich zeichnen'}
              >
                <Shapes className="h-3.5 w-3.5 text-indigo-300" />
                <span>{language === 'en' ? 'Area' : 'Bereich'}</span>
              </button>
            </>
          )}
        </div>

        {/* Center: Floors / Level Drawer Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFloorDrawerOpen(!isFloorDrawerOpen)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono transition cursor-pointer flex items-center gap-2 border ${
              isFloorDrawerOpen
                ? 'bg-indigo-950 text-indigo-300 border-indigo-700/80 shadow-md font-bold'
                : 'bg-surface-control/80 text-ink border-line hover:bg-surface-hover'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-indigo-400" />
            <span className="font-semibold">{activeFloor.name}</span>
            <span className="text-[10px] bg-indigo-900/60 px-1.5 py-0.5 rounded text-indigo-300 font-bold">
              {floors.length} {language === 'en' ? 'Floors' : 'Etagen'}
            </span>
          </button>
        </div>

        {/* Right side: Image Options, Zoom & Snapshot */}
        <div className="flex items-center gap-2">
          {/* Change Map Image Menu */}
          {!readOnly && (
            <div className="relative">
              <button
                onClick={() => setIsImageMenuOpen(!isImageMenuOpen)}
                className="px-3 py-1.5 rounded-xl text-xs font-mono bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/80 text-indigo-200 transition cursor-pointer flex items-center gap-1.5 font-bold shadow-md"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                <span>{language === 'en' ? 'Map Image' : 'Kartenbild'}</span>
              </button>

              {isImageMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-surface-card border border-line rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 text-xs font-mono">
                  <button
                    onClick={() => {
                      setIsImageMenuOpen(false);
                      setIsMediaPickerOpen(true);
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-surface-control text-ink hover:text-ink-heading transition flex items-center gap-2 font-semibold"
                  >
                    <FolderOpen className="h-4 w-4 text-ink-secondary" />
                    <span>{language === 'en' ? 'Choose from Media' : 'Aus Medien-Galerie'}</span>
                  </button>

                  <label className="w-full text-left p-2 rounded-lg hover:bg-surface-control text-ink hover:text-ink-heading transition flex items-center gap-2 font-semibold cursor-pointer">
                    <Upload className="h-4 w-4 text-ink-secondary" />
                    <span>{language === 'en' ? 'Upload Local File' : 'Lokale Datei hochladen'}</span>
                    <input type="file" accept="image/*" onChange={handleFloorImageUpload} className="hidden" />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center bg-surface-control border border-line rounded-xl p-0.5">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.2))}
              className="p-1 hover:bg-surface-hover text-ink-secondary hover:text-ink-heading rounded-lg transition cursor-pointer"
              title={language === 'en' ? 'Zoom out' : 'Rauszoomen'}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-mono text-ink-secondary px-1.5">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
              className="p-1 hover:bg-surface-hover text-ink-secondary hover:text-ink-heading rounded-lg transition cursor-pointer"
              title={language === 'en' ? 'Zoom in' : 'Reinzoomen'}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            {(zoomLevel !== 1 || panOffset.x !== 0 || panOffset.y !== 0) && (
              <button
                onClick={() => {
                  setZoomLevel(1);
                  setPanOffset({ x: 0, y: 0 });
                }}
                className="p-1 hover:bg-surface-hover text-ink-secondary hover:text-ink-heading rounded-lg transition ml-0.5 border-l border-line cursor-pointer"
                title={language === 'en' ? 'Reset view' : 'Ansicht zurücksetzen'}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Download Snapshot */}
          <button
            onClick={handleDownloadSnapshot}
            className="p-2 bg-surface-control border border-line hover:bg-surface-hover text-ink rounded-xl text-xs font-mono transition cursor-pointer"
            title={language === 'en' ? 'Export Snapshot PNG' : 'Karten-Snapshot (PNG) herunterladen'}
          >
            <Download className="h-3.5 w-3.5 text-ink-secondary" />
          </button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE CONTAINER (Left Floor Drawer, Canvas, Right Inspector) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Floors / Levels Drawer */}
        {isFloorDrawerOpen && (
          <div className="w-64 bg-surface-card border-r border-line/80 p-3 flex flex-col gap-3 z-10 animate-fade-in flex-shrink-0">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <span className="text-xs font-mono font-bold text-ink-bright flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-indigo-400" />
                {language === 'en' ? 'ETAGEN & EBENEN' : 'ETAGEN & EBENEN'}
              </span>
              <button
                onClick={() => setIsFloorDrawerOpen(false)}
                className="text-ink-muted hover:text-ink p-1 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Floor List */}
            <div className="flex flex-col gap-1.5 overflow-y-auto flex-1">
              {floors.map((floor) => {
                const isActive = floor.id === activeFloorId;
                const isEditing = editingFloorId === floor.id;

                return (
                  <div
                    key={floor.id}
                    onClick={() => setActiveFloorId(floor.id)}
                    className={`p-2.5 rounded-xl border flex flex-col gap-1 transition cursor-pointer ${
                      isActive
                        ? 'bg-indigo-950/80 border-indigo-600 text-ink-heading shadow-md'
                        : 'bg-surface-base/60 border-line/80 text-ink-secondary hover:bg-surface-control hover:text-ink-bright'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {isEditing ? (
                        <input
                          type="text"
                          defaultValue={floor.name}
                          onBlur={(e) => {
                            handleUpdateFloor(floor.id, { name: e.target.value.trim() || floor.name });
                            setEditingFloorId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateFloor(floor.id, { name: e.currentTarget.value.trim() || floor.name });
                              setEditingFloorId(null);
                            }
                          }}
                          autoFocus
                          className="bg-black border border-indigo-500 text-xs px-1.5 py-0.5 rounded text-ink-heading font-mono w-full"
                        />
                      ) : (
                        <span className="text-xs font-mono font-bold truncate">{floor.name}</span>
                      )}

                      {!readOnly && !isEditing && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingFloorId(floor.id);
                            }}
                            className="p-1 text-ink-muted hover:text-ink-bright rounded"
                            title={language === 'en' ? 'Edit name' : 'Name bearbeiten'}
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          {floors.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFloorToDelete({
                                  id: floor.id,
                                  name: floor.name,
                                  markerCount: allMarkers.filter((m) => m.floorId === floor.id || (!m.floorId && floor.id === 'main')).length,
                                  regionCount: allRegions.filter((r) => r.floorId === floor.id || (!r.floorId && floor.id === 'main')).length,
                                });
                              }}
                              className="p-1 text-ink-muted hover:text-rose-400 rounded"
                              title={language === 'en' ? 'Delete floor' : 'Etage löschen'}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <span className="text-[10px] font-mono text-ink-muted">
                      {allMarkers.filter((m) => m.floorId === floor.id || (!m.floorId && floor.id === 'main')).length} {language === 'en' ? 'markers' : 'Marker'},{' '}
                      {allRegions.filter((r) => r.floorId === floor.id || (!r.floorId && floor.id === 'main')).length} {language === 'en' ? 'areas' : 'Bereiche'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Add New Floor */}
            {!readOnly && (
              <div className="pt-2 border-t border-line flex flex-col gap-1.5">
                <span className="text-[10px] font-mono text-ink-secondary font-bold uppercase">
                  {language === 'en' ? '+ Add Floor Level' : '+ Neue Etage hinzufügen'}
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newFloorName}
                    onChange={(e) => setNewFloorName(e.target.value)}
                    placeholder={language === 'en' ? 'e.g., 1. Obergeschoss' : 'z.B. 1. Obergeschoss'}
                    className="flex-1 bg-surface-base border border-line rounded-lg px-2 py-1 text-xs font-mono text-ink-heading outline-none focus:border-indigo-600"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFloor()}
                  />
                  <button
                    onClick={handleAddFloor}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-mono font-bold cursor-pointer transition"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Center: Canvas Viewport */}
        <div
          className={`flex-1 relative overflow-hidden flex items-center justify-center bg-surface-base p-4 select-none ${
            isPanning ? 'cursor-grabbing' : ''
          }`}
          onWheel={handleWheelZoom}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Drawing Tool Overlay Banner */}
          {activeTool === 'region' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-950/65 border border-indigo-700/60 rounded-2xl px-4 py-2 text-xs font-mono text-ink-heading z-40 shadow-xl flex items-center gap-3 backdrop-blur-sm pointer-events-none select-none">
              <span className="flex items-center gap-1.5 text-indigo-300 font-bold">
                <Shapes className="h-4 w-4 animate-pulse" />
                {language === 'en' ? 'Area Drawing Active:' : 'Bereichs-Zeichner:'}
              </span>
              <span className="text-ink">
                {currentRegionPoints.length}{' '}
                {language === 'en' ? 'points set. Click map to add points.' : 'Punkte gesetzt. Klicke auf die Karte.'}
              </span>

              {currentRegionPoints.length >= 3 && (
                <button
                  onClick={handleFinishRegion}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition cursor-pointer flex items-center gap-1 shadow-md pointer-events-auto"
                >
                  <Check className="h-3.5 w-3.5" />
                  {language === 'en' ? 'Finish Area' : 'Bereich abschließen'}
                </button>
              )}

              <button
                onClick={handleCancelRegion}
                className="px-2.5 py-1 bg-surface-hover/90 hover:bg-surface-active text-ink rounded-lg text-xs transition cursor-pointer pointer-events-auto"
              >
                {language === 'en' ? 'Cancel' : 'Abbrechen'}
              </button>
            </div>
          )}

          {activeTool === 'marker' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-950/65 border border-amber-700/60 rounded-2xl px-4 py-2 text-xs font-mono text-amber-200 z-40 shadow-xl flex items-center gap-2 backdrop-blur-sm animate-bounce pointer-events-none select-none">
              <MapPin className="h-4 w-4 text-amber-400" />
              <span>{language === 'en' ? 'Click anywhere on map to drop a new landmark marker.' : 'Klicke auf die Karte, um eine neue Markierung zu setzen.'}</span>
            </div>
          )}

          {/* Interactive Map Board */}
          <div
            ref={mapContainerRef}
            onClick={handleMapClick}
            className={`relative rounded-xl shadow-2xl overflow-hidden select-none border border-line transition-transform duration-75 origin-center ${
              activeTool === 'marker' || activeTool === 'region'
                ? 'cursor-crosshair border-indigo-500 shadow-indigo-950/30'
                : isPanning
                ? 'cursor-grabbing'
                : 'cursor-grab'
            }`}
            style={{
              width: imageAspectRatio
                ? imageAspectRatio < 1
                  ? `${Math.min(650, Math.round(550 * imageAspectRatio))}px`
                  : `${Math.min(950, Math.round(550 * imageAspectRatio))}px`
                : '850px',
              height: '550px',
              maxHeight: '75vh',
              aspectRatio: imageAspectRatio ? `${imageAspectRatio}` : '16 / 9',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Background Image */}
            {activeImageSrc ? (
              <img
                src={activeImageSrc}
                alt={language === 'en' ? 'World map' : 'Weltkarte'}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth && img.naturalHeight) {
                    setImageAspectRatio(img.naturalWidth / img.naturalHeight);
                  }
                }}
                className="w-full h-full object-fill select-none pointer-events-none"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-surface-card flex items-center justify-center text-sm text-ink-muted select-none pointer-events-none">
                {language === 'en' ? 'No map image yet. Add one from the image menu.' : 'Noch kein Kartenbild. Füge eins über das Bildmenü hinzu.'}
              </div>
            )}

            {/* SVG Overlay for Polygons / Regions */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Completed Regions */}
              {activeFloorRegions.map((region) => {
                const isSelected = region.id === selectedRegionId;
                const pointsStr = region.points.map((p) => `${p.x},${p.y}`).join(' ');
                const centerX = region.points.reduce((s, p) => s + p.x, 0) / region.points.length;
                const centerY = region.points.reduce((s, p) => s + p.y, 0) / region.points.length;
                const fillOpacity = region.opacity ?? (isSelected ? 0.45 : 0.25);
                const strokeOpacity = Math.min(1.0, fillOpacity + 0.35);

                return (
                  <g key={region.id} className="pointer-events-auto cursor-pointer">
                    <polygon
                      points={pointsStr}
                      fill={region.color || '#6366f1'}
                      fillOpacity={fillOpacity}
                      stroke={region.color || '#6366f1'}
                      strokeOpacity={strokeOpacity}
                      strokeWidth={isSelected ? '1.2' : '0.6'}
                      strokeDasharray={isSelected ? 'none' : '2,2'}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRegionId(region.id);
                        setSelectedMarkerId(null);
                      }}
                      className="transition-all hover:opacity-90"
                    />
                    <text
                      x={centerX}
                      y={centerY}
                      fill="#ffffff"
                      fontSize="2.8"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] pointer-events-none select-none"
                    >
                      {region.name}
                    </text>
                  </g>
                );
              })}

              {/* Draft Polygon actively being drawn */}
              {currentRegionPoints.length > 0 && (
                <g>
                  <polygon
                    points={currentRegionPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="rgba(99, 102, 241, 0.25)"
                    stroke="#818cf8"
                    strokeWidth="0.8"
                    strokeDasharray="2,2"
                  />
                  {currentRegionPoints.map((p, idx) => (
                    <circle key={idx} cx={p.x} cy={p.y} r="1.2" fill="#818cf8" stroke="#ffffff" strokeWidth="0.4" />
                  ))}
                </g>
              )}
            </svg>

            {/* Render Pins / Markers */}
            {activeFloorMarkers.map((marker) => {
              const isSelected = marker.id === selectedMarkerId;
              const linkedEntity = marker.targetEntityId ? entities[marker.targetEntityId] : null;
              const IconComp = getMarkerIconComponent(marker.icon);
              const markerColor = marker.color || '#f59e0b';

              return (
                <div
                  key={marker.id}
                  className="absolute animate-fade-in group/pin z-20"
                  style={{ left: `${marker.x}%`, top: `${marker.y}%`, transform: 'translate(-50%, -100%)' }}
                >
                  <button
                    onMouseDown={(e) => handleMarkerMouseDown(e, marker.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMarkerId(marker.id);
                      setSelectedRegionId(null);
                    }}
                    className={`relative p-1.5 rounded-full transition-all duration-200 cursor-grab active:cursor-grabbing border ${
                      isSelected
                        ? 'scale-125 z-30 drop-shadow-[0_0_14px_rgba(99,102,241,0.9)] border-white bg-indigo-950 text-indigo-300'
                        : 'scale-100 hover:scale-110 z-20 hover:drop-shadow-[0_0_8px_rgba(0,0,0,0.6)] border-line-subtle/80 bg-surface-base/90'
                    }`}
                    style={{
                      color: isSelected ? undefined : markerColor,
                      borderColor: isSelected ? undefined : markerColor,
                      boxShadow: isSelected ? undefined : `0 0 10px ${markerColor}40`,
                    }}
                    title={marker.label}
                  >
                    <IconComp className="h-5 w-5 fill-current" />
                  </button>

                  {/* Marker label plaque */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMarkerId(marker.id);
                      setSelectedRegionId(null);
                    }}
                    className={`absolute left-1/2 -translate-x-1/2 -bottom-6 border px-1.5 py-0.5 rounded text-[9px] font-mono whitespace-nowrap cursor-pointer select-none transition ${
                      isSelected
                        ? 'text-indigo-300 border-indigo-700/80 bg-indigo-950/95 z-30 font-semibold shadow-md'
                        : 'text-ink border-line bg-surface-control/90 hover:border-line-strong'
                    }`}
                  >
                    {marker.label}
                    {linkedEntity && <span className="text-indigo-400 ml-1">🔗</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Inspector Panel (Marker or Region) */}
        <div className="w-full lg:w-80 flex flex-col bg-surface-card border-l border-line/80 z-10 flex-shrink-0">
          <div className="px-4 py-3 bg-surface-card border-b border-line/80 flex items-center justify-between">
            <h4 className="text-xs font-mono font-bold tracking-wider text-ink-bright flex items-center gap-1.5">
              {activeRegion ? (
                <>
                  <Shapes className="h-4 w-4 text-indigo-400" />
                  <span>{language === 'en' ? 'AREA INSPECTOR' : 'BEREICHS-INSPEKTOR'}</span>
                </>
              ) : (
                <>
                  <MapPin className="h-4 w-4 text-amber-400" />
                  <span>{language === 'en' ? 'MARKER INSPECTOR' : 'MARKIERUNGS-INSPEKTOR'}</span>
                </>
              )}
            </h4>
          </div>

          {/* INSPECT ACTIVE REGION */}
          {activeRegion ? (
            <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-ink-secondary font-bold flex items-center gap-1">
                  <Shapes className="h-3 w-3 text-indigo-400" />
                  {language === 'en' ? 'Area Polygon' : 'Bereichs-Polygon'}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => setRegionToDelete(activeRegion.id)}
                    className="flex items-center gap-1 text-[10px] font-mono text-rose-400 hover:text-rose-300 transition cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    {language === 'en' ? 'Delete Area' : 'Bereich löschen'}
                  </button>
                )}
              </div>

              {/* Area Name */}
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1">
                  {language === 'en' ? 'AREA NAME' : 'BEREICHS-NAME'}
                </label>
                {readOnly ? (
                  <div className="text-xs font-mono text-ink-heading font-bold bg-surface-base border border-line p-2 rounded">
                    {activeRegion.name}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={activeRegion.name}
                    onChange={(e) => handleUpdateRegion(activeRegion.id, { name: e.target.value })}
                    className="w-full bg-surface-base border border-line/80 rounded px-2.5 py-1.5 text-xs text-ink-heading outline-none focus:border-indigo-500 transition font-mono"
                  />
                )}
              </div>

              {/* Polygon Color Swatches */}
              {!readOnly && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-ink-secondary mb-1.5">
                      {language === 'en' ? 'HIGHLIGHT COLOR' : 'HERVORHEBUNGS-FARBE'}
                    </label>
                    <div className="flex items-center gap-2">
                      {REGION_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          onClick={() => handleUpdateRegion(activeRegion.id, { color: c.hex })}
                          className={`w-6 h-6 rounded-full border transition cursor-pointer ${
                            activeRegion.color === c.hex ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Transparency Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-mono text-ink-secondary font-bold">
                        {language === 'en' ? 'TRANSPARENCY / OPACITY' : 'TRANSPARENZ / DECKKRAFT'}
                      </label>
                      <span className="text-[10px] font-mono text-indigo-400 font-bold">
                        {Math.round((activeRegion.opacity ?? 0.3) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="1.0"
                      step="0.05"
                      value={activeRegion.opacity ?? 0.3}
                      onChange={(e) => handleUpdateRegion(activeRegion.id, { opacity: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-500 bg-surface-control rounded-lg cursor-pointer h-1.5"
                    />
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1">
                  {language === 'en' ? 'DESCRIPTION / LORE' : 'BESCHREIBUNG / LORE'}
                </label>
                {readOnly ? (
                  <div className="text-xs font-mono text-ink bg-surface-base border border-line p-2 rounded whitespace-pre-wrap leading-relaxed">
                    {activeRegion.description || '—'}
                  </div>
                ) : (
                  <textarea
                    value={activeRegion.description || ''}
                    onChange={(e) => handleUpdateRegion(activeRegion.id, { description: e.target.value })}
                    rows={3}
                    className="w-full bg-surface-base border border-line/80 rounded px-2.5 py-1.5 text-xs text-ink-heading outline-none focus:border-indigo-500 transition resize-none font-mono"
                  />
                )}
              </div>

              {/* Link to Entity */}
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1">
                  {language === 'en' ? 'LINKED CHRONICLE ENTRY' : 'VERKNÜPFTES DOSSIER'}
                </label>
                {!readOnly && (
                  <select
                    value={activeRegion.targetEntityId || ''}
                    onChange={(e) => handleUpdateRegion(activeRegion.id, { targetEntityId: e.target.value || undefined })}
                    className="w-full bg-surface-base border border-line/80 rounded px-2 py-1.5 text-xs text-ink-bright outline-none focus:border-indigo-500 transition font-mono mb-2"
                  >
                    <option value="">{language === 'en' ? '-- Not linked --' : '-- Nicht verknüpft --'}</option>
                    {linkableEntities.map((e) => (
                      <option key={e.id} value={e.id}>
                        [{getTypeTranslation(e.type, language)?.toUpperCase()}] {e.title}
                      </option>
                    ))}
                  </select>
                )}

                {activeRegion.targetEntityId ? (
                  <button
                    onClick={() => onSelectEntity(activeRegion.targetEntityId!)}
                    className="w-full flex items-center justify-center gap-2 p-2 bg-indigo-950/80 hover:bg-indigo-600 border border-indigo-700/80 text-white rounded-lg text-xs font-mono transition cursor-pointer font-bold shadow-lg"
                  >
                    <ExternalLink className="h-4 w-4 text-indigo-300" />
                    <span>
                      {language === 'en'
                        ? `Jump: ${entities[activeRegion.targetEntityId]?.title || activeRegion.targetEntityId}`
                        : `Zum Dossier: ${entities[activeRegion.targetEntityId]?.title || activeRegion.targetEntityId}`}
                    </span>
                  </button>
                ) : (
                  <div className="text-[10px] font-mono text-ink-faint italic bg-surface-base p-2 rounded border border-line">
                    {language === 'en' ? 'No chronicle entry linked to this area.' : 'Kein Dossier mit diesem Bereich verknüpft.'}
                  </div>
                )}
              </div>
            </div>
          ) : activeMarker ? (
            /* INSPECT ACTIVE MARKER */
            <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-ink-secondary font-bold flex items-center gap-1">
                  <Move className="h-3 w-3 text-indigo-400" />
                  {language === 'en' ? 'Marker Details' : 'Markierungs-Details'}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => setMarkerToDelete(activeMarker.id)}
                    className="flex items-center gap-1 text-[10px] font-mono text-rose-400 hover:text-rose-300 transition cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    {language === 'en' ? 'Delete' : 'Löschen'}
                  </button>
                )}
              </div>

              {/* Landmark Label */}
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1">
                  {language === 'en' ? 'MARKER NAME' : 'NAME DER MARKIERUNG'}
                </label>
                {readOnly ? (
                  <div className="text-xs font-mono text-ink-heading font-bold bg-surface-base border border-line p-2 rounded">
                    {activeMarker.label}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={activeMarker.label}
                    onChange={(e) => handleUpdateMarker(activeMarker.id, { label: e.target.value })}
                    className="w-full bg-surface-base border border-line/80 rounded px-2.5 py-1.5 text-xs text-ink-heading outline-none focus:border-indigo-500 transition font-mono"
                  />
                )}
              </div>

              {/* Symbol / Icon Selector */}
              {!readOnly && (
                <div>
                  <label className="block text-[10px] font-mono text-ink-secondary mb-1.5">
                    {language === 'en' ? 'MARKER ICON' : 'SYMBOL / ICON'}
                  </label>
                  <div className="grid grid-cols-5 gap-1.5 bg-surface-base p-1.5 rounded border border-line/80">
                    {MARKER_ICONS.map((item) => {
                      const IconComponent = item.Icon;
                      const isIconSelected = (activeMarker.icon || 'MapPin') === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleUpdateMarker(activeMarker.id, { icon: item.id })}
                          title={language === 'en' ? item.labelEn : item.labelDe}
                          className={`p-2 rounded flex flex-col items-center justify-center transition cursor-pointer border ${
                            isIconSelected
                              ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300 shadow-md scale-105'
                              : 'bg-surface-control/60 border-line/60 text-ink-secondary hover:text-ink-heading hover:border-line-strong'
                          }`}
                        >
                          <IconComponent className="h-4 w-4 fill-current" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Marker Color Swatches */}
              {!readOnly && (
                <div>
                  <label className="block text-[10px] font-mono text-ink-secondary mb-1.5">
                    {language === 'en' ? 'MARKER COLOR' : 'MARKIERUNGS-FARBE'}
                  </label>
                  <div className="flex items-center gap-2 bg-surface-base p-2 rounded border border-line/80">
                    {MARKER_COLORS.map((c) => {
                      const isColorSelected = (activeMarker.color || '#f59e0b') === c.hex;
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => handleUpdateMarker(activeMarker.id, { color: c.hex })}
                          className={`w-6 h-6 rounded-full border transition cursor-pointer ${
                            isColorSelected
                              ? 'border-white scale-110 shadow-md ring-2 ring-indigo-500/50'
                              : 'border-transparent opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={language === 'en' ? c.labelEn : c.labelDe}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1">
                  {language === 'en' ? 'DESCRIPTION / LORE' : 'BESCHREIBUNG / LORE'}
                </label>
                {readOnly ? (
                  <div className="text-xs font-mono text-ink bg-surface-base border border-line p-2 rounded whitespace-pre-wrap leading-relaxed">
                    {activeMarker.description || '—'}
                  </div>
                ) : (
                  <textarea
                    value={activeMarker.description || ''}
                    onChange={(e) => handleUpdateMarker(activeMarker.id, { description: e.target.value })}
                    rows={3}
                    className="w-full bg-surface-base border border-line/80 rounded px-2.5 py-1.5 text-xs text-ink-heading outline-none focus:border-indigo-500 transition resize-none font-mono"
                  />
                )}
              </div>

              {/* Link to Entity */}
              <div>
                <label className="block text-[10px] font-mono text-ink-secondary mb-1">
                  {language === 'en' ? 'LINKED CHRONICLE ENTRY' : 'VERKNÜPFTES DOSSIER'}
                </label>
                {!readOnly && (
                  <select
                    value={activeMarker.targetEntityId || ''}
                    onChange={(e) => handleUpdateMarker(activeMarker.id, { targetEntityId: e.target.value || undefined })}
                    className="w-full bg-surface-base border border-line/80 rounded px-2 py-1.5 text-xs text-ink-bright outline-none focus:border-indigo-500 transition font-mono mb-2"
                  >
                    <option value="">{language === 'en' ? '-- Not linked --' : '-- Nicht verknüpft --'}</option>
                    {linkableEntities.map((e) => (
                      <option key={e.id} value={e.id}>
                        [{getTypeTranslation(e.type, language)?.toUpperCase()}] {e.title}
                      </option>
                    ))}
                  </select>
                )}

                {activeMarker.targetEntityId ? (
                  <button
                    onClick={() => onSelectEntity(activeMarker.targetEntityId!)}
                    className="w-full flex items-center justify-center gap-2 p-2 bg-indigo-950/80 hover:bg-indigo-600 border border-indigo-700/80 text-white rounded-lg text-xs font-mono transition cursor-pointer font-bold shadow-lg"
                  >
                    <ExternalLink className="h-4 w-4 text-indigo-300" />
                    <span>
                      {language === 'en'
                        ? `Jump: ${entities[activeMarker.targetEntityId]?.title || activeMarker.targetEntityId}`
                        : `Direkt zum Dossier: ${entities[activeMarker.targetEntityId]?.title || activeMarker.targetEntityId}`}
                    </span>
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-mono text-ink-faint italic bg-surface-base p-2 rounded border border-line">
                      {language === 'en' ? 'No chronicle entry linked to this marker.' : 'Kein Dossier mit dieser Markierung verknüpft.'}
                    </div>
                    {!readOnly && onAddEntity && (
                      <button
                        onClick={() => {
                          const predictedId = slugify(activeMarker.label);
                          onAddEntity('place', activeMarker.label, entity.id, 'place-template');
                          handleUpdateMarker(activeMarker.id, { targetEntityId: predictedId });
                        }}
                        className="w-full flex items-center justify-center gap-1.5 p-2 bg-surface-control hover:bg-indigo-950 border border-line hover:border-indigo-700 text-indigo-300 rounded-lg text-xs font-mono transition cursor-pointer font-semibold"
                      >
                        <Plus className="h-3.5 w-3.5 text-indigo-400" />
                        <span>{language === 'en' ? 'Forge Location Dossier' : 'Orts-Dossier schmieden & verknüpfen'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-ink-muted">
              <MapPin className="h-8 w-8 text-ink-disabled mb-2" />
              <p className="text-xs font-mono">
                {language === 'en'
                  ? 'Select a marker or polygon area to view details and jump to connected dossiers.'
                  : 'Wähle eine Markierung oder einen Bereich aus, um Details einzusehen und zu verknüpften Dossiers zu springen.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Media Picker Modal */}
      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelectImage={(url) => {
          handleUpdateFloor(activeFloorId, { imageUrl: url });
          if (activeFloorId === 'main' || floors.length === 1) {
            onUpdateEntity({ ...entity, imageUrl: url, lastModified: Date.now() });
          }
        }}
        entities={entities}
        looseMedia={looseMedia}
        language={language}
      />

      {/* Image Upload Modal for Map/Floor Image */}
      <ImageUploadModal
        isOpen={uploadModalFile !== null}
        onClose={() => setUploadModalFile(null)}
        file={uploadModalFile}
        activeEntity={entity}
        language={language}
        onUploadComplete={handleUploadComplete}
      />

      <DangerConfirmDialog
        isOpen={floorToDelete !== null}
        onCancel={() => setFloorToDelete(null)}
        onConfirm={() => {
          if (floorToDelete) handleDeleteFloor(floorToDelete.id);
          setFloorToDelete(null);
        }}
        title={language === 'en' ? 'Delete Floor?' : 'Etage löschen?'}
        message={
          floorToDelete
            ? (language === 'en'
                ? `"${floorToDelete.name}" and everything on it will be deleted — ${floorToDelete.markerCount} marker(s) and ${floorToDelete.regionCount} area(s). This cannot be undone.`
                : `„${floorToDelete.name}“ wird mitsamt allem darauf gelöscht — ${floorToDelete.markerCount} Marker und ${floorToDelete.regionCount} Bereiche. Das kann nicht rückgängig gemacht werden.`)
            : ''
        }
        confirmLabel={language === 'en' ? 'Delete Floor' : 'Etage löschen'}
        cancelLabel={language === 'en' ? 'Cancel' : 'Abbrechen'}
      />

      <DangerConfirmDialog
        isOpen={markerToDelete !== null}
        onCancel={() => setMarkerToDelete(null)}
        onConfirm={() => {
          if (markerToDelete) handleDeleteMarker(markerToDelete);
          setMarkerToDelete(null);
        }}
        title={language === 'en' ? 'Delete Marker?' : 'Markierung löschen?'}
        message={
          language === 'en'
            ? `Are you sure you want to delete the marker "${allMarkers.find(m => m.id === markerToDelete)?.label || ''}"?`
            : `Möchtest du die Markierung „${allMarkers.find(m => m.id === markerToDelete)?.label || ''}“ wirklich löschen?`
        }
        confirmLabel={language === 'en' ? 'Delete Marker' : 'Markierung löschen'}
        cancelLabel={language === 'en' ? 'Cancel' : 'Abbrechen'}
      />

      <DangerConfirmDialog
        isOpen={regionToDelete !== null}
        onCancel={() => setRegionToDelete(null)}
        onConfirm={() => {
          if (regionToDelete) handleDeleteRegion(regionToDelete);
          setRegionToDelete(null);
        }}
        title={language === 'en' ? 'Delete Area?' : 'Bereich löschen?'}
        message={
          language === 'en'
            ? `Are you sure you want to delete the area "${allRegions.find(r => r.id === regionToDelete)?.name || ''}"?`
            : `Möchtest du den Bereich „${allRegions.find(r => r.id === regionToDelete)?.name || ''}“ wirklich löschen?`
        }
        confirmLabel={language === 'en' ? 'Delete Area' : 'Bereich löschen'}
        cancelLabel={language === 'en' ? 'Cancel' : 'Abbrechen'}
      />
    </div>
  );
}
