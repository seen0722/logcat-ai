import { useEffect, useRef, useCallback } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  tid: number;
  threadName: string;
  state: string;
  isDeadlocked?: boolean;
  isBlocked?: boolean;
}

export interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  lockAddress: string;
  lockClassName: string;
}

interface UseForceSimulationOptions {
  width: number;
  height: number;
  onTick: (nodes: GraphNode[], edges: GraphEdge[]) => void;
}

export function useForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: UseForceSimulationOptions
) {
  const simulationRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);

  useEffect(() => {
    if (nodes.length === 0) return;

    const simulation = forceSimulation<GraphNode>(nodes)
      .force('link', forceLink<GraphNode, GraphEdge>(edges).id(d => d.id).distance(120))
      .force('charge', forceManyBody().strength(-300))
      .force('center', forceCenter(options.width / 2, options.height / 2))
      .force('collide', forceCollide(40))
      .on('tick', () => {
        options.onTick([...nodes], [...edges]);
      });

    simulationRef.current = simulation;

    return () => {
      simulation.stop();
    };
  }, [nodes.length, edges.length, options.width, options.height]);

  const reheat = useCallback(() => {
    simulationRef.current?.alpha(0.3).restart();
  }, []);

  return { simulationRef, reheat };
}
