import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphSnapshot } from "../models";
import type { EdgeDto } from "../models";
import type { NodeDto } from "../models";
import { GraphNode } from "./GraphNode";
import { GraphEdge, DASH_PERIOD, EDGE_FLOW_KEYFRAME } from "./GraphEdge";
import { GraphCorridor } from "./GraphCorridor";
import { EdgePopover } from "./EdgePopover";
import { NodeDetailModal } from "./NodeDetailModal";
import { useHoverState } from "../hooks/useHoverState";
import { useZoomPan } from "../hooks/useZoomPan";
import { useEdgePicking } from "../hooks/useEdgePicking";
import { getStrategy } from "../strategies";
import { getColumnLabel, getColumnLabelScreenX } from "../helpers/columnHelpers";
import { BAR_WIDTH, buildNodeGeometries, NODE_HEIGHT, NODE_WIDTH, type NodeGeometry } from "../helpers/nodeGeometry";
import { GRAPH_ANIMATION_CSS } from "../helpers/animations";

interface TopologyCanvasProps {
    snapshot: GraphSnapshot;
    strategyId: string;
    showInactiveEdges?: boolean;
}

const CANVAS_W = 1000;
const CANVAS_H = 600;
const PAD_X = 120;
const PAD_Y = 80;

/**
 * Assign each node to a column based on longest-path from sources.
 * Column 0 = nodes with no incoming edges (entry points).
 * Column N = max(column of all sources) + 1.
 */
function assignColumns(
    nodes: NodeDto[],
    edges: EdgeDto[],
): Record<string, number> {
    const incoming = new Map<string, string[]>();
    for (const n of nodes) incoming.set(n.id, []);
    for (const e of edges) {
        incoming.get(e.targetNodeId)?.push(e.sourceNodeId);
    }

    const col: Record<string, number> = {};

    function resolve(id: string): number {
        if (id in col) return col[id];
        const sources = incoming.get(id) ?? [];
        if (sources.length === 0) {
            col[id] = 0;
            return 0;
        }
        col[id] = 0; // guard against cycles
        const minSource = Math.min(...sources.map(resolve));
        col[id] = minSource + 1;
        return col[id];
    }

    for (const n of nodes) resolve(n.id);
    return col;
}

interface ColumnInfo {
    x: number;
    nodeIds: string[];
}

/** Place nodes in columns, vertically centered per column */
function computeLayout(
    nodes: NodeDto[],
    nodeCols: Record<string, number>,
    nodeGeometries: Record<string, NodeGeometry>,
): { positions: Record<string, { x: number; y: number }>; colSpacing: number; columns: ColumnInfo[] } {
    const cols = nodeCols;
    const maxCol = Math.max(...Object.values(cols), 0);

    // Group nodes by column
    const buckets: string[][] = Array.from({ length: maxCol + 1 }, () => []);
    for (const n of nodes) buckets[cols[n.id]].push(n.id);

    const positions: Record<string, { x: number; y: number }> = {};

    const usableW = CANVAS_W - PAD_X * 2;
    const usableH = CANVAS_H - PAD_Y * 2;
    const colSpacing = maxCol > 0 ? usableW / maxCol : 0;

    const columns: ColumnInfo[] = [];

    for (let c = 0; c <= maxCol; c++) {
        const bucket = buckets[c];
        const x = PAD_X + c * colSpacing;

        columns.push({ x, nodeIds: bucket });

        const heights = bucket.map((id) => nodeGeometries[id]?.height ?? NODE_HEIGHT);
        const totalHeights = heights.reduce((sum, height) => sum + height, 0);
        const gap = bucket.length > 1 ? Math.max(18, (usableH - totalHeights) / (bucket.length - 1)) : 0;
        const contentHeight = totalHeights + gap * Math.max(0, bucket.length - 1);
        let cursor = CANVAS_H / 2 - contentHeight / 2;

        bucket.forEach((id, rowIdx) => {
            const height = heights[rowIdx];
            positions[id] = {
                x,
                y: cursor + height / 2,
            };
            cursor += height + gap;
        });
    }

    return { positions, colSpacing, columns };
}

