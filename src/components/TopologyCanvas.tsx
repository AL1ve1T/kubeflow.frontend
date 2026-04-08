import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphSnapshot } from "../models";
import type { EdgeDto } from "../models";
import type { NodeDto } from "../models";
import { GraphNode, NODE_WIDTH, NODE_HEIGHT, BAR_WIDTH } from "./GraphNode";
import { NodeType } from "../models";
import { GraphEdge } from "./GraphEdge";
import { EdgePopover } from "./EdgePopover";

interface TopologyCanvasProps {
    snapshot: GraphSnapshot;
}

const CANVAS_W = 1000;
const CANVAS_H = 600;
const PAD_X = 120;
const PAD_Y = 80;

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const DOT_SPACING = 20;
const DOT_RADIUS = 1;
const PAN_MARGIN = 200; // px of slack beyond the node bounding box

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

/** Compute the point where a line from `center` toward `target` exits the rectangle */
function rectIntersection(
    center: { x: number; y: number },
    target: { x: number; y: number },
    halfW: number,
    halfH: number,
) {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (dx === 0 && dy === 0) return { ...center };

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Which edge is hit first?
    const scaleX = halfW / (absDx || 1);
    const scaleY = halfH / (absDy || 1);
    const t = Math.min(scaleX, scaleY);

    return {
        x: center.x + dx * t,
        y: center.y + dy * t,
    };
}

