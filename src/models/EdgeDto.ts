export interface EdgeDto {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    protocol: string;
    requestCount: number;
    requestsPerSecond: number;
    averageLatencyMs: number;
    maxLatencyMs: number;
    errorCount: number;
    errorRate: number;
    lastSeenAt: string;
}