export function TopologyCanvas({ snapshot, strategyId, showInactiveEdges = true }: TopologyCanvasProps) {
    // Render edges exactly as provided by backend snapshots.
    const normalizedEdges = snapshot.edges;

    const nodeCols = useMemo(() => assignColumns(snapshot.nodes, normalizedEdges), [snapshot.nodes, normalizedEdges]);
    const nodeGeometries = useMemo(
        () => buildNodeGeometries(snapshot.nodes, normalizedEdges, nodeCols),
        [snapshot.nodes, normalizedEdges, nodeCols],
    );
    const { positions, colSpacing, columns } = useMemo(
        () => computeLayout(snapshot.nodes, nodeCols, nodeGeometries),
        [snapshot.nodes, nodeCols, nodeGeometries],
    );

    const svgRef = useRef<SVGSVGElement>(null);

    const nodeMap = useMemo(() => {
        const m = new Map<string, NodeDto>();
        for (const n of snapshot.nodes) m.set(n.id, n);
        return m;
    }, [snapshot.nodes]);

    const activeStrategy = useMemo(() => getStrategy(strategyId), [strategyId]);

    const adjustedPositions = useMemo(
        () =>
            activeStrategy.adjustPositions
                ? activeStrategy.adjustPositions(positions, snapshot.nodes, nodeCols, nodeGeometries)
                : positions,
        [activeStrategy, positions, snapshot.nodes, nodeCols, nodeGeometries],
    );

    const { edgeItems: edgeRenderItems, corridorItems } = useMemo(
        () => activeStrategy.build(snapshot.nodes, normalizedEdges, adjustedPositions, nodeMap, nodeCols, colSpacing, nodeGeometries),
        [snapshot.nodes, normalizedEdges, adjustedPositions, nodeMap, nodeCols, colSpacing, nodeGeometries, activeStrategy],
    );

    /**
     * For each node, determine whether it has outgoing edges going RIGHT (forward)
     * or incoming edges arriving from the RIGHT (backward edges from a higher column).
     * Both hub types are rendered on the right side of the node.
     */
    const nodeHubPresence = useMemo(() => {
        if (activeStrategy.hideHubCapsules) {
            return { hasRightOut: new Set<string>(), hasRightIn: new Set<string>(), hasLeftIn: new Set<string>() };
        }
        const hasRightOut = new Set<string>();
        const hasRightIn = new Set<string>(); // same-col or backward edges → right IN hub
        const hasLeftIn = new Set<string>();  // forward edges → left IN indicator
        for (const e of normalizedEdges) {
            hasRightOut.add(e.sourceNodeId);
            const srcCol = nodeCols[e.sourceNodeId] ?? 0;
            const tgtCol = nodeCols[e.targetNodeId] ?? 0;
            if (tgtCol > srcCol) {
                hasLeftIn.add(e.targetNodeId);
            } else {
                hasRightIn.add(e.targetNodeId);
            }
        }
        return { hasRightOut, hasRightIn, hasLeftIn };
    }, [normalizedEdges, nodeCols, activeStrategy]);

    // Compute bounding box around all nodes, expanded by 70% of viewport in each direction
    const bounds = useMemo(() => {
        const rawMinX = Math.min(
            ...snapshot.nodes.map((node) => adjustedPositions[node.id].x - ((node.type === "INPUT" ? BAR_WIDTH : nodeGeometries[node.id]?.width ?? NODE_WIDTH) / 2)),
        );
        const rawMaxX = Math.max(
            ...snapshot.nodes.map((node) => adjustedPositions[node.id].x + ((node.type === "INPUT" ? BAR_WIDTH : nodeGeometries[node.id]?.width ?? NODE_WIDTH) / 2)),
        );
        const rawMinY = Math.min(
            ...snapshot.nodes.map((node) => (node.type === "INPUT" ? 0 : adjustedPositions[node.id].y - ((nodeGeometries[node.id]?.height ?? NODE_HEIGHT) / 2))),
        );
        const rawMaxY = Math.max(
            ...snapshot.nodes.map((node) => (node.type === "INPUT" ? CANVAS_H : adjustedPositions[node.id].y + ((nodeGeometries[node.id]?.height ?? NODE_HEIGHT) / 2))),
        );
        const graphW = rawMaxX - rawMinX;
        const graphH = rawMaxY - rawMinY;
        const padX = graphW * 0.7;
        const padY = graphH * 0.7;
        return {
            minX: rawMinX - padX,
            maxX: rawMaxX + padX,
            minY: rawMinY - padY,
            maxY: rawMaxY + padY,
        };
    }, [nodeGeometries, adjustedPositions, snapshot.nodes]);

    // Use custom hooks for zoom/pan and hover management
    const { zoom, pan, isPanning, handleMouseDown, handleMouseMove, handleMouseUp } = useZoomPan(
        svgRef as React.RefObject<SVGSVGElement>,
        bounds,
    );

    const {
        hoveredNodeId,
        setHoveredNodeId,
        setHoveredEdgeIds,
        clearHover,
        highlightedNodes,
        highlightedEdges,
        selectedNodeId,
        isFocusMode,
        toggleSelectedNode,
        clearSelection,
    } = useHoverState(snapshot.nodes, normalizedEdges);

    const visibleEdgeItems = useMemo(
        () => edgeRenderItems.filter((item) => showInactiveEdges || item.rps > 0),
        [edgeRenderItems, showInactiveEdges],
    );

    const { pickAt } = useEdgePicking(visibleEdgeItems, corridorItems);

    const [selectedEdge, setSelectedEdge] = useState<{
        edge: EdgeDto;
        x: number;
        y: number;
    } | null>(null);

    const [detailNodeId, setDetailNodeId] = useState<string | null>(null);

    const handleNodeClick = useCallback(
        (nodeId: string, _e: React.MouseEvent) => {
            const isDeselecting = selectedNodeId === nodeId;
            toggleSelectedNode(nodeId);
            setSelectedEdge(null);
            setDetailNodeId(isDeselecting ? null : nodeId);
        },
        [selectedNodeId, toggleSelectedNode],
    );

    const getWorldPoint = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - pan.x) / zoom,
            y: (e.clientY - rect.top - pan.y) / zoom,
        };
    };

    // Coalesce edge hover-picking to one geometric scan per animation frame and
    // skip redundant state writes when the hovered edge set has not changed.
    const pickRafRef = useRef<number | null>(null);
    const pendingWorldPointRef = useRef<{ x: number; y: number } | null>(null);
    const lastHoveredEdgeKeyRef = useRef<string | null>(null);

    useEffect(() => {
        return () => {
            if (pickRafRef.current !== null) cancelAnimationFrame(pickRafRef.current);
        };
    }, []);

    const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        handleMouseMove(e);
        if (isPanning || hoveredNodeId) {
            lastHoveredEdgeKeyRef.current = null;
            return;
        }

        pendingWorldPointRef.current = getWorldPoint(e);
        if (pickRafRef.current !== null) return;

        pickRafRef.current = requestAnimationFrame(() => {
            pickRafRef.current = null;
            const point = pendingWorldPointRef.current;
            if (!point) return;

            const picked = pickAt(point);
            const key = picked?.edgeIds.join("|") ?? null;
            if (key !== lastHoveredEdgeKeyRef.current) {
                lastHoveredEdgeKeyRef.current = key;
                setHoveredEdgeIds(picked?.edgeIds ?? null);
            }
        });
    };

    const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
        // Clicking the canvas background clears both popovers and node selection
        clearSelection();
        setSelectedEdge(null);
        setDetailNodeId(null);

        if (hoveredNodeId) return;

        const picked = pickAt(getWorldPoint(e));
        if (picked?.edge) {
            setSelectedEdge({ edge: picked.edge, x: e.clientX, y: e.clientY });
            return;
        }
    };

    const handleCanvasMouseLeave = () => {
        handleMouseUp();
        clearHover();
        lastHoveredEdgeKeyRef.current = null;
    };

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                cursor: isPanning ? "grabbing" : "grab",
            }}
        >
            <svg
                ref={svgRef}
                width="100%"
                height="100%"
                style={{ background: "#ffffff", display: "block" }}
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleCanvasMouseLeave}
            >
                {/* Flow animation keyframe defined once for all edges */}
                <style>{`@keyframes ${EDGE_FLOW_KEYFRAME} { from { stroke-dashoffset: ${DASH_PERIOD}; } to { stroke-dashoffset: 0; } }`}</style>

                {/* Entrance / change-flash keyframes for graph mutations */}
                <style>{GRAPH_ANIMATION_CSS}</style>

                {/* Dot grid pattern */}
                <defs>
                    <pattern
                        id="dot-grid"
                        width={20}
                        height={20}
                        patternUnits="userSpaceOnUse"
                        patternTransform={`translate(${pan.x * 0.5}, ${pan.y * 0.5}) scale(${1 + (zoom - 1) * 0.5})`}
                    >
                        <circle
                            cx={10}
                            cy={10}
                            r={1}
                            fill="#d1d5db"
                        />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#dot-grid)" />

                {/* Zoomable / pannable layer */}
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {/* Gray shade outside the bounding box */}
                    <defs>
                        <mask id="bounds-mask">
                            <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="white" />
                            <rect
                                x={bounds.minX}
                                y={bounds.minY}
                                width={bounds.maxX - bounds.minX}
                                height={bounds.maxY - bounds.minY}
                                rx={16}
                                ry={16}
                                fill="black"
                            />
                        </mask>
                    </defs>
                    <rect
                        x={-1e5}
                        y={-1e5}
                        width={2e5}
                        height={2e5}
                        fill="#f3f4f6"
                        mask="url(#bounds-mask)"
                    />

                    {/* Dashed separator lines between columns */}
                    {columns.map((col, idx) => {
                        if (idx === 0) return null; // no line before first column
                        const prevX = columns[idx - 1].x;
                        const midX = (prevX + col.x) / 2;

                        return (
                            <line
                                key={`col-sep-${idx}`}
                                x1={midX}
                                y1={bounds.minY}
                                x2={midX}
                                y2={bounds.maxY}
                                stroke="#d1d5db"
                                strokeWidth={2}
                                strokeDasharray="8 5"
                                opacity={0.8}
                            />
                        );
                    })}

                    {/* Corridors render behind stubs/branches */}
                    {corridorItems.map((corridor) => {
                        const isHighlighted = corridor.edgeIds.some((id) => highlightedEdges.has(id));
                        return (
                            <GraphCorridor
                                key={corridor.id}
                                corridor={corridor}
                                highlighted={isHighlighted}
                            />
                        );
                    })}

                    {/* Edge stubs and branches render above corridors, below nodes */}
                    {visibleEdgeItems.map((item) => {
                        const isHighlighted = item.edgeIds.some((id) => highlightedEdges.has(id));
                        return (
                            <GraphEdge
                                key={item.id}
                                routeId={item.id}
                                path={item.path}
                                end={item.end}
                                color={item.color}
                                width={item.width}
                                rps={item.rps}
                                showEndDot={item.showEndDot}
                                hubTint={item.hubTint}
                                highlighted={isHighlighted}
                            />
                        );
                    })}

                    {/* Nodes */}
                    {snapshot.nodes.map((node) => (
                        <GraphNode
                            key={node.id}
                            node={node}
                            position={adjustedPositions[node.id]}
                            size={nodeGeometries[node.id]}
                            highlighted={highlightedNodes.has(node.id)}
                            selected={selectedNodeId === node.id}
                            hasRightOut={nodeHubPresence.hasRightOut.has(node.id)}
                            hasRightIn={nodeHubPresence.hasRightIn.has(node.id)}
                            hasLeftIn={nodeHubPresence.hasLeftIn.has(node.id)}
                            canvasHeight={CANVAS_H}
                            onMouseEnter={setHoveredNodeId}
                            onMouseLeave={clearHover}
                            onClick={handleNodeClick}
                        />
                    ))}
                </g>
            </svg>

            {/* Column labels pinned to top of screen, horizontally following columns */}
            {columns.map((col, idx) => {
                const screenX = getColumnLabelScreenX(col, pan, zoom);
                const label = getColumnLabel(col, idx, nodeMap);

                return (
                    <div
                        key={`col-label-${idx}`}
                        style={{
                            position: "absolute",
                            top: 12,
                            left: screenX,
                            transform: "translateX(-50%)",
                            zIndex: 5,
                            fontSize: 14,
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontWeight: 700,
                            color: "#6b7280",
                            textTransform: "uppercase",
                            letterSpacing: 1.5,
                            pointerEvents: "none",
                            userSelect: "none",
                            whiteSpace: "nowrap",
                            background: "rgba(255,255,255,0.8)",
                            padding: "2px 8px",
                            borderRadius: 4,
                        }}
                    >
                        {label}
                    </div>
                );
            })}

            {selectedEdge && (
                <EdgePopover
                    edge={selectedEdge.edge}
                    x={selectedEdge.x}
                    y={selectedEdge.y}
                    onClose={() => setSelectedEdge(null)}
                />
            )}

            {detailNodeId && (() => {
                const detailNode = nodeMap.get(detailNodeId);
                if (!detailNode) return null;
                const outgoing = normalizedEdges.filter((e) => e.sourceNodeId === detailNodeId);
                const incoming = normalizedEdges.filter((e) => e.targetNodeId === detailNodeId);
                return (
                    <NodeDetailModal
                        node={detailNode}
                        outgoingEdges={outgoing}
                        incomingEdges={incoming}
                        nodeMap={nodeMap}
                        namespace={snapshot.namespace}
                        onClose={() => { clearSelection(); setDetailNodeId(null); }}
                    />
                );
            })()}

            {/* Focus mode indicator – shown when a node is selected */}
            {isFocusMode && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 16,
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: "#1e40af",
                        color: "#ffffff",
                        fontSize: 13,
                        fontFamily: "Inter, system-ui, sans-serif",
                        fontWeight: 600,
                        padding: "6px 14px",
                        borderRadius: 20,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                        pointerEvents: "auto",
                        userSelect: "none",
                    }}
                >
                    <span>Focus: {snapshot.nodes.find((n) => n.id === selectedNodeId)?.name ?? selectedNodeId}</span>
                    <button
                        onClick={clearSelection}
                        style={{
                            background: "rgba(255,255,255,0.2)",
                            border: "none",
                            borderRadius: "50%",
                            color: "#ffffff",
                            cursor: "pointer",
                            width: 20,
                            height: 20,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 14,
                            lineHeight: 1,
                            padding: 0,
                        }}
                        title="Exit focus mode"
                    >
                        ×
                    </button>
                </div>
            )}
        </div>
    );
}
