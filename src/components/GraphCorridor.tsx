import { memo } from "react";
import type { CorridorRenderItem } from "../helpers/edgeHelpers";

interface GraphCorridorProps {
    corridor: CorridorRenderItem;
    highlighted?: boolean;
}

/**
 * A corridor is the shared vertical "pipe" that individual edge stubs and
 * branches connect to. It is rendered as a distinct rounded rectangle with a
 * semi-transparent fill and an opaque stroke so it reads as infrastructure,
 * not just a thick edge.
 */
export const GraphCorridor = memo(GraphCorridorImpl);

function GraphCorridorImpl({ corridor, highlighted }: GraphCorridorProps) {
    const halfW = corridor.width / 2;
    const height = corridor.maxY - corridor.minY;

    return (
        <g style={{ pointerEvents: "none" }}>
            {/* Outer glow when hovered */}
            {highlighted && (
                <rect
                    x={corridor.x - halfW - 5}
                    y={corridor.minY - 5}
                    width={corridor.width + 10}
                    height={height + 10}
                    rx={halfW + 5}
                    ry={halfW + 5}
                    fill={corridor.color}
                    opacity={0.22}
                />
            )}
            {/* Pipe fill – semi-transparent so the dot grid shows through */}
            <rect
                x={corridor.x - halfW}
                y={corridor.minY}
                width={corridor.width}
                height={height}
                rx={halfW}
                ry={halfW}
                fill={corridor.color}
                fillOpacity={highlighted ? 0.45 : 0.28}
            />
            {/* Pipe border – clearly distinct from individual edge lines */}
            <rect
                x={corridor.x - halfW}
                y={corridor.minY}
                width={corridor.width}
                height={height}
                rx={halfW}
                ry={halfW}
                fill="none"
                stroke={corridor.color}
                strokeOpacity={highlighted ? 1 : 0.85}
                strokeWidth={1.5}
            />
        </g>
    );
}
