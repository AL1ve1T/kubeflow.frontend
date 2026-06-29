import { memo, useMemo, useRef, useState } from "react";
import type { GraphSnapshot, NamespaceRequestTimelinePoint } from "../models";
import { readinessColor, unhealthyRatio } from "../helpers/healthColor";

interface TimelineScrubberProps {
    historySnapshots: GraphSnapshot[];
    timelinePoints: NamespaceRequestTimelinePoint[];
    selectedIndex: number | null;
    onSelect: (index: number | null) => void;
    onRefresh: () => void;
    loading: boolean;
    timelineError: string | null;
    windowStartMs: number;
    windowEndMs: number;
}

function fmtTime(ms: number): string {
    return new Date(ms).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function fmtDetailTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

function fmtRequests(value: number): string {
    if (value >= 100) return `${Math.round(value)} rps`;
    if (value >= 10) return `${value.toFixed(1)} rps`;
    return `${value.toFixed(2)} rps`;
}

export const TimelineScrubber = memo(TimelineScrubberImpl);

function TimelineScrubberImpl({
    historySnapshots,
    timelinePoints,
    selectedIndex,
    onSelect,
    onRefresh,
    loading,
    timelineError,
    windowStartMs,
    windowEndMs,
}: TimelineScrubberProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const isLive = selectedIndex === null;
    const windowDuration = Math.max(1, windowEndMs - windowStartMs);

    // The traffic curve doubles as the scrub surface. Everything is drawn in one
    // 0..100 coordinate box so the SVG line and the HTML checkpoint dots share a
    // single geometry and stay perfectly aligned.
    const PAD_TOP = 16;
    const PAD_BOTTOM = 18;

    const maxRequests = timelinePoints.reduce(
        (max, point) => Math.max(max, point.totalRequests),
        0,
    );

    // All curve geometry depends only on the timeline data and the window — not
    // on the current selection. Memoizing it keeps scrubbing cheap: dragging the
    // playhead only changes `selectedIndex`, so the heavy nearestPoint scan and
    // path building below are skipped and reused from this cache.
    const { checkpoints, areaPath, lineRuns } = useMemo(() => {
        const xOf = (timeMs: number) =>
            Math.max(0, Math.min(1, (timeMs - windowStartMs) / windowDuration)) * 100;

        const yOf = (value: number) => {
            const denom = maxRequests > 0 ? maxRequests : 1;
            return PAD_TOP + (1 - value / denom) * (100 - PAD_TOP - PAD_BOTTOM);
        };

        // Parse each timeline timestamp exactly once. Repeated Date parsing
        // inside the per-snapshot nearest-point lookup was the main-thread
        // bottleneck that froze the UI while a full history window loaded.
        const pointTimes = timelinePoints.map((point) => new Date(point.timestamp).getTime());

        // timelinePoints is sorted ascending by timestamp, so the closest point
        // to a given time is found with a binary search (O(log n)) instead of a
        // full linear scan (O(n)) per history snapshot.
        const nearestPoint = (timeMs: number): NamespaceRequestTimelinePoint | null => {
            if (timelinePoints.length === 0) return null;
            let lo = 0;
            let hi = pointTimes.length - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (pointTimes[mid] < timeMs) lo = mid + 1;
                else hi = mid;
            }
            // `lo` is the first index whose time >= timeMs; the nearer of it and
            // its predecessor is the closest point.
            if (
                lo > 0 &&
                Math.abs(pointTimes[lo - 1] - timeMs) <= Math.abs(pointTimes[lo] - timeMs)
            ) {
                return timelinePoints[lo - 1];
            }
            return timelinePoints[lo];
        };

        // One entry per history snapshot, projected onto the traffic curve so
        // each clickable checkpoint sits exactly on the line.
        const checkpoints = historySnapshots.map((snap) => {
            const timeMs = new Date(snap.generatedAt).getTime();
            const point = nearestPoint(timeMs);
            const value = point?.totalRequests ?? 0;
            return {
                generatedAt: snap.generatedAt,
                value,
                totalPods: point?.totalPods ?? 0,
                notReadyPods: point?.notReadyPods ?? 0,
                x: xOf(timeMs),
                y: yOf(value),
            };
        });

        const linePath = timelinePoints
            .map((point, idx) => {
                const x = xOf(pointTimes[idx]);
                const y = yOf(point.totalRequests);
                return `${idx === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(" ");

        const areaPath = linePath.length > 0 ? `${linePath} L 100 100 L 0 100 Z` : "";

        // Color the curve by pod readiness, but collapse consecutive same-color
        // segments into a single path so a healthy namespace renders as one
        // stroke instead of one <path> per point (which tanks the frame rate on
        // dense timelines).
        const lineRuns: { key: string; d: string; color: string }[] = [];
        if (timelinePoints.length >= 2) {
            const coord = (i: number) => {
                const p = timelinePoints[i];
                return `${xOf(pointTimes[i]).toFixed(2)} ${yOf(p.totalRequests).toFixed(2)}`;
            };
            const segColor = (i: number) =>
                readinessColor(
                    Math.max(
                        unhealthyRatio(timelinePoints[i].notReadyPods, timelinePoints[i].totalPods),
                        unhealthyRatio(timelinePoints[i + 1].notReadyPods, timelinePoints[i + 1].totalPods),
                    ),
                );
            let runStart = 0;
            let runColor = segColor(0);
            const flush = (endPointIdx: number) => {
                let d = `M ${coord(runStart)}`;
                for (let j = runStart + 1; j <= endPointIdx; j++) d += ` L ${coord(j)}`;
                lineRuns.push({ key: timelinePoints[runStart].timestamp, d, color: runColor });
            };
            for (let i = 1; i < timelinePoints.length - 1; i++) {
                const c = segColor(i);
                if (c !== runColor) {
                    flush(i);
                    runStart = i;
                    runColor = c;
                }
            }
            flush(timelinePoints.length - 1);
        }

        return { checkpoints, areaPath, lineRuns };
    }, [timelinePoints, historySnapshots, windowStartMs, windowEndMs, windowDuration, maxRequests]);

    const selectedCheckpoint =
        !isLive && selectedIndex !== null ? checkpoints[selectedIndex] ?? null : null;

    // The newest checkpoint represents the live edge of the window.
    const liveIndex = checkpoints.length - 1;
    const liveCheckpoint = liveIndex >= 0 ? checkpoints[liveIndex] : null;

    // Thin out overlapping dots: keep a minimum horizontal gap between markers,
    // but always show the selected checkpoint and the live edge.
    const MIN_DOT_GAP = 3;
    const visibleDots = new Set<number>();
    let lastDotX = Number.NEGATIVE_INFINITY;
    checkpoints.forEach((point, i) => {
        if (point.x - lastDotX >= MIN_DOT_GAP) {
            visibleDots.add(i);
            lastDotX = point.x;
        }
    });
    if (selectedIndex !== null) visibleDots.add(selectedIndex);
    if (liveIndex >= 0) visibleDots.add(liveIndex);

    function getFraction(clientX: number): number {
        if (!trackRef.current) return 0;
        const rect = trackRef.current.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }

    function findNearestIndex(frac: number): number | null {
        if (checkpoints.length === 0) return null;

        const target = frac * 100;
        let nearest = 0;
        let minDist = Math.abs(target - checkpoints[0].x);

        for (let i = 1; i < checkpoints.length; i++) {
            const dist = Math.abs(target - checkpoints[i].x);
            if (dist < minDist) {
                minDist = dist;
                nearest = i;
            }
        }

        return nearest;
    }

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (loading || checkpoints.length === 0) return;

        // Only pull fresh history when leaving live mode. Subsequent scrubbing is
        // pure local index selection and issues no network requests.
        if (isLive) onRefresh();

        trackRef.current?.setPointerCapture(e.pointerId);
        setIsDragging(true);

        const idx = findNearestIndex(getFraction(e.clientX));
        if (idx !== null) onSelect(idx);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!isDragging || loading) return;

        const idx = findNearestIndex(getFraction(e.clientX));
        if (idx !== null) onSelect(idx);
    }

    function endDrag(e: React.PointerEvent<HTMLDivElement>) {
        trackRef.current?.releasePointerCapture(e.pointerId);
        setIsDragging(false);
    }

    const selectedSnap =
        !isLive && selectedIndex !== null ? historySnapshots[selectedIndex] : undefined;

    const selectedValue = selectedCheckpoint?.value ?? 0;

    const selectedPodsLabel =
        selectedCheckpoint && selectedCheckpoint.totalPods > 0
            ? `${selectedCheckpoint.notReadyPods}/${selectedCheckpoint.totalPods} pods not ready`
            : null;

    const summaryLabel = isLive
        ? "Live graph state"
        : [
            fmtDetailTime(selectedSnap?.generatedAt ?? ""),
            fmtRequests(selectedValue),
            selectedPodsLabel,
        ]
            .filter(Boolean)
            .join(" \u00b7 ");

    return (
        <div
            style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "12px 14px 14px",
                fontFamily: '"IBM Plex Sans", Inter, system-ui, sans-serif',
                userSelect: "none",
                zIndex: 10,
            }}
        >
            <div
                style={{
                    position: "relative",
                    maxWidth: 960,
                    margin: "0 auto",
                    height: 124,
                    borderRadius: 20,
                    background: "linear-gradient(180deg, rgba(14,19,33,0.98) 0%, rgba(8,12,22,0.98) 100%)",
                    border: "1px solid rgba(51,65,85,0.7)",
                    boxShadow: "0 -12px 40px rgba(0,0,0,0.26)",
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background:
                            "radial-gradient(circle at 0% 0%, rgba(34,197,94,0.08), transparent 24%), radial-gradient(circle at 100% 0%, rgba(59,130,246,0.12), transparent 26%)",
                        pointerEvents: "none",
                    }}
                />

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px 2px",
                        gap: 12,
                    }}
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span
                            style={{
                                fontSize: 10,
                                letterSpacing: 1.4,
                                textTransform: "uppercase",
                                color: "#64748b",
                            }}
                        >
                            Namespace Traffic
                        </span>
                        <span
                            style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#e2e8f0",
                            }}
                        >
                            {summaryLabel}
                        </span>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 10,
                                color: "#64748b",
                            }}
                        >
                            Peak {fmtRequests(maxRequests)}
                        </span>
                        <button
                            onClick={() => onSelect(null)}
                            disabled={isLive}
                            style={{
                                padding: "5px 10px",
                                borderRadius: 999,
                                border: isLive ? "1px solid rgba(34,197,94,0.26)" : "1px solid rgba(71,85,105,0.85)",
                                background: isLive ? "rgba(34,197,94,0.16)" : "rgba(15,23,42,0.55)",
                                color: isLive ? "#dcfce7" : "#94a3b8",
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 1,
                                cursor: isLive ? "default" : "pointer",
                                fontFamily: '"IBM Plex Sans", Inter, system-ui, sans-serif',
                                flexShrink: 0,
                            }}
                        >
                            LIVE
                        </button>
                    </div>
                </div>

                <div
                    ref={trackRef}
                    style={{
                        position: "absolute",
                        left: 12,
                        right: 12,
                        top: 36,
                        bottom: 24,
                        borderRadius: 14,
                        background: "rgba(15,23,42,0.72)",
                        border: "1px solid rgba(51,65,85,0.82)",
                        overflow: "hidden",
                        touchAction: "none",
                        cursor: loading || checkpoints.length === 0 ? "default" : "crosshair",
                    }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                >
                    {!loading && timelinePoints.length > 0 && (
                        <svg
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            style={{
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                overflow: "hidden",
                                pointerEvents: "none",
                            }}
                        >
                            <defs>
                                <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="rgba(34,197,94,0.30)" />
                                    <stop offset="100%" stopColor="rgba(34,197,94,0.02)" />
                                </linearGradient>
                            </defs>
                            <path d={areaPath} fill="url(#trafficFill)" />
                            {lineRuns.map((run) => (
                                <path
                                    key={run.key}
                                    d={run.d}
                                    fill="none"
                                    stroke={run.color}
                                    strokeWidth={2}
                                    vectorEffect="non-scaling-stroke"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                            ))}
                        </svg>
                    )}

                    {loading && (
                        <div
                            style={{
                                position: "absolute",
                                inset: 12,
                                borderRadius: 8,
                                background:
                                    "linear-gradient(90deg, rgba(31,41,55,0.9) 0%, rgba(55,65,81,0.95) 50%, rgba(31,41,55,0.9) 100%)",
                            }}
                        />
                    )}

                    {/* Drag overlay – dims the track while the frame is computing */}
                    {isDragging && !loading && (
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                borderRadius: 14,
                                background: "rgba(8,12,22,0.35)",
                                pointerEvents: "none",
                                zIndex: 3,
                            }}
                        />
                    )}

                    {/* Guide line for the selected checkpoint */}
                    {!loading && selectedCheckpoint && (
                        <div
                            style={{
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                left: `${selectedCheckpoint.x}%`,
                                width: 1,
                                transform: "translateX(-50%)",
                                background:
                                    "linear-gradient(180deg, rgba(147,197,253,0.05) 0%, rgba(147,197,253,0.85) 100%)",
                                pointerEvents: "none",
                            }}
                        />
                    )}

                    {/* Live edge marker (newest checkpoint) */}
                    {!loading && isLive && liveCheckpoint && (
                        <div
                            style={{
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                left: `${liveCheckpoint.x}%`,
                                width: 1,
                                transform: "translateX(-50%)",
                                background:
                                    "linear-gradient(180deg, rgba(34,197,94,0.05) 0%, rgba(34,197,94,0.7) 100%)",
                                pointerEvents: "none",
                            }}
                        />
                    )}

                    {!loading && isLive && liveCheckpoint && (
                        <div
                            style={{
                                position: "absolute",
                                top: 4,
                                left: `${liveCheckpoint.x}%`,
                                transform: "translateX(-100%)",
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: 0.6,
                                color: "#dcfce7",
                                whiteSpace: "nowrap",
                                pointerEvents: "none",
                                background: "rgba(8,12,22,0.96)",
                                padding: "2px 6px",
                                borderRadius: 6,
                                border: "1px solid rgba(34,197,94,0.45)",
                                zIndex: 4,
                            }}
                        >
                            LIVE
                        </div>
                    )}

                    {/* Clickable checkpoints, sitting directly on the curve */}
                    {!loading &&
                        checkpoints.map((point, i) => {
                            if (!visibleDots.has(i)) return null;
                            const isSelected = i === selectedIndex;
                            const isLiveDot = isLive && i === liveIndex;
                            const size = isSelected ? 12 : isLiveDot ? 9 : 4;
                            const background = isSelected
                                ? "#3b82f6"
                                : isLiveDot
                                    ? "#22c55e"
                                    : "rgba(74,222,128,0.85)";
                            const border = isSelected
                                ? "2px solid #bfdbfe"
                                : isLiveDot
                                    ? "2px solid #bbf7d0"
                                    : "1px solid rgba(8,12,22,0.85)";
                            const boxShadow = isSelected
                                ? "0 0 0 4px rgba(59,130,246,0.18)"
                                : isLiveDot
                                    ? "0 0 0 4px rgba(34,197,94,0.20)"
                                    : "none";
                            return (
                                <div
                                    key={point.generatedAt}
                                    style={{
                                        position: "absolute",
                                        left: `${point.x}%`,
                                        top: `${point.y}%`,
                                        width: size,
                                        height: size,
                                        marginLeft: -size / 2,
                                        marginTop: -size / 2,
                                        borderRadius: "50%",
                                        background,
                                        border,
                                        boxShadow,
                                        transition: isDragging
                                            ? "none"
                                            : "left 0.1s ease, top 0.1s ease",
                                        pointerEvents: "none",
                                        zIndex: isSelected ? 3 : isLiveDot ? 2 : 1,
                                    }}
                                />
                            );
                        })}

                    {/* Floating tag for the selected checkpoint */}
                    {!loading && selectedCheckpoint && selectedSnap && (
                        <div
                            style={{
                                position: "absolute",
                                top: 4,
                                left: `${selectedCheckpoint.x}%`,
                                transform:
                                    selectedCheckpoint.x > 82
                                        ? "translateX(-100%)"
                                        : selectedCheckpoint.x < 18
                                            ? "translateX(0)"
                                            : "translateX(-50%)",
                                fontSize: 10,
                                fontWeight: 600,
                                color: "#e2e8f0",
                                whiteSpace: "nowrap",
                                pointerEvents: "none",
                                background: "rgba(8,12,22,0.96)",
                                padding: "3px 7px",
                                borderRadius: 6,
                                border: "1px solid rgba(59,130,246,0.4)",
                                zIndex: 4,
                            }}
                        >
                            {fmtDetailTime(selectedSnap.generatedAt)} · {fmtRequests(selectedValue)}
                            {selectedPodsLabel ? ` · ${selectedPodsLabel}` : ""}
                        </div>
                    )}

                    {!loading && timelinePoints.length === 0 && !timelineError && (
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                display: "grid",
                                placeItems: "center",
                                fontSize: 10,
                                color: "#64748b",
                                pointerEvents: "none",
                            }}
                        >
                            No traffic data in selected range
                        </div>
                    )}

                    {!loading && timelineError && (
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                display: "grid",
                                placeItems: "center",
                                fontSize: 10,
                                color: "#fca5a5",
                                pointerEvents: "none",
                            }}
                        >
                            Failed to load timeline
                        </div>
                    )}
                </div>

                {/* Axis time labels below the plot */}
                <div
                    style={{
                        position: "absolute",
                        left: 14,
                        right: 14,
                        bottom: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 10,
                        color: "#64748b",
                        pointerEvents: "none",
                    }}
                >
                    <span>{fmtTime(windowStartMs)}</span>
                    <span style={{ color: "#475569" }}>Requests/sec · click to inspect</span>
                    <span>{fmtTime(windowEndMs)}</span>
                </div>
            </div>
        </div>
    );
}
