import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { TopologyCanvas } from "./components/TopologyCanvas";
import { ControlPanel } from "./components/ControlPanel";
import { TimelineScrubber } from "./components/TimelineScrubber";
import { useGraphSubscription } from "./hooks/useGraphSubscription";
import { useHistoryRange } from "./hooks/useHistoryRange";
import { useNamespaceRequestTimeline } from "./hooks/useNamespaceRequestTimeline";
import { formatTimeAgo } from "./helpers/timeAgo";
import type { NamespaceRequestTimelinePoint } from "./models";
import { DEFAULT_STRATEGY_ID, TOPOLOGY_STRATEGIES } from "./strategies";
import { mockSnapshot } from "./data/mockSnapshot";

const USE_MOCK = false;

export function App() {
    const { snapshots: liveSnapshots, lastRefreshAt, status, error } = useGraphSubscription();
    const snapshots = USE_MOCK ? [mockSnapshot] : liveSnapshots;
    const [clockNow, setClockNow] = useState(() => Date.now());
    const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
    const [strategyId, setStrategyId] = useState(DEFAULT_STRATEGY_ID);
    const [showInactiveEdges, setShowInactiveEdges] = useState(true);
    const [scrubIndex, setScrubIndex] = useState<number | null>(null);

    const { historySnapshots, loading: historyLoading, windowStartMs, windowEndMs, refresh: refreshHistory } = useHistoryRange(
        USE_MOCK ? null : selectedNamespace,
    );
    const {
        points: namespaceTimelinePoints,
        loading: namespaceTimelineLoading,
        error: namespaceTimelineError,
    } = useNamespaceRequestTimeline(USE_MOCK ? null : selectedNamespace, windowStartMs, windowEndMs);

    useEffect(() => {
        const timer = window.setInterval(() => setClockNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    // When the SSE stream reconnects after a drop, immediately refresh history
    // to backfill any snapshots that were missed during the disconnect period.
    const prevStatusRef = useRef(status);
    useEffect(() => {
        if (prevStatusRef.current === "error" && status === "connected") {
            refreshHistory();
        }
        prevStatusRef.current = status;
    }, [status, refreshHistory]);

    const namespaces = useMemo(
        () => snapshots.map((s) => s.namespace),
        [snapshots],
    );

    // Auto-select first namespace when data arrives
    useEffect(() => {
        if (selectedNamespace === null && namespaces.length > 0) {
            setSelectedNamespace(namespaces[0]);
        }
    }, [namespaces, selectedNamespace]);

    // Return to live mode when the namespace changes
    useEffect(() => {
        setScrubIndex(null);
    }, [selectedNamespace]);

    const activeSnapshot = useMemo(() => {
        if (scrubIndex !== null) {
            return historySnapshots[scrubIndex] ?? null;
        }
        return snapshots.find((s) => s.namespace === selectedNamespace) ?? null;
    }, [scrubIndex, historySnapshots, snapshots, selectedNamespace]);

    // Rendering a new snapshot runs the full layout pipeline synchronously in
    // TopologyCanvas. Deferring it lets React compute the heavy canvas in an
    // interruptible background transition, so the sidebar, namespace switch, and
    // timeline stay responsive instead of freezing while a snapshot loads.
    const deferredSnapshot = useDeferredValue(activeSnapshot);
    const isRenderingSnapshot = deferredSnapshot !== activeSnapshot;

    // Track whether the first snapshot has ever been rendered. The initial open
    // is the only time there is nothing on screen while the heavy first-layout
    // computation runs, so we mask it with a full-screen loading overlay. Once a
    // snapshot has rendered, later updates use the deferred render + "Updating…"
    // badge instead, so the overlay never reappears.
    const [hasRenderedSnapshot, setHasRenderedSnapshot] = useState(false);
    useEffect(() => {
        if (deferredSnapshot && !hasRenderedSnapshot) {
            setHasRenderedSnapshot(true);
        }
    }, [deferredSnapshot, hasRenderedSnapshot]);

    const fallbackTimelinePoints = useMemo<NamespaceRequestTimelinePoint[]>(
        () =>
            historySnapshots.map((snapshot) => ({
                timestamp: snapshot.generatedAt,
                totalRequests: snapshot.edges.reduce(
                    (sum, edge) => sum + (edge.requestsPerSecond ?? 0),
                    0,
                ),
                totalPods: snapshot.nodes.reduce(
                    (count, node) => count + (node.pods?.length ?? 0),
                    0,
                ),
                notReadyPods: snapshot.nodes.reduce(
                    (count, node) =>
                        count +
                        (node.pods?.filter((pod) => pod.podPhase !== "RUNNING").length ?? 0),
                    0,
                ),
            })),
        [historySnapshots],
    );

    const timelinePoints = namespaceTimelinePoints.length > 0
        ? namespaceTimelinePoints
        : fallbackTimelinePoints;

    const timelineError =
        namespaceTimelineError && timelinePoints.length === 0
            ? namespaceTimelineError
            : null;

    const lastRefreshText = useMemo(() => {
        if (!lastRefreshAt) return "never";
        return formatTimeAgo(lastRefreshAt, clockNow);
    }, [lastRefreshAt, clockNow]);

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                background: "#ffffff",
                overflow: "hidden",
                position: "relative",
                display: "flex",
            }}
        >
            <ControlPanel
                strategies={TOPOLOGY_STRATEGIES}
                activeStrategyId={strategyId}
                onStrategyChange={setStrategyId}
                namespaces={namespaces}
                selectedNamespace={selectedNamespace}
                onNamespaceChange={setSelectedNamespace}
                status={status}
                lastRefreshText={lastRefreshText}
                showInactiveEdges={showInactiveEdges}
                onToggleInactiveEdges={() => setShowInactiveEdges((v) => !v)}
            />

            {/* Canvas area offset by sidebar width */}
            <div style={{ flex: 1, position: "relative", marginLeft: 220 }}>
                {deferredSnapshot ? (
                    <TopologyCanvas
                        snapshot={deferredSnapshot}
                        strategyId={strategyId}
                        showInactiveEdges={showInactiveEdges}
                    />
                ) : (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "grid",
                            placeItems: "center",
                            color: "#6b7280",
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: 14,
                        }}
                    >
                        Waiting for graph snapshot...
                    </div>
                )}
                {isRenderingSnapshot && deferredSnapshot && (
                    <div
                        style={{
                            position: "absolute",
                            top: 12,
                            right: 12,
                            zIndex: 6,
                            background: "rgba(30,64,175,0.9)",
                            color: "#ffffff",
                            fontFamily: "Inter, system-ui, sans-serif",
                            fontSize: 12,
                            fontWeight: 600,
                            padding: "4px 10px",
                            borderRadius: 12,
                            pointerEvents: "none",
                            userSelect: "none",
                        }}
                    >
                        Updating…
                    </div>
                )}
                <TimelineScrubber
                    historySnapshots={historySnapshots}
                    timelinePoints={timelinePoints}
                    selectedIndex={scrubIndex}
                    onSelect={setScrubIndex}
                    onRefresh={refreshHistory}
                    loading={historyLoading || namespaceTimelineLoading}
                    timelineError={timelineError}
                    windowStartMs={windowStartMs}
                    windowEndMs={windowEndMs}
                />
            </div>

            {error && (
                <div
                    style={{
                        position: "absolute",
                        right: 16,
                        top: 16,
                        zIndex: 20,
                        background: "rgba(254,242,242,0.95)",
                        border: "1px solid #fecaca",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontFamily: "Inter, system-ui, sans-serif",
                        fontSize: 12,
                        color: "#b91c1c",
                        maxWidth: 520,
                    }}
                >
                    {error}
                </div>
            )}

            {!hasRenderedSnapshot && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 50,
                        background: "#ffffff",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 18,
                        fontFamily: "Inter, system-ui, sans-serif",
                    }}
                >
                    <style>{"@keyframes kv-spin { to { transform: rotate(360deg); } }"}</style>
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            border: "4px solid #e5e7eb",
                            borderTopColor: "#1e40af",
                            animation: "kv-spin 0.8s linear infinite",
                        }}
                    />
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>
                        Loading topology…
                    </div>
                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                        {status === "error"
                            ? "Connection problem — retrying…"
                            : status === "connected"
                                ? "Preparing graph…"
                                : "Connecting to graph stream…"}
                    </div>
                </div>
            )}
        </div>
    );
}
