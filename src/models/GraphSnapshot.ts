import type { EdgeDto } from "./EdgeDto";
import type { NodeDto } from "./NodeDto";

export interface GraphSnapshot {
    namespace: string;
    nodes: NodeDto[];
    edges: EdgeDto[];
    generatedAt: string;
}
