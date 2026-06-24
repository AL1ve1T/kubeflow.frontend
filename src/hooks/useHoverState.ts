import { useCallback, useMemo, useState } from "react";
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
    hoveredEdgeIds: string[] | null,
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
    } else if (hoveredEdgeIds && hoveredEdgeIds.length > 0) {
        for (const edgeId of hoveredEdgeIds) {
            highlightedEdges.add(edgeId);
            const endpoints = adjacency.byEdge.get(edgeId);
            if (endpoints) {
                highlightedNodes.add(endpoints.sourceNodeId);
                highlightedNodes.add(endpoints.targetNodeId);
            }
        }
    }

    return { highlightedNodes, highlightedEdges };
}

/**
 * Compute the 1-hop neighborhood (nodes + edges) of a selected node.
 * Used for Focus Mode to dim everything outside the selection.
 */
function computeNeighborhood(adjacency: Adjacency, selectedNodeId: string | null) {
    if (!selectedNodeId) {
        return { focusedNodes: new Set<string>(), focusedEdges: new Set<string>() };
    }
    const focusedNodes = new Set<string>([selectedNodeId]);
    const focusedEdges = new Set<string>();
    const adj = adjacency.byNode.get(selectedNodeId);
    if (adj) {
        adj.nodeIds.forEach((id) => focusedNodes.add(id));
        adj.edgeIds.forEach((id) => focusedEdges.add(id));
    }
    return { focusedNodes, focusedEdges };
}

/**
 * Hook for managing hover state, node selection, and highlight computation.
 *
 * Focus mode is active when a node is selected via click. In Focus mode:
 *   - only the selected node and its 1-hop neighbours are fully visible
 *   - all other edges are dimmed
 */
export function useHoverState(nodes: NodeDto[], edges: EdgeDto[]) {
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredEdgeIds, setHoveredEdgeIds] = useState<string[] | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const adjacency = useMemo(() => buildAdjacency(nodes, edges), [nodes, edges]);

    const { highlightedNodes, highlightedEdges } = useMemo(
        () => computeHighlights(adjacency, hoveredNodeId, hoveredEdgeIds),
        [adjacency, hoveredNodeId, hoveredEdgeIds],
    );

    const isFocusMode = selectedNodeId !== null;

    const { focusedNodes, focusedEdges } = useMemo(
        () => computeNeighborhood(adjacency, selectedNodeId),
        [adjacency, selectedNodeId],
    );

    /** Toggle Focus mode: click the same node again to deselect */
    const toggleSelectedNode = useCallback((nodeId: string) => {
        setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
    }, []);

    const clearSelection = useCallback(() => setSelectedNodeId(null), []);

    const setHoveredEdgeId = useCallback((edgeId: string) => {
        setHoveredEdgeIds([edgeId]);
    }, []);

    const clearHover = useCallback(() => {
        setHoveredNodeId(null);
        setHoveredEdgeIds(null);
    }, []);

    return {
        hoveredNodeId,
        hoveredEdgeIds,
        setHoveredNodeId,
        setHoveredEdgeId,
        setHoveredEdgeIds,
        clearHover,
        highlightedNodes,
        highlightedEdges,
        selectedNodeId,
        isFocusMode,
        focusedNodes,
        focusedEdges,
        toggleSelectedNode,
        clearSelection,
    };
}
