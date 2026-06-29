import { memo } from "react";
import type { NodeDto, PodDto, PodPhase } from "../models";
import { NodeType } from "../models";
import { useChangeFlash } from "../hooks/useChangeFlash";
import { KF_NODE_APPEAR, KF_POD_APPEAR, KF_STATUS_FLASH } from "../helpers/animations";
import {
    BAR_WIDTH,
    BORDER_RADIUS,
    HUB_WIDTH,
    NODE_HEADER_H,
    NODE_HEIGHT,
    NODE_WIDTH,
    POD_AREA_PAD,
    POD_CARD_GAP,
    POD_CARD_H,
} from "../helpers/nodeGeometry";

type HealthState = "healthy" | "degraded" | "dead" | "neutral";

const HEALTH_COLORS: Record<HealthState, { border: string; glow: string } | null> = {
    healthy: { border: "#22c55e", glow: "#22c55e" },
    degraded: { border: "#f97316", glow: "#f97316" },
    dead: { border: "#ef4444", glow: "#ef4444" },
    neutral: null,
};

const POD_PHASE_COLOR: Record<PodPhase, string> = {
    RUNNING: "#22c55e",
    PENDING: "#eab308",
    NOT_READY: "#f97316",
    CRASH_LOOP: "#ef4444",
    FAILED: "#ef4444",
    UNKNOWN: "#9ca3af",
};

function utilBarColor(v: number): string {
    if (v >= 0.9) return "#ef4444";
    if (v >= 0.75) return "#f97316";
    if (v >= 0.5) return "#eab308";
    return "#22c55e";
}

function getHealthState(node: NodeDto): HealthState {
    const phase = node.podPhase;
    if (phase === "FAILED" || phase === "CRASH_LOOP") return "dead";
    if (phase === "NOT_READY" || phase === "PENDING") return "degraded";
    if (phase === "RUNNING") return "healthy";
    return "neutral";
}

/** Small red X badge rendered at a hub connection point */
function FaultBadge({ cx, cy }: { cx: number; cy: number }) {
    return (
        <g style={{ pointerEvents: "none" }}>
            <circle cx={cx} cy={cy} r={7} fill="#ef4444" />
            <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                fontWeight={700}
                fontFamily="Inter, system-ui, sans-serif"
                fill="white"
            >
                ✕
            </text>
        </g>
    );
}

function truncateMid(name: string, max: number): string {
    if (name.length <= max) return name;
    const keep = Math.floor((max - 1) / 2);
    return `${name.slice(0, keep)}…${name.slice(name.length - keep)}`;
}

/** A pod rendered as a smaller version of the node, with its name + CPU/RAM. */
function PodMiniCard({ pod, x, y, width }: { pod: PodDto; x: number; y: number; width: number }) {
    const phaseColor = POD_PHASE_COLOR[pod.podPhase];
    const labelW = 24;          // room for "CPU"/"RAM" label
    const valW = 26;            // room for the percentage text
    const barX = x + 8 + labelW;
    const barW = Math.max(10, width - 16 - labelW - valW);

    // Replay a brief ring pulse whenever the pod's phase (status) changes.
    const phaseFlashKey = useChangeFlash(pod.podPhase);

    function bar(rowY: number, label: string, value: number) {
        const has = value > 0;
        const pct = Math.round(value * 100);
        const fillW = has ? (barW * Math.min(pct, 100)) / 100 : 0;
        return (
            <g>
                <text x={x + 8} y={rowY} dominantBaseline="central" textAnchor="start"
                    fontSize={7} fontFamily="Inter, system-ui, sans-serif" fill="#9ca3af">{label}</text>
                <rect x={barX} y={rowY - 2.5} width={barW} height={5} rx={2} ry={2} fill="#e5e7eb" />
                {has && (
                    <rect x={barX} y={rowY - 2.5} width={fillW} height={5} rx={2} ry={2} fill={utilBarColor(value)} />
                )}
                <text x={x + width - 8} y={rowY} dominantBaseline="central" textAnchor="end"
                    fontSize={7} fontFamily="Inter, system-ui, sans-serif"
                    fill={has ? "#374151" : "#9ca3af"}>{has ? `${pct}%` : "—"}</text>
            </g>
        );
    }

    return (
        <g style={{ pointerEvents: "none", animation: `${KF_POD_APPEAR} 0.4s ease-out` }}>
            <rect
                x={x}
                y={y}
                width={width}
                height={POD_CARD_H}
                rx={6}
                ry={6}
                fill="#f9fafb"
                stroke={phaseColor}
                strokeOpacity={0.5}
                strokeWidth={1}
            />
            {/* Pod name + phase dot */}
            <circle cx={x + 9} cy={y + 9} r={3} fill={phaseColor} />
            <text x={x + 16} y={y + 9} dominantBaseline="central" textAnchor="start"
                fontSize={8} fontFamily="Inter, system-ui, sans-serif" fontWeight={600} fill="#374151">
                {truncateMid(pod.podName, 22)}
            </text>
            {/* CPU + RAM mini bars */}
            {bar(y + 20, "CPU", pod.cpuUtilization)}
            {bar(y + 28, "RAM", pod.memoryUtilization)}

            {/* Phase-change pulse */}
            {phaseFlashKey > 0 && (
                <rect
                    key={phaseFlashKey}
                    x={x - 1.5}
                    y={y - 1.5}
                    width={width + 3}
                    height={POD_CARD_H + 3}
                    rx={7}
                    ry={7}
                    fill="none"
                    stroke={phaseColor}
                    strokeWidth={2}
                    style={{ transformBox: "fill-box", transformOrigin: "center", animation: `${KF_STATUS_FLASH} 0.6s ease-out` }}
                />
            )}
        </g>
    );
}

