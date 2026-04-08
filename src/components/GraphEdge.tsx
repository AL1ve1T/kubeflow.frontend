import type { EdgeDto } from "../models";

interface Position {
    x: number;
    y: number;
}

interface GraphEdgeProps {
    edge: EdgeDto;
    sourcePos: Position;
    targetPos: Position;
    sameColumn?: boolean;
    colSpacing?: number;
    highlighted?: boolean;
    onMouseEnter: (edgeId: string) => void;
    onMouseLeave: () => void;
    onClick: (edge: EdgeDto, screenX: number, screenY: number) => void;
}

function edgeColor(errorRate: number, rps: number): string {
    if (rps === 0) return "#9ca3af";
    if (errorRate > 0.01) return "#ef4444";
    if (rps > 30) return "#f59e0b";
    return "#22c55e";
}

function edgeWidth(rps: number): number {
    if (rps === 0) return 1;
    if (rps > 30) return 3;
    if (rps > 15) return 2;
    return 1.5;
}

export function GraphEdge({ edge, sourcePos, targetPos, sameColumn, colSpacing, highlighted, onMouseEnter, onMouseLeave, onClick }: GraphEdgeProps) {
    const color = edgeColor(edge.errorRate, edge.requestsPerSecond);
    const width = edgeWidth(edge.requestsPerSecond);

    const markerId = `arrow-${edge.id}`;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick(edge, e.clientX, e.clientY);
    };

    // For same-column edges, curve to the right
    const isCurved = sameColumn === true;
    const vertDist = Math.abs(targetPos.y - sourcePos.y);
    const maxBulge = colSpacing ? colSpacing * 0.35 : 60;
    const bulge = Math.min(vertDist * 0.4, maxBulge);
    const cx = sourcePos.x + bulge;
    const cy = (sourcePos.y + targetPos.y) / 2;
    const curvePath = `M ${sourcePos.x} ${sourcePos.y} Q ${cx} ${cy} ${targetPos.x} ${targetPos.y}`;

    return (
        <g
            style={{ cursor: "pointer" }}
            onMouseEnter={() => onMouseEnter(edge.id)}
            onMouseLeave={onMouseLeave}
            onClick={handleClick}
        >
            <defs>
                <marker
                    id={markerId}
                    viewBox="0 0 10 6"
                    refX="10"
                    refY="3"
                    markerWidth="8"
                    markerHeight="6"
                    orient="auto-start-reverse"
                >
                    <path d="M 0 0 L 10 3 L 0 6 z" fill={color} />
                </marker>
            </defs>
            {isCurved ? (
                <>
                    {/* Invisible fat hitbox */}
                    <path d={curvePath} fill="none" stroke="transparent" strokeWidth={14} />
                    {/* Hover glow */}
                    {highlighted && (
                        <path d={curvePath} fill="none" stroke={color} strokeWidth={width + 4} opacity={0.25} />
                    )}
                    {/* Visible edge */}
                    <path d={curvePath} fill="none" stroke={color} strokeWidth={width} markerEnd={`url(#${markerId})`} />
                </>
            ) : (
                <>
                    {/* Invisible fat hitbox for easier clicking */}
                    <line
                        x1={sourcePos.x}
                        y1={sourcePos.y}
                        x2={targetPos.x}
                        y2={targetPos.y}
                        stroke="transparent"
                        strokeWidth={14}
                    />
                    {/* Highlight glow on hover */}
                    {highlighted && (
                        <line
                            x1={sourcePos.x}
                            y1={sourcePos.y}
                            x2={targetPos.x}
                            y2={targetPos.y}
                            stroke={color}
                            strokeWidth={width + 4}
                            opacity={0.25}
                        />
                    )}
                    {/* Visible edge */}
                    <line
                        x1={sourcePos.x}
                        y1={sourcePos.y}
                        x2={targetPos.x}
                        y2={targetPos.y}
                        stroke={color}
                        strokeWidth={width}
                        markerEnd={`url(#${markerId})`}
                    />
                </>
            )}
        </g>
    );
}
