import { useMemo, useRef, useState } from "react";
import type { GraphSnapshot } from "../models";
import type { EdgeDto } from "../models";
import type { NodeDto } from "../models";
import { GraphNode } from "./GraphNode";
import { GraphEdge } from "./GraphEdge";
import { EdgePopover } from "./EdgePopover";
import { useHoverState } from "../hooks/useHoverState";
import { useZoomPan } from "../hooks/useZoomPan";
import { computeEdgePositions } from "../helpers/edgeHelpers";
import { getColumnLabel, getColumnLabelScreenX } from "../helpers/columnHelpers";

interface TopologyCanvasProps {
    snapshot: GraphSnapshot;
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
    edges: EdgeDto[],
): { positions: Record<string, { x: number; y: number }>; colSpacing: number; columns: ColumnInfo[] } {
    const cols = assignColumns(nodes, edges);
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
        const rowSpacing = bucket.length > 1 ? usableH / (bucket.length - 1) : 0;
        const x = PAD_X + c * colSpacing;

        columns.push({ x, nodeIds: bucket });

        bucket.forEach((id, rowIdx) => {
            positions[id] = {
                x,
                y:
                    bucket.length === 1
                        ? CANVAS_H / 2
                        : PAD_Y + rowIdx * rowSpacing,
            };
        });
    }

    return { positions, colSpacing, columns };
}

export function TopologyCanvas({ snapshot }: TopologyCanvasProps) {
    const { positions, colSpacing, columns } = computeLayout(snapshot.nodes, snapshot.edges);

    const svgRef = useRef<SVGSVGElement>(null);

    const nodeMap = useMemo(() => {
        const m = new Map<string, NodeDto>();
        for (const n of snapshot.nodes) m.set(n.id, n);
        return m;
    }, [snapshot.nodes]);

    // Compute bounding box around all nodes, expanded by 70% of viewport in each direction
    const bounds = useMemo(() => {
        const xs = Object.values(positions).map((p) => p.x);
        const ys = Object.values(positions).map((p) => p.y);
        const NODE_WIDTH = 160;
        const NODE_HEIGHT = 56;
        const rawMinX = Math.min(...xs) - NODE_WIDTH / 2;
        const rawMaxX = Math.max(...xs) + NODE_WIDTH / 2;
        const rawMinY = Math.min(...ys) - NODE_HEIGHT / 2;
        const rawMaxY = Math.max(...ys) + NODE_HEIGHT / 2;
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
    }, [positions]);

    // Use custom hooks for zoom/pan and hover management
    const { zoom, pan, isPanning, handleMouseDown, handleMouseMove, handleMouseUp } = useZoomPan(
        svgRef as React.RefObject<SVGSVGElement>,
        bounds,
    );

    const {
        setHoveredNodeId,
        setHoveredEdgeId,
        clearHover,
        highlightedNodes,
        highlightedEdges,
    } = useHoverState(snapshot.nodes, snapshot.edges);

    const [selectedEdge, setSelectedEdge] = useState<{
        edge: EdgeDto;
        x: number;
        y: number;
    } | null>(null);

    const handleEdgeClick = (edge: EdgeDto, screenX: number, screenY: number) => {
        setSelectedEdge({ edge, x: screenX, y: screenY });
    };

    const handleBackgroundClick = () => {
        setSelectedEdge(null);
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
                onClick={handleBackgroundClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
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

                    {/* Edges first so they render behind nodes */}
                    {snapshot.edges.map((edge) => {
                        const { sourcePos, targetPos, isSameColumn } = computeEdgePositions(
                            edge,
                            positions,
                            nodeMap,
                        );

                        return (
                            <GraphEdge
                                key={edge.id}
                                edge={edge}
                                sourcePos={sourcePos}
                                targetPos={targetPos}
                                sameColumn={isSameColumn}
                                colSpacing={colSpacing}
                                highlighted={highlightedEdges.has(edge.id)}
                                onMouseEnter={setHoveredEdgeId}
                                onMouseLeave={clearHover}
                                onClick={handleEdgeClick}
                            />
                        );
                    })}

                    {/* Nodes */}
                    {snapshot.nodes.map((node) => (
                        <GraphNode
                            key={node.id}
                            node={node}
                            position={positions[node.id]}
                            highlighted={highlightedNodes.has(node.id)}
                            canvasHeight={CANVAS_H}
                            onMouseEnter={setHoveredNodeId}
                            onMouseLeave={clearHover}
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
        </div>
    );
}