interface Position {
    x: number;
    y: number;
}

interface NodeSize {
    width: number;
    height: number;
}

interface GraphNodeProps {
    node: NodeDto;
    position: Position;
    size?: NodeSize;
    highlighted?: boolean;
    selected?: boolean;
    /** Node has at least one outgoing edge (right side OUT hub) */
    hasRightOut?: boolean;
    /** Node receives same-column or backward edges (right side IN hub) */
    hasRightIn?: boolean;
    /** Node receives forward edges arriving at the left side */
    hasLeftIn?: boolean;
    canvasHeight?: number;
    onMouseEnter: (nodeId: string) => void;
    onMouseLeave: () => void;
    onClick?: (nodeId: string, e: React.MouseEvent) => void;
}

export const GraphNode = memo(GraphNodeImpl);

function GraphNodeImpl({ node, position, size, highlighted, selected, hasRightOut, hasRightIn, hasLeftIn, canvasHeight, onMouseEnter, onMouseLeave, onClick }: GraphNodeProps) {
    const isBar = node.type === NodeType.INPUT;
    const nodeWidth = size?.width ?? NODE_WIDTH;
    const nodeHeight = size?.height ?? NODE_HEIGHT;
    const health = isBar ? "neutral" : getHealthState(node);
    const healthColors = HEALTH_COLORS[health];
    const fault = health === "dead" || health === "degraded";

    // Replay a brief ring pulse whenever the node's roll-up health status changes.
    const statusFlashKey = useChangeFlash(health);

    // Hub port geometry – capsule shapes straddling the right edge of the node
    const portW = HUB_WIDTH;
    const portH = 28;
    const portX = nodeWidth / 2 - 4;   // 4px inset inside node right border
    const portGap = 5;
    const totalPortH = (hasRightOut && hasRightIn) ? portH * 2 + portGap : portH;
    const portBaseY = -totalPortH / 2;
    const portInY = (hasRightOut && hasRightIn) ? portBaseY + portH + portGap : portBaseY;

    // Center of each right hub capsule (for icon placement)
    const hubCX = portX + portW / 2;
    const outHubCY = portBaseY + portH / 2;
    const inHubCY = portInY + portH / 2;

    // Left incoming hub geometry – mirrors right side, single capsule centred on node
    const leftPortX = -(nodeWidth / 2) - portW + 4; // tip (connection point) at leftPortX
    const leftHubCX = leftPortX + portW / 2;

    // Health dot colour for the workload roll-up (driven by worst pod phase).
    const healthDot = healthColors ? healthColors.border : "#9ca3af";

    // Inner pod mini-cards ("smaller version of the node"), sorted by name.
    const pods = [...(node.pods ?? [])].sort((a, b) => a.podName.localeCompare(b.podName));
    const hasPods = pods.length > 0;
    const podCardW = nodeWidth - POD_AREA_PAD * 2;
    const podsLeft = -nodeWidth / 2 + POD_AREA_PAD;
    const podsTop = -nodeHeight / 2 + NODE_HEADER_H;
    const headerY = hasPods ? -nodeHeight / 2 + 13 : -3;

    if (isBar) {
        const totalH = canvasHeight ?? 600;
        // Nodes whose name contains "internal" occupy the top half (light blue).
        // All other INPUT nodes occupy the bottom half (light orange).
        const isInternalHalf = node.name.toLowerCase().includes("internal");
        const barY = isInternalHalf ? 0 : totalH / 2;
        const barH = totalH / 2;
        const fill = isInternalHalf ? "#dbeafe" : "#fed7aa";
        const stroke = isInternalHalf ? "#93c5fd" : "#fb923c";

        return (
            <g
                transform={`translate(${position.x}, 0)`}
                onMouseEnter={() => onMouseEnter(node.id)}
                onMouseLeave={onMouseLeave}
                onClick={(e) => { e.stopPropagation(); onClick?.(node.id, e); }}
                style={{ cursor: onClick ? "pointer" : "default" }}
            >
                {highlighted && (
                    <rect
                        x={-BAR_WIDTH / 2 - 3}
                        y={barY - 3}
                        width={BAR_WIDTH + 6}
                        height={barH + 6}
                        rx={8}
                        ry={8}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        opacity={0.45}
                    />
                )}
                <rect
                    x={-BAR_WIDTH / 2}
                    y={barY}
                    width={BAR_WIDTH}
                    height={barH}
                    rx={6}
                    ry={6}
                    fill={fill}
                    stroke={highlighted ? "#3b82f6" : stroke}
                    strokeWidth={highlighted ? 2 : 1}
                />
                <text
                    x={0}
                    y={barY + barH / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontFamily="Inter, system-ui, sans-serif"
                    fontWeight={600}
                    fill="#6b7280"
                    style={{ textTransform: "uppercase", letterSpacing: 2, pointerEvents: "none" }}
                    transform={`rotate(-90, 0, ${barY + barH / 2})`}
                >
                    {node.name}
                </text>
            </g>
        );
    }

    return (
        <g
            transform={`translate(${position.x}, ${position.y})`}
            onMouseEnter={() => onMouseEnter(node.id)}
            onMouseLeave={onMouseLeave}
            onClick={(e) => { e.stopPropagation(); onClick?.(node.id, e); }}
            style={{ cursor: onClick ? "pointer" : "default" }}
        >
            <g style={{ transformBox: "fill-box", transformOrigin: "center", animation: `${KF_NODE_APPEAR} 0.45s ease-out` }}>
                {/* Selected ring – shown when this node is the focus */}
                {selected && (
                    <rect
                        x={-nodeWidth / 2 - 6}
                        y={-nodeHeight / 2 - 6}
                        width={nodeWidth + 12}
                        height={nodeHeight + 12}
                        rx={BORDER_RADIUS + 4}
                        ry={BORDER_RADIUS + 4}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        opacity={0.8}
                    />
                )}
                {highlighted && (
                    <rect
                        x={-nodeWidth / 2 - 3}
                        y={-nodeHeight / 2 - 3}
                        width={nodeWidth + 6}
                        height={nodeHeight + 6}
                        rx={BORDER_RADIUS + 2}
                        ry={BORDER_RADIUS + 2}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        opacity={0.45}
                    />
                )}
                <rect
                    x={-nodeWidth / 2}
                    y={-nodeHeight / 2}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx={BORDER_RADIUS}
                    ry={BORDER_RADIUS}
                    fill="#ffffff"
                    stroke={healthColors ? healthColors.border : highlighted ? "#3b82f6" : "#d1d5db"}
                    strokeWidth={healthColors ? 2.5 : highlighted ? 2 : 1.5}
                />
                {/* Health glow ring */}
                {healthColors && (
                    <rect
                        x={-nodeWidth / 2 - 4}
                        y={-nodeHeight / 2 - 4}
                        width={nodeWidth + 8}
                        height={nodeHeight + 8}
                        rx={BORDER_RADIUS + 3}
                        ry={BORDER_RADIUS + 3}
                        fill="none"
                        stroke={healthColors.glow}
                        strokeWidth={1.5}
                        opacity={0.3}
                    />
                )}
                {/* OUT hub – amber capsule on the right edge, outgoing forward edges */}
                {hasRightOut && (
                    <g>
                        <rect
                            x={portX}
                            y={portBaseY}
                            width={portW}
                            height={portH}
                            rx={portW / 2}
                            ry={portW / 2}
                            fill="#f59e0b"
                            stroke="#d97706"
                            strokeWidth={1}
                        />
                        <path
                            d={`M ${hubCX - 4} ${outHubCY - 5} L ${hubCX + 5} ${outHubCY} L ${hubCX - 4} ${outHubCY + 5} Z`}
                            fill="white"
                            opacity={0.9}
                            style={{ pointerEvents: "none" }}
                        />
                        {fault && <FaultBadge cx={portX + portW} cy={outHubCY} />}
                    </g>
                )}
                {/* IN hub – indigo capsule on the right edge, backward / same-column incoming edges */}
                {hasRightIn && (
                    <g>
                        <rect
                            x={portX}
                            y={portInY}
                            width={portW}
                            height={portH}
                            rx={portW / 2}
                            ry={portW / 2}
                            fill="#6366f1"
                            stroke="#4f46e5"
                            strokeWidth={1}
                        />
                        <path
                            d={`M ${hubCX + 4} ${inHubCY - 5} L ${hubCX - 5} ${inHubCY} L ${hubCX + 4} ${inHubCY + 5} Z`}
                            fill="white"
                            opacity={0.9}
                            style={{ pointerEvents: "none" }}
                        />
                        {fault && <FaultBadge cx={portX + portW} cy={inHubCY} />}
                    </g>
                )}
                {/* LEFT IN – blue capsule on the left edge, forward incoming edges */}
                {hasLeftIn && (
                    <g>
                        <rect
                            x={leftPortX}
                            y={-portH / 2}
                            width={portW}
                            height={portH}
                            rx={portW / 2}
                            ry={portW / 2}
                            fill="#3b82f6"
                            stroke="#2563eb"
                            strokeWidth={1}
                        />
                        <path
                            d={`M ${leftHubCX - 4} ${-5} L ${leftHubCX + 5} ${0} L ${leftHubCX - 4} ${5} Z`}
                            fill="white"
                            opacity={0.9}
                            style={{ pointerEvents: "none" }}
                        />
                        {fault && <FaultBadge cx={leftPortX} cy={0} />}
                    </g>
                )}
                {/* Header: workload name + health dot + replica count */}
                {hasPods ? (
                    <g style={{ pointerEvents: "none" }}>
                        <circle cx={podsLeft + 3} cy={headerY} r={3.5} fill={healthDot} />
                        <text
                            x={podsLeft + 12}
                            y={headerY}
                            textAnchor="start"
                            dominantBaseline="central"
                            fontSize={11}
                            fontFamily="Inter, system-ui, sans-serif"
                            fontWeight={600}
                            fill="#1f2937"
                        >
                            {truncateMid(node.name, 18)}
                        </text>
                        <text
                            x={nodeWidth / 2 - POD_AREA_PAD}
                            y={headerY}
                            textAnchor="end"
                            dominantBaseline="central"
                            fontSize={9}
                            fontFamily="Inter, system-ui, sans-serif"
                            fontWeight={600}
                            fill="#6b7280"
                        >
                            ×{node.podCount}
                        </text>
                        {/* Pod mini-cards */}
                        {pods.map((pod, i) => (
                            <PodMiniCard
                                key={pod.podName}
                                pod={pod}
                                x={podsLeft}
                                y={podsTop + i * (POD_CARD_H + POD_CARD_GAP)}
                                width={podCardW}
                            />
                        ))}
                    </g>
                ) : (
                    <g style={{ pointerEvents: "none" }}>
                        {/* No pod-level metrics (synthetic node / scraper not running) */}
                        <text
                            x={0}
                            y={-7}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={13}
                            fontFamily="Inter, system-ui, sans-serif"
                            fontWeight={500}
                            fill="#1f2937"
                        >
                            {node.name}
                        </text>
                        <g>
                            <circle cx={-14} cy={13} r={4} fill={healthDot} />
                            <text
                                x={-4}
                                y={13}
                                textAnchor="start"
                                dominantBaseline="central"
                                fontSize={10}
                                fontFamily="Inter, system-ui, sans-serif"
                                fontWeight={600}
                                fill="#6b7280"
                            >
                                ×{node.podCount} {node.podCount === 1 ? "replica" : "replicas"}
                            </text>
                        </g>
                    </g>
                )}
            </g>

            {/* Status-change pulse – ring that fades out when health changes */}
            {statusFlashKey > 0 && (healthColors || health !== "neutral") && (
                <g
                    key={statusFlashKey}
                    style={{ pointerEvents: "none", transformBox: "fill-box", transformOrigin: "center", animation: `${KF_STATUS_FLASH} 0.6s ease-out` }}
                >
                    <rect
                        x={-nodeWidth / 2 - 4}
                        y={-nodeHeight / 2 - 4}
                        width={nodeWidth + 8}
                        height={nodeHeight + 8}
                        rx={BORDER_RADIUS + 3}
                        ry={BORDER_RADIUS + 3}
                        fill="none"
                        stroke={healthColors ? healthColors.glow : healthDot}
                        strokeWidth={3}
                    />
                </g>
            )}
        </g>
    );
}

export { NODE_WIDTH, NODE_HEIGHT, BORDER_RADIUS, BAR_WIDTH };
