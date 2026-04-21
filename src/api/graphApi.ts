import type { GraphSnapshot } from "../models";

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
