import { useEffect, useMemo, useState } from "react";
import type { GraphSnapshot } from "../models";
import {
    buildApiUrl,
    extractGraphSnapshots,
    GRAPH_SNAPSHOT_PATH,
    GRAPH_STREAM_PATH,
} from "../api/graphApi";

export type GraphSubscriptionStatus =
    | "idle"
    | "subscribing"
    | "connected"
    | "error";

interface UseGraphSubscriptionResult {
    snapshots: GraphSnapshot[];
    lastRefreshAt: number | null;
    status: GraphSubscriptionStatus;
    error: string | null;
}

async function fetchInitialSnapshots(path: string, signal: AbortSignal): Promise<GraphSnapshot[]> {
    const response = await fetch(buildApiUrl(path), { signal });
    if (!response.ok) return [];
    const payload = (await response.json()) as unknown;
    return extractGraphSnapshots(payload);
}

export function useGraphSubscription(): UseGraphSubscriptionResult {
    const [snapshots, setSnapshots] = useState<GraphSnapshot[]>([]);
    const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
    const [status, setStatus] = useState<GraphSubscriptionStatus>("idle");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let source: EventSource | null = null;
        const abortController = new AbortController();

        const run = async () => {
            setStatus("subscribing");
            setError(null);

            try {
                const initial = await fetchInitialSnapshots(
                    GRAPH_SNAPSHOT_PATH,
                    abortController.signal,
                );
                if (initial.length > 0) {
                    setSnapshots(initial);
                    setLastRefreshAt(Date.now());
                }

                source = new EventSource(buildApiUrl(GRAPH_STREAM_PATH));

                // Tracks whether the connection has dropped at least once so that
                // onopen can distinguish the initial connect from a reconnect.
                let needsRefreshOnReconnect = false;

                source.onopen = () => {
                    setStatus("connected");
                    setError(null);
                    if (needsRefreshOnReconnect) {
                        needsRefreshOnReconnect = false;
                        // Re-fetch the snapshot REST endpoint to backfill any
                        // snapshots that arrived while the stream was down.
                        void fetchInitialSnapshots(
                            GRAPH_SNAPSHOT_PATH,
                            abortController.signal,
                        ).then((refetched) => {
                            if (refetched.length > 0) {
                                setSnapshots(refetched);
                                setLastRefreshAt(Date.now());
                            }
                        });
                    }
                };

                const handleEvent = (event: MessageEvent<string>) => {
                    const raw = event.data;
                    if (!raw) return;

                    try {
                        const parsed = JSON.parse(raw) as unknown;
                        const next = extractGraphSnapshots(parsed);
                        if (next.length === 0) return;
                        setSnapshots(next);
                        setLastRefreshAt(Date.now());
                    } catch {
                        // Ignore malformed event payloads and wait for next event.
                    }
                };

                // Support both unnamed message events and named graph-update events.
                source.onmessage = handleEvent;
                source.addEventListener("graph-update", (event) => {
                    handleEvent(event as MessageEvent<string>);
                });

                source.onerror = () => {
                    setStatus("error");
                    setError("Graph stream connection lost. Waiting for automatic reconnection...");
                    needsRefreshOnReconnect = true;
                };
            } catch (e) {
                const message = e instanceof Error ? e.message : "Unknown subscription error";
                setStatus("error");
                setError(message);
            }
        };

        void run();

        return () => {
            abortController.abort();
            if (source) source.close();
        };
    }, []);

    return useMemo(
        () => ({ snapshots, lastRefreshAt, status, error }),
        [snapshots, lastRefreshAt, status, error],
    );
}
