import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHistory } from "../api/graphApi";
import type { GraphSnapshot } from "../models";

const HISTORY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const LIVE_POLL_INTERVAL_MS = 30_000;      // re-fetch every 30 s while live

export interface HistoryRangeData {
    historySnapshots: GraphSnapshot[];
    loading: boolean;
    error: string | null;
    windowStartMs: number;
    windowEndMs: number;
    refresh: () => void;
}

export function useHistoryRange(namespace: string | null): HistoryRangeData {
    // windowStartMs is anchored at mount time and never moves forward so that
    // existing scrubIndex values remain valid as new snapshots are appended.
    const windowStartMsRef = useRef<number>(Date.now() - HISTORY_WINDOW_MS);
    const cancelledRef = useRef(false);
    // Timestamp (ms) of the newest snapshot we already hold. Live polls fetch
    // only from this point forward so we never re-download the whole window.
    const lastSnapshotTimeRef = useRef<number | null>(null);

    const [state, setState] = useState<Omit<HistoryRangeData, "refresh">>(() => ({
        historySnapshots: [],
        loading: false,
        error: null,
        windowStartMs: windowStartMsRef.current,
        windowEndMs: Date.now(),
    }));

    const doFetch = useCallback(
        async (isInitial: boolean) => {
            if (!namespace || cancelledRef.current) return;
            const windowEndMs = Date.now();
            const windowStartMs = windowStartMsRef.current;

            if (isInitial) {
                setState((prev) => ({
                    ...prev,
                    loading: true,
                    error: null,
                    windowStartMs,
                    windowEndMs,
                }));
            }

            // On live polls, only request snapshots newer than the most recent
            // one we already have. The initial load pulls the full window.
            const fetchFromMs =
                !isInitial && lastSnapshotTimeRef.current
                    ? lastSnapshotTimeRef.current
                    : windowStartMs;

            try {
                const snapshots = await fetchHistory({
                    from: new Date(fetchFromMs).toISOString(),
                    to: new Date(windowEndMs).toISOString(),
                    namespace: namespace ?? undefined,
                });
                if (cancelledRef.current) return;

                // Track the newest snapshot timestamp so the next poll can fetch
                // incrementally from this point.
                const newestFetchedMs = snapshots.reduce(
                    (max, s) => Math.max(max, new Date(s.generatedAt).getTime()),
                    0,
                );
                if (newestFetchedMs > 0) {
                    lastSnapshotTimeRef.current = Math.max(
                        lastSnapshotTimeRef.current ?? 0,
                        newestFetchedMs,
                    );
                }

                // Deduplicate by generatedAt then sort ascending so that
                // appending new ticks at the end never invalidates existing indices.
                setState((prev) => {
                    const existing = isInitial ? [] : prev.historySnapshots;
                    const merged = new Map<string, GraphSnapshot>();
                    for (const s of existing) merged.set(s.generatedAt, s);
                    for (const s of snapshots) merged.set(s.generatedAt, s);
                    const sorted = [...merged.values()].sort(
                        (a, b) =>
                            new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime(),
                    );
                    return {
                        historySnapshots: sorted,
                        loading: false,
                        error: null,
                        windowStartMs,
                        windowEndMs,
                    };
                });
            } catch (err) {
                if (cancelledRef.current) return;
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    error: (err as Error).message,
                    windowEndMs,
                }));
            }
        },
        [namespace],
    );

    useEffect(() => {
        if (!namespace) return;

        // Reset anchor and fetch state when namespace changes
        cancelledRef.current = false;
        windowStartMsRef.current = Date.now() - HISTORY_WINDOW_MS;
        lastSnapshotTimeRef.current = null;
        setState({
            historySnapshots: [],
            loading: false,
            error: null,
            windowStartMs: windowStartMsRef.current,
            windowEndMs: Date.now(),
        });

        doFetch(true);

        // Keep the timeline up to date while in live mode.
        const interval = window.setInterval(() => doFetch(false), LIVE_POLL_INTERVAL_MS);

        return () => {
            cancelledRef.current = true;
            window.clearInterval(interval);
        };
    }, [namespace, doFetch]);

    const refresh = useCallback(() => doFetch(false), [doFetch]);

    return { ...state, refresh };
}
