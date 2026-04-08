import type { EdgeDto } from "./EdgeDto";
import type { NodeDto } from "./NodeDto";

export interface GraphSnapshot {
    nodes: NodeDto[];
    edges: EdgeDto[];
    generatedAt: string;
}
