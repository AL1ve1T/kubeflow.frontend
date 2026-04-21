import type { NodeDto } from "../models";
import { NodeType } from "../models";

interface ColumnInfo {
    x: number;
    nodeIds: string[];
}

/**
 * Get label text for a column.
 * Column 0 is always the ingress column (entry points with no incoming edges).
 */
export function getColumnLabel(col: ColumnInfo, idx: number, nodeMap: Map<string, NodeDto>): string {
    if (idx === 0) return "Ingress";
    const isEntryPoint = col.nodeIds.every((id) => nodeMap.get(id)?.type === NodeType.INPUT);
    return isEntryPoint ? "Ingress" : `Layer ${idx}`;
}

/**
 * Compute screen X position for column label
 */
export function getColumnLabelScreenX(col: ColumnInfo, pan: { x: number; y: number }, zoom: number): number {
    return pan.x + col.x * zoom;
}
