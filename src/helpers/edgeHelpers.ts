import type { EdgeDto, NodeDto } from "../models";
import { NodeType } from "../models";
import { NODE_HEIGHT, NODE_WIDTH, BAR_WIDTH } from "../components/GraphNode";

interface Position {
    x: number;
    y: number;
}

interface EdgePositions {
    sourcePos: Position;
    targetPos: Position;
    isSameColumn: boolean;
}

/**
 * Compute the point where a line from `center` toward `target` exits the rectangle
 */
function rectIntersection(
    center: Position,
    target: Position,
    halfW: number,
    halfH: number,
): Position {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (dx === 0 && dy === 0) return { ...center };

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    const scaleX = halfW / (absDx || 1);
    const scaleY = halfH / (absDy || 1);
    const t = Math.min(scaleX, scaleY);

    return {
        x: center.x + dx * t,
        y: center.y + dy * t,
    };
}

/**
 * Get dimensions for a node (accounts for bar nodes vs regular nodes).
 * INTERNAL occupies the top half of the canvas, EXTERNAL the bottom half.
 */
function getNodeDimensions(node: NodeDto | undefined) {
    if (node?.type !== NodeType.INPUT) {
        return { isBar: false, halfW: NODE_WIDTH / 2, halfH: NODE_HEIGHT / 2, centerY: undefined };
    }

    // Nodes whose name contains "internal" connect from the top half; others from the bottom half.
    const isInternalHalf = node.name.toLowerCase().includes("internal");
    const halfBarH = CANVAS_H / 4;
    const centerY = isInternalHalf ? halfBarH : 3 * halfBarH;

    return {
        isBar: true,
        halfW: BAR_WIDTH / 2,
        halfH: halfBarH,
        centerY,
    };
}

const CANVAS_H = 600; // from TopologyCanvas constants

/**
 * Compute edge endpoint positions accounting for node types and same-column routing
 */
export function computeEdgePositions(
    edge: EdgeDto,
    positions: Record<string, Position>,
    nodeMap: Map<string, NodeDto>,
): EdgePositions {
    const srcFull = positions[edge.sourceNodeId];
    const tgtFull = positions[edge.targetNodeId];

    if (!srcFull || !tgtFull) {
        return { sourcePos: srcFull || { x: 0, y: 0 }, targetPos: tgtFull || { x: 0, y: 0 }, isSameColumn: false };
    }

    const srcNode = nodeMap.get(edge.sourceNodeId);
    const tgtNode = nodeMap.get(edge.targetNodeId);

    const srcDim = getNodeDimensions(srcNode);
    const tgtDim = getNodeDimensions(tgtNode);

    const srcCenter = srcDim.isBar ? { x: srcFull.x, y: srcDim.centerY! } : srcFull;
    const tgtCenter = tgtDim.isBar ? { x: tgtFull.x, y: tgtDim.centerY! } : tgtFull;

    const isSameColumn = Math.abs(srcFull.x - tgtFull.x) < 1;

    const curveTarget = isSameColumn
        ? { x: srcFull.x + srcDim.halfW + 10, y: (srcCenter.y + tgtCenter.y) / 2 }
        : tgtCenter;
    const curveSource = isSameColumn
        ? { x: tgtFull.x + tgtDim.halfW + 10, y: (srcCenter.y + tgtCenter.y) / 2 }
        : srcCenter;

    const sourcePos = rectIntersection(srcCenter, curveTarget, srcDim.halfW, srcDim.halfH);
    const targetPos = rectIntersection(tgtCenter, curveSource, tgtDim.halfW, tgtDim.halfH);

    return { sourcePos, targetPos, isSameColumn };
}
