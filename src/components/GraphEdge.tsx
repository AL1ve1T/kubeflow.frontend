import { memo } from "react";
import { useChangeFlash } from "../hooks/useChangeFlash";
import { KF_EDGE_APPEAR, KF_LOAD_FLASH } from "../helpers/animations";

interface Position {
    x: number;
    y: number;
}

interface GraphEdgeProps {
    routeId: string;
    path: string;
    end: Position;
    color: string;
    width: number;
    rps: number;
    showEndDot: boolean;
    hubTint?: "out" | "in" | null;
    highlighted?: boolean;
}

function clampChannel(value: number): number {
    return Math.max(0, Math.min(255, value));
}

function adjustColor(hex: string, mixTo: number, ratio: number): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    const nr = clampChannel(Math.round(r + (mixTo - r) * ratio));
    const ng = clampChannel(Math.round(g + (mixTo - g) * ratio));
    const nb = clampChannel(Math.round(b + (mixTo - b) * ratio));
    return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

function darkenColor(hex: string, ratio: number): string {
    return adjustColor(hex, 0, ratio);
}

function lightenColor(hex: string, ratio: number): string {
    return adjustColor(hex, 255, ratio);
}

function extractPathStart(path: string): { x: number; y: number } | null {
    const m = /^M\s*([-\d.eE+]+)[,\s]([-\d.eE+]+)/.exec(path.trim());
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : null;
}

/** Dash period in pixels (dash + gap). Shorter = denser. */
export const DASH_PERIOD = 52;

/** Shared keyframe name; defined once at the canvas level. */
export const EDGE_FLOW_KEYFRAME = "edge-flow";

/**
 * Animation duration in seconds. Higher RPS = faster flow.
 * Idle (rps=0) flows slowly to show the path; active flows faster.
 */
function flowDuration(rps: number): number {
    if (rps === 0) return 4;
    if (rps < 5) return 3;
    if (rps < 20) return 1.8;
    if (rps < 40) return 1.1;
    return 0.7;
}

export const GraphEdge = memo(GraphEdgeImpl);

function GraphEdgeImpl({ path, end, color, width, rps, showEndDot, hubTint, highlighted }: GraphEdgeProps) {
    const outerColor = darkenColor(color, 0.3);
    const innerColor = lightenColor(color, 0.42);
    const coreWidth = Math.max(2, width * 0.6);
    const dotRadius = Math.max(3, width * 0.55);
    const tintColor = hubTint === "out" ? "#f59e0b" : hubTint === "in" ? "#6366f1" : null;
    const duration = flowDuration(rps);

    // Large gap so bubbles are clearly separated even when edges overlap
    const dashGap = Math.max(20, width * 2.0);
    const dashLen = Math.max(10, DASH_PERIOD - dashGap);
    // Dash stroke is thicker than the track so round ends bulge out visibly
    const dashWidth = coreWidth * 1.4;

    // RPS badge – midpoint between path start and branch terminus
    const rpsStart = extractPathStart(path);
    const rpsMidX = rpsStart ? (rpsStart.x + end.x) / 2 : end.x;
    const rpsMidY = (rpsStart ? (rpsStart.y + end.y) / 2 : end.y) - 12;
    const rpsLabel = rps >= 10 ? `${Math.round(rps)} rps` : `${rps.toFixed(1)} rps`;
    const rpsLabelW = rpsLabel.length * 5;

    // Replay a brief pulse whenever the edge's load (width/colour/rps) changes.
    const loadFlashKey = useChangeFlash(`${color}|${Math.round(width * 10)}|${Math.round(rps)}`);

    return (
        <g style={{ pointerEvents: "none", animation: `${KF_EDGE_APPEAR} 0.45s ease-out` }}>
            {/* Hover glow */}
            {highlighted && (
                <path d={path} fill="none" stroke={outerColor} strokeWidth={width + 8} opacity={0.28} strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Static shell – solid thin background track */}
            <path d={path} fill="none" stroke={outerColor} strokeWidth={width * 0.5} opacity={0.35} strokeLinecap="round" strokeLinejoin="round" />

            {/* Animated flowing dashes – direction of travel is always source → dest */}
            <path
                d={path}
                fill="none"
                stroke={innerColor}
                strokeWidth={dashWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${dashLen} ${dashGap}`}
                style={{
                    animationName: EDGE_FLOW_KEYFRAME,
                    animationDuration: `${duration}s`,
                    animationTimingFunction: "linear",
                    animationIterationCount: "infinite",
                }}
            />

            {/* RPS badge – shown only on branch terminus segments when traffic is non-zero */}
            {showEndDot && rps > 0 && (
                <g>
                    <rect
                        x={rpsMidX - rpsLabelW / 2 - 3}
                        y={rpsMidY - 6}
                        width={rpsLabelW + 6}
                        height={12}
                        rx={3}
                        fill="rgba(255,255,255,0.9)"
                    />
                    <text
                        x={rpsMidX}
                        y={rpsMidY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={9}
                        fontFamily="Inter, system-ui, sans-serif"
                        fontWeight={600}
                        fill={outerColor}
                    >
                        {rpsLabel}
                    </text>
                </g>
            )}
            {/* Terminal dot at branch end (arrival at IN hub) */}
            {showEndDot && (
                <circle cx={end.x} cy={end.y} r={dotRadius} fill={tintColor ?? outerColor} />
            )}

            {/* Load-change pulse – brightened overlay that fades out on each change */}
            {loadFlashKey > 0 && (
                <path
                    key={loadFlashKey}
                    d={path}
                    fill="none"
                    stroke={lightenColor(color, 0.5)}
                    strokeWidth={width + 6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ animation: `${KF_LOAD_FLASH} 0.7s ease-out` }}
                />
            )}
        </g>
    );
}
