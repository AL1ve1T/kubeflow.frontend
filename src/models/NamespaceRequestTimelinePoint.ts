export interface NamespaceRequestTimelinePoint {
    timestamp: string;
    totalRequests: number;
    totalPods: number;
    notReadyPods: number;
}