export function TopologyCanvas({ snapshot }: TopologyCanvasProps) {
    const { positions, colSpacing, columns } = computeLayout(snapshot.nodes, snapshot.edges);
    const halfW = NODE_WIDTH / 2;
    const halfH = NODE_HEIGHT / 2;

    const nodeMap = useMemo(() => {
        const m = new Map<string, NodeDto>();
        for (const n of snapshot.nodes) m.set(n.id, n);
        return m;
    }, [snapshot.nodes]);

    const svgRef = useRef<SVGSVGElement>(null);

    // Compute bounding box around all nodes, expanded by 70% of viewport in each direction
    const bounds = useMemo(() => {
        const xs = Object.values(positions).map((p) => p.x);
        const ys = Object.values(positions).map((p) => p.y);
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

    /** Clamp pan so the viewport stays within PAN_MARGIN of the node bounding box */
    const clampPan = useCallback(
        (p: { x: number; y: number }, z: number) => {
            const svg = svgRef.current;
            if (!svg) return p;
            const rect = svg.getBoundingClientRect();
            const vw = rect.width;
            const vh = rect.height;

            // In screen coords, the graph area spans:
            //   left  edge of nodes: pan.x + bounds.minX * z
            //   right edge of nodes: pan.x + bounds.maxX * z
            // We want at least some part of the graph visible, with PAN_MARGIN slack.
            const minPanX = vw - (bounds.maxX * z) - PAN_MARGIN;
            const maxPanX = -(bounds.minX * z) + PAN_MARGIN;
            const minPanY = vh - (bounds.maxY * z) - PAN_MARGIN;
            const maxPanY = -(bounds.minY * z) + PAN_MARGIN;

            return {
                x: Math.min(maxPanX, Math.max(minPanX, p.x)),
                y: Math.min(maxPanY, Math.max(minPanY, p.y)),
            };
        },
        [bounds],
    );

    // Zoom & pan state
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

    const [selectedEdge, setSelectedEdge] = useState<{
        edge: EdgeDto;
        x: number;
        y: number;
    } | null>(null);

    // Hover state: either a hovered node id or a hovered edge id
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

    // Pre-compute adjacency for fast lookup
    const adjacency = useMemo(() => {
        const byNode = new Map<string, { edgeIds: Set<string>; nodeIds: Set<string> }>();
        const byEdge = new Map<string, { sourceNodeId: string; targetNodeId: string }>();

        for (const n of snapshot.nodes) {
            byNode.set(n.id, { edgeIds: new Set(), nodeIds: new Set() });
        }
        for (const e of snapshot.edges) {
            byEdge.set(e.id, { sourceNodeId: e.sourceNodeId, targetNodeId: e.targetNodeId });
            byNode.get(e.sourceNodeId)?.edgeIds.add(e.id);
            byNode.get(e.sourceNodeId)?.nodeIds.add(e.targetNodeId);
            byNode.get(e.targetNodeId)?.edgeIds.add(e.id);
            byNode.get(e.targetNodeId)?.nodeIds.add(e.sourceNodeId);
        }
        return { byNode, byEdge };
    }, [snapshot]);

    // Compute highlight sets
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

    const clearHover = () => {
        setHoveredNodeId(null);
        setHoveredEdgeId(null);
    };

    const handleEdgeClick = (edge: EdgeDto, screenX: number, screenY: number) => {
        setSelectedEdge({ edge, x: screenX, y: screenY });
    };

    const handleBackgroundClick = () => {
        setSelectedEdge(null);
    };

    // Zoom toward cursor (only when Ctrl is held)
    // Use a native non-passive listener so preventDefault() actually blocks browser scroll/zoom
    const zoomState = useRef({ zoom, pan });
    zoomState.current = { zoom, pan };

    const clampRef = useRef(clampPan);
    clampRef.current = clampPan;

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return;
            e.preventDefault();

            const rect = svg.getBoundingClientRect();
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;

            const { zoom: z, pan: p } = zoomState.current;
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
            const ratio = newZoom / z;

            const rawPan = {
                x: cursorX - ratio * (cursorX - p.x),
                y: cursorY - ratio * (cursorY - p.y),
            };
            setPan(clampRef.current(rawPan, newZoom));
            setZoom(newZoom);
        };

        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => svg.removeEventListener("wheel", onWheel);
    }, []);

    // Pan with mouse drag
    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0) return;
            setIsPanning(true);
            panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        },
        [pan],
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isPanning) return;
            const rawPan = {
                x: panStart.current.panX + (e.clientX - panStart.current.x),
                y: panStart.current.panY + (e.clientY - panStart.current.y),
            };
            setPan(clampPan(rawPan, zoom));
        },
        [isPanning, clampPan, zoom],
    );

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

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
                        width={DOT_SPACING}
                        height={DOT_SPACING}
                        patternUnits="userSpaceOnUse"
                        patternTransform={`translate(${pan.x * 0.5}, ${pan.y * 0.5}) scale(${1 + (zoom - 1) * 0.5})`}
                    >
                        <circle
                            cx={DOT_SPACING / 2}
                            cy={DOT_SPACING / 2}
                            r={DOT_RADIUS}
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
                        const srcFull = positions[edge.sourceNodeId];
                        const tgtFull = positions[edge.targetNodeId];
                        if (!srcFull || !tgtFull) return null;

                        const srcNode = nodeMap.get(edge.sourceNodeId);
                        const tgtNode = nodeMap.get(edge.targetNodeId);
                        const srcIsBar = srcNode?.type === NodeType.EXTERNAL;
                        const tgtIsBar = tgtNode?.type === NodeType.EXTERNAL;

                        const srcHalfW = srcIsBar ? BAR_WIDTH / 2 : halfW;
                        const srcHalfH = srcIsBar ? CANVAS_H / 2 : halfH;
                        const tgtHalfW = tgtIsBar ? BAR_WIDTH / 2 : halfW;
                        const tgtHalfH = tgtIsBar ? CANVAS_H / 2 : halfH;

                        // Use center of canvas for bar nodes
                        const srcCenter = srcIsBar ? { x: srcFull.x, y: CANVAS_H / 2 } : srcFull;
                        const tgtCenter = tgtIsBar ? { x: tgtFull.x, y: CANVAS_H / 2 } : tgtFull;

                        const isSameColumn = Math.abs(srcFull.x - tgtFull.x) < 1;

                        // For same-column edges, the line exits/enters from the right side of the box
                        const curveTarget = isSameColumn
                            ? { x: srcFull.x + halfW + 10, y: (srcFull.y + tgtFull.y) / 2 }
                            : tgtCenter;
                        const curveSource = isSameColumn
                            ? { x: tgtFull.x + halfW + 10, y: (srcFull.y + tgtFull.y) / 2 }
                            : srcCenter;

                        const src = rectIntersection(srcCenter, curveTarget, srcHalfW, srcHalfH);
                        const tgt = rectIntersection(tgtCenter, curveSource, tgtHalfW, tgtHalfH);

                        return (
                            <GraphEdge
                                key={edge.id}
                                edge={edge}
                                sourcePos={src}
                                targetPos={tgt}
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
                const screenX = pan.x + col.x * zoom;
                const isExternal = col.nodeIds.every((id) => nodeMap.get(id)?.type === NodeType.EXTERNAL);
                const label = isExternal ? "Ingress" : `Layer ${idx}`;

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
