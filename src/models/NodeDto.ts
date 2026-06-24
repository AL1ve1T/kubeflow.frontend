export enum NodeType {
    SERVICE = "SERVICE",
    DATABASE = "DATABASE",
    CACHE = "CACHE",
    QUEUE = "QUEUE",
    GATEWAY = "GATEWAY",
    INPUT = "INPUT",
}

export type PodPhase = "RUNNING" | "PENDING" | "NOT_READY" | "CRASH_LOOP" | "FAILED" | "UNKNOWN";

import type { PodDto } from "./PodDto";

export interface NodeDto {
    id: string;
    name: string;
    type: NodeType;
    podPhase: PodPhase;
    podCount: number;
    restartCount: number;
    lastRestartAt: string | null;
    lastRestartReason: string | null;
    lastSeenAt: string;
    /**
     * Per-pod resource and health metrics for this workload. CPU/RAM live HERE,
     * not on the node — the workload itself has no CPU/RAM of its own.
     *
     * May be `null` on /api/graph/history snapshots persisted before replica-set
     * support was added — treat those as an empty list.
     */
    pods: PodDto[] | null;
}
