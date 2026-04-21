import { useEffect, useMemo, useState } from "react";
import { TopologyCanvas } from "./components/TopologyCanvas";
import { useGraphSubscription } from "./hooks/useGraphSubscription";
import { formatTimeAgo } from "./helpers/timeAgo";

export function App() {
    const { snapshots, lastRefreshAt, status, error } = useGraphSubscription();
    const [clockNow, setClockNow] = useState(() => Date.now());
    const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);

    useEffect(() => {
        const timer = window.setInterval(() => setClockNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

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

    const activeSnapshot = useMemo(
        () => snapshots.find((s) => s.namespace === selectedNamespace) ?? null,
        [snapshots, selectedNamespace],
    );

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
            }}
        >
            {activeSnapshot ? <TopologyCanvas snapshot={activeSnapshot} /> : null}

            {!activeSnapshot && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        color: "#6b7280",
                        fontFamily: "Inter, system-ui, sans-serif",
                        fontSize: 14,
                        zIndex: 5,
                    }}
                >
                    Waiting for graph snapshot...
                </div>
            )}

            <div
                style={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    zIndex: 20,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    background: "rgba(255,255,255,0.92)",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize: 12,
                    color: "#374151",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                }}
            >
                {namespaces.length > 1 && (
                    <select
                        value={selectedNamespace ?? ""}
                        onChange={(e) => setSelectedNamespace(e.target.value)}
                        style={{
                            fontSize: 12,
                            fontFamily: "Inter, system-ui, sans-serif",
                            border: "1px solid #d1d5db",
                            borderRadius: 4,
                            padding: "2px 6px",
                            color: "#374151",
                            background: "#fff",
                        }}
                    >
                        {namespaces.map((ns) => (
                            <option key={ns} value={ns}>
                                {ns}
                            </option>
                        ))}
                    </select>
                )}
                <span style={{ fontWeight: 700 }}>Last refresh: {lastRefreshText}</span>
                <span style={{ color: "#6b7280" }}>Status: {status}</span>
            </div>

            {error && (
                <div
                    style={{
                        position: "absolute",
                        left: 12,
                        bottom: 12,
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
        </div>
    );
}
