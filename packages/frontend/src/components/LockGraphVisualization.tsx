import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { drag } from 'd3-drag';
import { zoom, zoomIdentity } from 'd3-zoom';
import { select } from 'd3-selection';
import { useForceSimulation, GraphNode, GraphEdge } from '../hooks/useForceSimulation';

// --- Color scheme for thread states ---

const STATE_COLORS: Record<string, string> = {
  Blocked: '#ef4444',
  Runnable: '#22c55e',
  Waiting: '#eab308',
  TimedWaiting: '#eab308',
  Native: '#8b5cf6',
  Sleeping: '#6b7280',
};
const DEFAULT_NODE_COLOR = '#94a3b8';

const STATE_LEGEND: Array<{ state: string; color: string }> = [
  { state: 'Blocked', color: '#ef4444' },
  { state: 'Runnable', color: '#22c55e' },
  { state: 'Waiting', color: '#eab308' },
  { state: 'Native', color: '#8b5cf6' },
  { state: 'Sleeping', color: '#6b7280' },
];

function stateColor(state: string): string {
  return STATE_COLORS[state] ?? DEFAULT_NODE_COLOR;
}

/** Extract last segment of a class name, e.g. "java.lang.Object" -> "Object" */
function shortClassName(className: string): string {
  const parts = className.split('.');
  return parts[parts.length - 1] ?? className;
}

// --- Types ---

interface Props {
  lockGraph: {
    nodes: Array<{ tid: number; threadName: string; state: string }>;
    edges: Array<{ from: number; to: number; lockAddress: string; lockClassName: string }>;
  };
  deadlocks: {
    detected: boolean;
    cycles: Array<{ threads: Array<{ tid: number; name: string }> }>;
  };
}

// --- Tooltip state ---

interface TooltipState {
  x: number;
  y: number;
  node: GraphNode;
}

// --- Component ---

const CONTAINER_HEIGHT = 400;
const NODE_RADIUS = 22;

