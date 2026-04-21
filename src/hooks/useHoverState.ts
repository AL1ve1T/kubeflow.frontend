import { useMemo, useState } from "react";
import type { EdgeDto, NodeDto } from "../models";

interface AdjacencyInfo {
    edgeIds: Set<string>;
    nodeIds: Set<string>;
}

interface Adjacency {
    byNode: Map<string, AdjacencyInfo>;
    byEdge: Map<string, { sourceNodeId: string; targetNodeId: string }>;
}

/**
 * Build adjacency maps for fast node/edge relationship lookups
 */
function buildAdjacency(nodes: NodeDto[], edges: EdgeDto[]): Adjacency {
    const byNode = new Map<string, AdjacencyInfo>();
    const byEdge = new Map<string, { sourceNodeId: string; targetNodeId: string }>();

    for (const n of nodes) {
        byNode.set(n.id, { edgeIds: new Set(), nodeIds: new Set() });
    }
    for (const e of edges) {
        byEdge.set(e.id, { sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId });
        byNode.get(e.sourceNodeId)?.edgeIds.add(e.id);
        byNode.get(e.sourceNodeId)?.nodeIds.add(e.targetNodeId);
        byNode.get(e.targetNodeId)?.edgeIds.add(e.id);
        byNode.get(e.targetNodeId)?.nodeIds.add(e.sourceNodeId);
    }
    return { byNode, byEdge };
}

/**
 * Compute highlight sets from hover state
 */
function computeHighlights(
    adjacency: Adjacency,
    hoveredNodeId: string | null,
    hoveredEdgeId: string | null,
) {
    const highlightedNodes = new Set<string>();
    const highlightedEdges = new Set<string>();

    if (hoveredNodeId) {
        highlightedNodes.add(hoveredNodeId);
        const adj = adjacency.byNode.get(hoveredNodeId);
        if (adj) {
            adj.nodeIds.forEach((id) => highlightedNodes.add(id));
            adj.edgeIds.forEach((id) => highlightedEdges.add(id));
        }
    } else if (hoveredEdgeId) {
        highlightedEdges.add(hoveredEdgeId);
        const endpoints = adjacency.byEdge.get(hoveredEdgeId);
        if (endpoints) {
            highlightedNodes.add(endpoints.sourceNodeId);
            highlightedNodes.add(endpoints.targetNodeId);
        }
    }

    return { highlightedNodes, highlightedEdges };
}

/**
 * Hook for managing hover state and highlight computation
 */
export function useHoverState(nodes: NodeDto[], edges: EdgeDto[]) {
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

    const adjacency = useMemo(() => buildAdjacency(nodes, edges), [nodes, edges]);

    const { highlightedNodes, highlightedEdges } = useMemo(
        () => computeHighlights(adjacency, hoveredNodeId, hoveredEdgeId),
        [adjacency, hoveredNodeId, hoveredEdgeId],
    );

    const clearHover = () => {
        setHoveredNodeId(null);
        setHoveredEdgeId(null);
    };

    return {
        hoveredNodeId,
        hoveredEdgeId,
        setHoveredNodeId,
        setHoveredEdgeId,
        clearHover,
        highlightedNodes,
        highlightedEdges,
    };
}
