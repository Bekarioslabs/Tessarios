/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { LoreEntity, EntityType } from '../types';
import { Language, getTypeTranslation } from '../utils/i18n';
import { getTypeHexColor, getTypeBarColor } from './EntityTypeBadge';
import { Target, CheckSquare, Square } from 'lucide-react';

interface GraphViewProps {
  entities: Record<string, LoreEntity>;
  activeEntityId?: string;
  onSelectEntity: (id: string) => void;
  language: Language;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  title: string;
  type: EntityType;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  type: string;
}

// All 14 Chronicle Categories
export const ALL_CATEGORIES: EntityType[] = [
  'character',
  'place',
  'item',
  'relationship',
  'organization',
  'lore',
  'power',
  'map',
  'book',
  'chapter',
  'scene',
  'storyline',
  'brainstorm',
  'note',
  'visual'
];

export default function GraphView({ entities, activeEntityId, onSelectEntity, language }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 500, height: 320 });

  // Filter state for category toggles
  const [enabledTypes, setEnabledTypes] = useState<Set<EntityType>>(() => new Set(ALL_CATEGORIES));

  // Refs for D3 objects to enable smooth camera zoom transitions
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simulationNodesRef = useRef<Node[]>([]);
  // Node position memoization & double-buffering cache to prevent flickering during drag and re-renders
  const nodePositionsRef = useRef<Map<string, { x: number; y: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null }>>(new Map());

  // Calculate count of entities per category
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<EntityType, number>> = {};
    Object.values(entities).forEach(e => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return counts;
  }, [entities]);

  // Order categories so those with items appear first
  const sortedCategories = useMemo(() => {
    return [...ALL_CATEGORIES].sort((a, b) => {
      const countA = categoryCounts[a] || 0;
      const countB = categoryCounts[b] || 0;
      if (countA > 0 && countB === 0) return -1;
      if (countA === 0 && countB > 0) return 1;
      return 0;
    });
  }, [categoryCounts]);

  // Auto-enable active entity's category if it is currently filtered out
  useEffect(() => {
    if (activeEntityId && entities[activeEntityId]) {
      const entityType = entities[activeEntityId].type;
      if (entityType && !enabledTypes.has(entityType)) {
        setEnabledTypes(prev => {
          const next = new Set(prev);
          next.add(entityType);
          return next;
        });
      }
    }
  }, [activeEntityId, entities]);

  // Handle container resizing
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const w = rect.width || 500;
        const h = rect.height > 50 ? rect.height : 320;
        setDimensions({ width: w, height: h });
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Smoothly center & zoom camera onto target node
  const centerOnNode = useCallback((targetId?: string, duration = 800) => {
    if (!targetId || !svgRef.current || !zoomBehaviorRef.current) return;
    const targetNode = simulationNodesRef.current.find(n => n.id === targetId);
    if (!targetNode || targetNode.x === undefined || targetNode.y === undefined) return;

    const width = dimensions.width || 500;
    const height = dimensions.height || 320;
    const scale = 1.35;

    const transform = d3.zoomIdentity
      .translate(width / 2 - targetNode.x * scale, height / 2 - targetNode.y * scale)
      .scale(scale);

    d3.select(svgRef.current)
      .transition()
      .duration(duration)
      .ease(d3.easeCubicOut)
      .call(zoomBehaviorRef.current.transform, transform);
  }, [dimensions]);

  // Render D3 Graph
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Clear previous graph elements
    d3.select(svgRef.current).selectAll('*').remove();

    // 1. Filter nodes based on enabled categories and restore memoized positions
    const filteredEntities = Object.values(entities).filter(e => enabledTypes.has(e.type));

    const nodes: Node[] = filteredEntities.map(e => {
      const cached = nodePositionsRef.current.get(e.id);
      return {
        id: e.id,
        title: e.title,
        type: e.type,
        x: cached?.x,
        y: cached?.y,
        vx: cached?.vx,
        vy: cached?.vy,
        fx: cached?.fx,
        fy: cached?.fy,
      };
    });

    simulationNodesRef.current = nodes;

    const links: Link[] = [];
    const nodeIds = new Set(nodes.map(n => n.id));

    filteredEntities.forEach(entity => {
      // 1. Gather explicit relations
      entity.relations.forEach(rel => {
        if (nodeIds.has(rel.targetId) && entity.id !== rel.targetId) {
          const exists = links.some(
            l => (l.source === entity.id && l.target === rel.targetId) ||
                 (l.source === rel.targetId && l.target === entity.id)
          );
          if (!exists) {
            links.push({
              source: entity.id,
              target: rel.targetId,
              type: rel.type,
            });
          }
        }
      });

      // 2. Gather implicit relations from customFields [[WikiLinks]]
      Object.entries(entity.customFields || {}).forEach(([fieldName, value]) => {
        if (!value) return;
        const wikiLinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
        let match;
        while ((match = wikiLinkRegex.exec(value)) !== null) {
          if (match.index > 0 && value[match.index - 1] === '!') continue;
          const targetTitle = match[1].trim();
          const targetId = targetTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
          
          if (nodeIds.has(targetId) && entity.id !== targetId) {
            const exists = links.some(
              l => (l.source === entity.id && l.target === targetId) ||
                   (l.source === targetId && l.target === entity.id)
            );
            if (!exists) {
              links.push({
                source: entity.id,
                target: targetId,
                type: fieldName,
              });
            }
          }
        }
      });

      // 3. Gather implicit relations from markdown body text [[WikiLinks]]
      if (entity.content) {
        const wikiLinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
        let match;
        while ((match = wikiLinkRegex.exec(entity.content)) !== null) {
          if (match.index > 0 && entity.content[match.index - 1] === '!') continue;
          const targetTitle = match[1].trim();
          const targetId = targetTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
          
          if (nodeIds.has(targetId) && entity.id !== targetId) {
            const exists = links.some(
              l => (l.source === entity.id && l.target === targetId) ||
                   (l.source === targetId && l.target === entity.id)
            );
            if (!exists) {
              links.push({
                source: entity.id,
                target: targetId,
                type: language === 'en' ? 'Mention' : 'Erwähnung',
              });
            }
          }
        }
      }
    });

    // Dimensions
    const width = dimensions.width || 500;
    const height = dimensions.height || 320;

    const svg = d3.select(svgRef.current)
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g');

    // Zooming
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    zoomBehaviorRef.current = zoom;
    svg.call(zoom);

    // Force simulation
    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(42));

    // Link lines
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      // .style rather than .attr throughout this file: SVG presentation *attributes*
      // cannot read CSS custom properties, but the equivalent CSS properties can, which
      // is what lets the graph follow the theme instead of staying hardcoded dark.
      .style('stroke', 'var(--color-graph-edge)')
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', 1.5);

    link.append('title')
      .text(d => d.type 
        ? (language === 'en' ? `Relationship: ${d.type}` : `Beziehung: ${d.type}`) 
        : (language === 'en' ? 'Connection' : 'Verbindung'));

    // Glow filter for node hover/active states
    const filter = svg.append('defs')
      .append('filter')
      .attr('id', 'glow')
      .attr('x', '-30%')
      .attr('y', '-30%')
      .attr('width', '160%')
      .attr('height', '160%');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'blur');
    filter.append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter()
      .append('feMergeNode')
      .attr('in', d => d);

    // Node group
    const node = g.append('g')
      .selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        onSelectEntity(d.id);
      })
      .call(d3.drag<SVGGElement, Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      );

    // Circle representation
    node.append('circle')
      .attr('r', d => d.id === activeEntityId ? 10 : 6.5)
      .attr('fill', d => getTypeHexColor(d.type)?.main || '#9ca3af')
      .style('stroke', d => d.id === activeEntityId ? 'var(--color-ink-heading)' : 'none')
      .attr('stroke-width', 2.5)
      .style('filter', d => d.id === activeEntityId ? 'url(#glow)' : 'none');

    // Text labels
    node.append('text')
      .attr('class', 'graph-node-label')
      .attr('dy', 20)
      .attr('text-anchor', 'middle')
      .style('fill', d => d.id === activeEntityId ? 'var(--color-ink-heading)' : 'var(--color-ink)')
      .style('font-size', d => d.id === activeEntityId ? '11px' : '10px')
      .style('font-weight', d => d.id === activeEntityId ? 'bold' : 'normal')
      .style('font-family', 'ui-monospace, monospace')
      .text(d => d.title)
      .clone(true).lower()
      .attr('class', 'graph-node-label-bg')
      // A halo in the panel's own background color, so labels stay readable where
      // they overlap link lines.
      .style('fill', 'var(--color-surface-card)')
      .style('stroke', 'var(--color-surface-card)')
      .attr('stroke-width', 3)
      .attr('stroke-linejoin', 'round');

    // Double-buffered RAF frame rendering to eliminate flicker during simulation ticks & drag operations
    let animFrameId: number | null = null;
    let tickScheduled = false;

    const renderGraphPositions = () => {
      tickScheduled = false;
      link
        .attr('x1', d => (d.source as Node).x || 0)
        .attr('y1', d => (d.source as Node).y || 0)
        .attr('x2', d => (d.target as Node).x || 0)
        .attr('y2', d => (d.target as Node).y || 0);

      node
        .attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`);
    };

    // Simulation ticks update
    let initialZoomDone = false;
    simulation.on('tick', () => {
      // Continuously update position buffer / memoization cache
      nodes.forEach(n => {
        if (n.x !== undefined && n.y !== undefined) {
          nodePositionsRef.current.set(n.id, {
            x: n.x,
            y: n.y,
            vx: n.vx,
            vy: n.vy,
            fx: n.fx,
            fy: n.fy,
          });
        }
      });

      if (!tickScheduled) {
        tickScheduled = true;
        animFrameId = requestAnimationFrame(renderGraphPositions);
      }

      // Smoothly zoom to active entity once simulation coordinates stabilize
      if (!initialZoomDone && activeEntityId) {
        const activeNode = nodes.find(n => n.id === activeEntityId);
        if (activeNode && activeNode.x !== undefined) {
          initialZoomDone = true;
          centerOnNode(activeEntityId, 600);
        }
      }
    });

    // Drag handlers with memoized double buffering
    function dragstarted(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
      if (d.x !== undefined && d.y !== undefined) {
        nodePositionsRef.current.set(d.id, { x: d.x, y: d.y, fx: d.fx, fy: d.fy });
      }
    }

    function dragged(event: any, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
      d.x = event.x;
      d.y = event.y;
      nodePositionsRef.current.set(d.id, { x: event.x, y: event.y, fx: event.x, fy: event.y });

      if (!tickScheduled) {
        tickScheduled = true;
        animFrameId = requestAnimationFrame(renderGraphPositions);
      }
    }

    function dragended(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
      if (d.x !== undefined && d.y !== undefined) {
        nodePositionsRef.current.set(d.id, { x: d.x, y: d.y, fx: null, fy: null });
      }
    }

    return () => {
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
      }
      simulation.stop();
    };
  }, [entities, enabledTypes, dimensions, language, onSelectEntity]);

  // Dynamic active entity highlight update without re-creating SVG elements or restarting simulation
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGCircleElement, Node>('.node circle')
      .attr('r', d => d.id === activeEntityId ? 10 : 6.5)
      .style('stroke', d => d.id === activeEntityId ? 'var(--color-ink-heading)' : 'none')
      .style('filter', d => d.id === activeEntityId ? 'url(#glow)' : 'none');

    svg.selectAll<SVGTextElement, Node>('.node text.graph-node-label')
      .style('fill', d => d.id === activeEntityId ? 'var(--color-ink-heading)' : 'var(--color-ink)')
      .style('font-size', d => d.id === activeEntityId ? '11px' : '10px')
      .style('font-weight', d => d.id === activeEntityId ? 'bold' : 'normal');
  }, [activeEntityId]);

  // Trigger smooth camera zoom whenever activeEntityId changes
  useEffect(() => {
    if (activeEntityId) {
      const timer = setTimeout(() => {
        centerOnNode(activeEntityId, 800);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeEntityId, centerOnNode]);

  // Category Filter Toggle Handlers
  const toggleCategory = (type: EntityType) => {
    setEnabledTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const selectAllCategories = () => {
    setEnabledTypes(new Set(ALL_CATEGORIES));
  };

  const deselectAllCategories = () => {
    setEnabledTypes(new Set());
  };

  const activeCount = enabledTypes.size;

  return (
    <div 
      ref={containerRef} 
      className="relative rounded-xl border border-line bg-surface-base p-2 overflow-hidden transition-all duration-300 flex flex-col flex-1 min-h-0 w-full h-full"
      id="graph-view-container"
    >
      {/* Top Header Controls */}
      <div className="absolute top-2 left-2 flex items-center gap-2 z-10 pointer-events-none">
        <span className="text-[10px] font-mono font-medium tracking-wider text-ink bg-surface-base/90 px-2.5 py-1.5 rounded-md border border-line/80 pointer-events-auto flex items-center gap-1.5 shadow-md">
          <span>{language === 'en' ? 'RELATIONSHIP NETWORK' : 'BEZIEHUNGSNETZWERK'}</span>
          <span className="text-indigo-400 font-bold">({activeCount}/{ALL_CATEGORIES.length})</span>
        </span>

        {/* Center on Selected Entity Button */}
        {activeEntityId && (
          <button
            type="button"
            onClick={() => centerOnNode(activeEntityId, 800)}
            className="pointer-events-auto px-2 py-1 bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-800/80 text-indigo-200 rounded-md text-[10px] font-mono flex items-center gap-1 transition shadow-md cursor-pointer"
            title={language === 'en' ? 'Center camera on selected entity' : 'Kamera auf ausgewähltes Element zentrieren'}
          >
            <Target className="h-3 w-3 text-indigo-400" />
            <span>{language === 'en' ? 'Focus Selection' : 'Fokussieren'}</span>
          </button>
        )}
      </div>

      <svg 
        ref={svgRef} 
        className="w-full flex-1 min-h-0 block bg-surface-base rounded-lg" 
      />

      {/* Extended Legend & Category Filter Controls */}
      <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-1.5 bg-surface-base/95 p-2 rounded-lg border border-line/90 shadow-xl z-20 max-h-36 overflow-y-auto custom-scrollbar">
        {/* Filter Quick Action Bar */}
        <div className="flex items-center justify-between text-[10px] font-mono text-ink-secondary pb-1 border-b border-line/60 select-none">
          <div className="flex items-center gap-1.5 font-bold text-ink">
            <span>{language === 'en' ? 'CATEGORY FILTER & LEGEND' : 'KATEGORIEN-FILTER & LEGENDE'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllCategories}
              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition cursor-pointer text-[9px]"
              title={language === 'en' ? 'Select all categories' : 'Alle Kategorien aktivieren'}
            >
              <CheckSquare className="h-3 w-3" />
              <span>{language === 'en' ? 'All' : 'Alle'}</span>
            </button>
            <button
              type="button"
              onClick={deselectAllCategories}
              className="flex items-center gap-1 text-ink-muted hover:text-ink transition cursor-pointer text-[9px]"
              title={language === 'en' ? 'Deselect all categories' : 'Alle Kategorien deaktivieren'}
            >
              <Square className="h-3 w-3" />
              <span>{language === 'en' ? 'None' : 'Keine'}</span>
            </button>
          </div>
        </div>

        {/* Category Filter Buttons */}
        <div className="flex flex-wrap gap-1.5 text-[9px] font-mono select-none pt-0.5">
          {sortedCategories.map(catType => {
            const isEnabled = enabledTypes.has(catType);
            const count = categoryCounts[catType] || 0;
            const dotClass = getTypeBarColor(catType);
            const label = getTypeTranslation(catType, language);

            return (
              <button
                key={catType}
                type="button"
                onClick={() => toggleCategory(catType)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded border transition cursor-pointer shrink-0 ${
                  isEnabled
                    ? 'bg-surface-control border-line-strong text-ink-heading font-medium shadow-sm hover:bg-surface-hover'
                    : 'bg-surface-base border-line/80 text-ink-secondary hover:text-ink-bright hover:border-line-strong'
                }`}
                title={isEnabled 
                  ? (language === 'en' ? `Click to hide ${label}` : `Klicken, um ${label} auszublenden`)
                  : (language === 'en' ? `Click to show ${label}` : `Klicken, um ${label} einzublenden`)
                }
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass} ${isEnabled ? '' : 'opacity-60'}`} />
                <span>{label}</span>
                {count > 0 && (
                  <span className={`text-[8px] font-mono rounded px-1 py-0.2 ${isEnabled ? 'bg-surface-hover text-ink' : 'bg-surface-control text-ink-muted'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