export default function LockGraphVisualization({ lockGraph, deadlocks }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: CONTAINER_HEIGHT });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: CONTAINER_HEIGHT });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Build set of deadlocked tids for quick lookup
  const deadlockedTids = useMemo(() => {
    const tids = new Set<number>();
    if (deadlocks.detected) {
      for (const cycle of deadlocks.cycles) {
        for (const t of cycle.threads) {
          tids.add(t.tid);
        }
      }
    }
    return tids;
  }, [deadlocks]);

  // Convert lock graph data to D3-compatible nodes and edges (stable references via useMemo)
  const { graphNodes, graphEdges } = useMemo(() => {
    const nodes: GraphNode[] = lockGraph.nodes.map((n) => ({
      id: String(n.tid),
      tid: n.tid,
      threadName: n.threadName,
      state: n.state,
      isDeadlocked: deadlockedTids.has(n.tid),
      isBlocked: n.state === 'Blocked',
    }));

    const edges: GraphEdge[] = lockGraph.edges.map((e) => ({
      source: String(e.from),
      target: String(e.to),
      lockAddress: e.lockAddress,
      lockClassName: e.lockClassName,
    }));

    return { graphNodes: nodes, graphEdges: edges };
  }, [lockGraph, deadlockedTids]);

  // State for rendered positions
  const [renderNodes, setRenderNodes] = useState<GraphNode[]>([]);
  const [renderEdges, setRenderEdges] = useState<GraphEdge[]>([]);

  const onTick = useCallback((nodes: GraphNode[], edges: GraphEdge[]) => {
    setRenderNodes(nodes);
    setRenderEdges(edges);
  }, []);

  const { simulationRef } = useForceSimulation(graphNodes, graphEdges, {
    width: dimensions.width,
    height: dimensions.height,
    onTick,
  });

  // Setup zoom on SVG
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    const svgEl = select(svgRef.current);
    const gEl = select(gRef.current);

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        gEl.attr('transform', event.transform.toString());
      });

    svgEl.call(zoomBehavior);

    // Reset zoom on double-click
    svgEl.on('dblclick.zoom', () => {
      svgEl.call(zoomBehavior.transform, zoomIdentity);
    });

    return () => {
      svgEl.on('.zoom', null);
    };
  }, []);

  // Setup drag on nodes
  useEffect(() => {
    if (!gRef.current || renderNodes.length === 0) return;

    const nodeElements = select(gRef.current).selectAll<SVGGElement, GraphNode>('.lock-graph-node');

    const dragBehavior = drag<SVGGElement, GraphNode>()
      .on('start', (_event, d) => {
        if (simulationRef.current) {
          simulationRef.current.alphaTarget(0.3).restart();
        }
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (_event, d) => {
        if (simulationRef.current) {
          simulationRef.current.alphaTarget(0);
        }
        d.fx = null;
        d.fy = null;
      });

    nodeElements.call(dragBehavior);
  }, [renderNodes.length, simulationRef]);

  // Edge helpers to get coordinates
  function sourceX(edge: GraphEdge): number {
    return (edge.source as GraphNode).x ?? 0;
  }
  function sourceY(edge: GraphEdge): number {
    return (edge.source as GraphNode).y ?? 0;
  }
  function targetX(edge: GraphEdge): number {
    return (edge.target as GraphNode).x ?? 0;
  }
  function targetY(edge: GraphEdge): number {
    return (edge.target as GraphNode).y ?? 0;
  }

  /** Compute the edge endpoint adjusted for node radius (arrow touches the circle border) */
  function adjustedTarget(edge: GraphEdge): { x: number; y: number } {
    const sx = sourceX(edge);
    const sy = sourceY(edge);
    const tx = targetX(edge);
    const ty = targetY(edge);
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { x: tx, y: ty };
    const ratio = (dist - NODE_RADIUS - 4) / dist; // 4px gap for arrowhead
    return {
      x: sx + dx * ratio,
      y: sy + dy * ratio,
    };
  }

  /** Compute the edge midpoint for label placement */
  function edgeMidpoint(edge: GraphEdge): { x: number; y: number } {
    return {
      x: (sourceX(edge) + targetX(edge)) / 2,
      y: (sourceY(edge) + targetY(edge)) / 2,
    };
  }

  // Find lock info for tooltip: which locks does this node wait on?
  function getNodeLockInfo(node: GraphNode): string | null {
    const edge = lockGraph.edges.find((e) => e.from === node.tid);
    if (!edge) return null;
    const holder = lockGraph.nodes.find((n) => n.tid === edge.to);
    return `Waiting for ${shortClassName(edge.lockClassName)} (${edge.lockAddress}) held by "${holder?.threadName ?? `tid=${edge.to}`}"`;
  }

  const handleMouseEnter = (event: React.MouseEvent, node: GraphNode) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      node,
    });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  if (lockGraph.nodes.length === 0 || lockGraph.edges.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <h3 className="text-sm text-gray-500 mb-2">
        Lock Graph ({lockGraph.nodes.length} threads, {lockGraph.edges.length} edges)
        {deadlocks.detected && (
          <span className="ml-2 text-red-400 font-medium">
            -- Deadlock Detected
          </span>
        )}
      </h3>

      <div
        className="border border-border rounded-lg overflow-hidden bg-surface"
        style={{ height: CONTAINER_HEIGHT }}
      >
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="cursor-grab active:cursor-grabbing"
        >
          <defs>
            <marker
              id="lock-graph-arrow"
              viewBox="0 0 10 6"
              refX="10"
              refY="3"
              markerWidth="10"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,3 L0,6 Z" fill="#64748b" />
            </marker>
            <marker
              id="lock-graph-arrow-deadlock"
              viewBox="0 0 10 6"
              refX="10"
              refY="3"
              markerWidth="10"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,3 L0,6 Z" fill="#ef4444" />
            </marker>
          </defs>

          <g ref={gRef}>
            {/* Edges */}
            {renderEdges.map((edge, i) => {
              const adj = adjustedTarget(edge);
              const mid = edgeMidpoint(edge);
              const sourceNode = edge.source as GraphNode;
              const targetNode = edge.target as GraphNode;
              const isDeadlockEdge = sourceNode.isDeadlocked && targetNode.isDeadlocked;
              return (
                <g key={`edge-${i}`}>
                  <line
                    x1={sourceX(edge)}
                    y1={sourceY(edge)}
                    x2={adj.x}
                    y2={adj.y}
                    stroke={isDeadlockEdge ? '#ef4444' : '#64748b'}
                    strokeWidth={isDeadlockEdge ? 2.5 : 1.5}
                    markerEnd={`url(#${isDeadlockEdge ? 'lock-graph-arrow-deadlock' : 'lock-graph-arrow'})`}
                    opacity={0.7}
                  />
                  <text
                    x={mid.x}
                    y={mid.y - 8}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize={10}
                    className="pointer-events-none select-none"
                  >
                    {shortClassName(edge.lockClassName)}
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {renderNodes.map((node) => (
              <g
                key={node.id}
                className="lock-graph-node"
                transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                onMouseEnter={(e) => handleMouseEnter(e, node)}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: 'grab' }}
              >
                {/* Deadlock highlight ring */}
                {node.isDeadlocked && (
                  <circle
                    r={NODE_RADIUS + 4}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={3}
                    strokeDasharray="6 3"
                    opacity={0.8}
                  />
                )}
                {/* Main circle */}
                <circle
                  r={NODE_RADIUS}
                  fill={stateColor(node.state)}
                  opacity={0.85}
                  stroke={node.isDeadlocked ? '#ef4444' : '#1e293b'}
                  strokeWidth={node.isDeadlocked ? 2 : 1}
                />
                {/* Thread name label */}
                <text
                  textAnchor="middle"
                  dy={-NODE_RADIUS - 8}
                  fill="#e2e8f0"
                  fontSize={11}
                  fontWeight={500}
                  className="pointer-events-none select-none"
                >
                  {node.threadName.length > 16 ? node.threadName.slice(0, 14) + '..' : node.threadName}
                </text>
                {/* TID inside circle */}
                <text
                  textAnchor="middle"
                  dy={4}
                  fill="#fff"
                  fontSize={10}
                  fontWeight={600}
                  className="pointer-events-none select-none"
                >
                  {node.tid}
                </text>
              </g>
            ))}
          </g>
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-50 px-3 py-2 rounded-lg shadow-lg border border-border bg-gray-900 text-xs text-gray-200 pointer-events-none"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 10,
              maxWidth: 300,
            }}
          >
            <div className="font-medium text-sm mb-1">"{tooltip.node.threadName}"</div>
            <div>TID: {tooltip.node.tid}</div>
            <div>
              State: <span style={{ color: stateColor(tooltip.node.state) }}>{tooltip.node.state}</span>
            </div>
            {tooltip.node.isDeadlocked && (
              <div className="text-red-400 font-medium mt-1">Part of deadlock cycle</div>
            )}
            {getNodeLockInfo(tooltip.node) && (
              <div className="mt-1 text-gray-400">{getNodeLockInfo(tooltip.node)}</div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
        {STATE_LEGEND.map((item) => (
          <div key={item.state} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.state}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <span
            className="inline-block w-3 h-3 rounded-full border-2 border-red-500 border-dashed"
          />
          <span>Deadlock</span>
        </div>
        <span className="ml-auto text-gray-600">Drag nodes | Scroll to zoom | Double-click to reset</span>
      </div>
    </div>
  );
}
