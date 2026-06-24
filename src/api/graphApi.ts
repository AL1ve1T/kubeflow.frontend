import type {
    GraphSnapshot,
    NamespaceRequestTimelinePoint,
    RestartEventDto,
    ResourceMetricsPointDto,
    RequestRatePointDto,
} from "../models";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

export const GRAPH_SNAPSHOT_PATH = import.meta.env.VITE_GRAPH_SNAPSHOT_PATH ?? "/api/graph";
export const GRAPH_STREAM_PATH = import.meta.env.VITE_GRAPH_STREAM_PATH ?? "/api/graph/stream";

export function buildApiUrl(path: string): string {
    return new URL(path, API_BASE_URL).toString();
}

function isGraphSnapshotLike(value: unknown): value is GraphSnapshot {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { nodes?: unknown; edges?: unknown; generatedAt?: unknown };
    return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

function normalizeSnapshot(value: GraphSnapshot): GraphSnapshot {
    return {
        namespace: typeof value.namespace === "string" ? value.namespace : "",
        nodes: value.nodes,
        edges: value.edges,
        generatedAt:
            typeof value.generatedAt === "string" && value.generatedAt.length > 0
                ? value.generatedAt
                : new Date().toISOString(),
    };
}

/**
 * Extract an array of GraphSnapshot objects from a backend response.
 * The backend returns GraphSnapshot[] from both the REST and SSE endpoints.
 */
export function extractGraphSnapshots(payload: unknown): GraphSnapshot[] {
    if (Array.isArray(payload)) {
        return payload
            .filter(isGraphSnapshotLike)
            .map(normalizeSnapshot);
    }

    if (isGraphSnapshotLike(payload)) {
        return [normalizeSnapshot(payload)];
    }

    if (payload && typeof payload === "object") {
        const candidate = payload as Record<string, unknown>;
        const wrapperKeys = ["snapshot", "graphSnapshot", "graph", "state", "payload", "data"];
        for (const key of wrapperKeys) {
            const nested = candidate[key];
            if (Array.isArray(nested)) {
                const snapshots = nested.filter(isGraphSnapshotLike).map(normalizeSnapshot);
                if (snapshots.length > 0) return snapshots;
            }
            if (isGraphSnapshotLike(nested)) {
                return [normalizeSnapshot(nested)];
            }
        }
    }

    return [];
}

export async function fetchHistory(options?: {
    from?: string;
    to?: string;
    namespace?: string;
}): Promise<GraphSnapshot[]> {
    const url = new URL(buildApiUrl("/api/graph/history"));
    if (options?.from) url.searchParams.set("from", options.from);
    if (options?.to) url.searchParams.set("to", options.to);
    if (options?.namespace) url.searchParams.set("namespace", options.namespace);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`);
    const raw: unknown = await res.json();
    return Array.isArray(raw) ? (raw as GraphSnapshot[]) : [];
}

export async function fetchRestartTimeline(
    nodeId: string,
    options?: { from?: string; to?: string; namespace?: string },
): Promise<RestartEventDto[]> {
    const url = new URL(buildApiUrl(`/api/nodes/${encodeURIComponent(nodeId)}/restarts`));
    if (options?.from) url.searchParams.set("from", options.from);
    if (options?.to) url.searchParams.set("to", options.to);
    if (options?.namespace) url.searchParams.set("namespace", options.namespace);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Failed to fetch restart timeline: ${res.status}`);
    return res.json() as Promise<RestartEventDto[]>;
}

export async function fetchResourceMetrics(
    nodeId: string,
    options?: { from?: string; to?: string; namespace?: string },
): Promise<ResourceMetricsPointDto[]> {
    const url = new URL(buildApiUrl(`/api/nodes/${encodeURIComponent(nodeId)}/resource-metrics`));
    if (options?.from) url.searchParams.set("from", options.from);
    if (options?.to) url.searchParams.set("to", options.to);
    if (options?.namespace) url.searchParams.set("namespace", options.namespace);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Failed to fetch resource metrics: ${res.status}`);
    return res.json() as Promise<ResourceMetricsPointDto[]>;
}

export async function fetchRequestRate(
    nodeId: string,
    options?: { from?: string; to?: string; namespace?: string },
): Promise<RequestRatePointDto[]> {
    const url = new URL(buildApiUrl(`/api/nodes/${encodeURIComponent(nodeId)}/request-rate`));
    if (options?.from) url.searchParams.set("from", options.from);
    if (options?.to) url.searchParams.set("to", options.to);
    if (options?.namespace) url.searchParams.set("namespace", options.namespace);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Failed to fetch request rate: ${res.status}`);
    return res.json() as Promise<RequestRatePointDto[]>;
}

export async function fetchNamespaceRequestTimeline(
    namespace: string,
    options?: { from?: string; to?: string },
): Promise<NamespaceRequestTimelinePoint[]> {
    const url = new URL(buildApiUrl(`/api/namespaces/${encodeURIComponent(namespace)}/request-timeline`));
    if (options?.from) url.searchParams.set("from", options.from);
    if (options?.to) url.searchParams.set("to", options.to);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Failed to fetch namespace request timeline: ${res.status}`);
    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) return [];
    return raw.map((point) => {
        const p = point as Partial<NamespaceRequestTimelinePoint>;
        const totalPods = Math.max(0, Math.round(p.totalPods ?? 0));
        const notReadyPods = Math.min(totalPods, Math.max(0, Math.round(p.notReadyPods ?? 0)));
        return {
            timestamp: typeof p.timestamp === "string" ? p.timestamp : new Date().toISOString(),
            totalRequests: typeof p.totalRequests === "number" ? p.totalRequests : 0,
            totalPods,
            notReadyPods,
        };
    });
}
