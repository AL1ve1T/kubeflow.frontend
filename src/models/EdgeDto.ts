export type LoadLevel = "NORMAL" | "ELEVATED" | "HIGH" | "CRITICAL";

export interface EdgeDto {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    protocol: string;
    requestsPerSecond: number;
    averageLatencyMs: number;
    maxLatencyMs: number;
    errorCount: number;
    errorRate: number;
    loadLevel: LoadLevel;
    lastSeenAt: string;
}
