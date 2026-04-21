import type { NodeDto } from "../models";
import { NodeType } from "../models";

interface Position {
    x: number;
    y: number;
}

interface GraphNodeProps {
    node: NodeDto;
    position: Position;
    highlighted?: boolean;
    canvasHeight?: number;
    onMouseEnter: (nodeId: string) => void;
    onMouseLeave: () => void;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
const BORDER_RADIUS = 12;
const BAR_WIDTH = 40;

export function GraphNode({ node, position, highlighted, canvasHeight, onMouseEnter, onMouseLeave }: GraphNodeProps) {
    const isBar = node.type === NodeType.INPUT;

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
                style={{ cursor: "default" }}
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
            style={{ cursor: "default" }}
        >
            {highlighted && (
                <rect
                    x={-NODE_WIDTH / 2 - 3}
                    y={-NODE_HEIGHT / 2 - 3}
                    width={NODE_WIDTH + 6}
                    height={NODE_HEIGHT + 6}
                    rx={BORDER_RADIUS + 2}
                    ry={BORDER_RADIUS + 2}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    opacity={0.45}
                />
            )}
            <rect
                x={-NODE_WIDTH / 2}
                y={-NODE_HEIGHT / 2}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={BORDER_RADIUS}
                ry={BORDER_RADIUS}
                fill="#ffffff"
                stroke={highlighted ? "#3b82f6" : "#d1d5db"}
                strokeWidth={highlighted ? 2 : 1.5}
            />
            <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={13}
                fontFamily="Inter, system-ui, sans-serif"
                fontWeight={500}
                fill="#1f2937"
            >
                {node.name}
            </text>
        </g>
    );
}

export { NODE_WIDTH, NODE_HEIGHT, BORDER_RADIUS, BAR_WIDTH };
