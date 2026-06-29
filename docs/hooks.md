# Hooks

Custom hooks in [src/hooks](../src/hooks). They split into **data-fetching** hooks
(backend access) and **interaction** hooks (canvas behaviour).

## Data-fetching

### useGraphSubscription()
[useGraphSubscription.ts](../src/hooks/useGraphSubscription.ts)
Returns `{ snapshots, lastRefreshAt, status, error }`. Fetches the initial snapshot
from `/api/graph`, then subscribes to `/api/graph/stream` (SSE) for live updates.
Handles `message` and `graph-update` events; ignores malformed payloads. Status:
`idle → subscribing → connected → error`. On reconnect (when `onopen` fires after
an `onerror`), re-fetches `/api/graph` to backfill any snapshots missed during the
disconnect. Cleans up the `EventSource` and aborts the initial fetch on unmount.

### useHistoryRange(namespace)
[useHistoryRange.ts](../src/hooks/useHistoryRange.ts)
Returns `{ historySnapshots, loading, error, windowStartMs, windowEndMs, refresh }`.
Loads a rolling **1-hour** history window from `/api/graph/history`. The window
**start is anchored at mount** so `scrubIndex` values stay valid; re-polls every
**30s** while live. Live polls fetch **incrementally** (only snapshots newer than
the latest one held) and merge/dedupe by `generatedAt`, so the full window is
downloaded only on the initial load. `namespace = null` disables fetching (e.g. mock mode).

### useNamespaceRequestTimeline(namespace, startMs, endMs)
[useNamespaceRequestTimeline.ts](../src/hooks/useNamespaceRequestTimeline.ts)
Returns `{ points, loading, error }` — per-timestamp totals (requests / pods /
not-ready pods) for the scrubber strip. `App` falls back to deriving these from
history snapshots when the backend returns no points.

### useNodeHistory(nodeId, namespace)
[useNodeHistory.ts](../src/hooks/useNodeHistory.ts)
Returns `NodeHistoryData` ({ points, loading, error }) used by
`NodeDetailModal`. Aggregates per-node restart, resource-metrics, and request-rate
history from their respective endpoints.

## Interaction

### useZoomPan(svgRef, bounds)
[useZoomPan.ts](../src/hooks/useZoomPan.ts)
Returns `{ zoom, pan, isPanning, handleMouseDown, handleMouseMove, handleMouseUp }`.
Wheel-to-zoom and drag-to-pan, clamped to the computed bounds. On first mount it
centers the graph's bounds in the viewport (once) so nodes appear in the middle of
the screen instead of the top-left.

### useHoverState(nodes, edges)
[useHoverState.ts](../src/hooks/useHoverState.ts)
Manages hover, highlight, selection, and focus mode. Returns hovered/highlighted
sets plus `selectedNodeId`, `isFocusMode`, `toggleSelectedNode`, `clearSelection`,
and the hover setters. Hovering a node highlights its connected nodes and edges;
clicking selects it and enters focus mode.

### useEdgePicking(edgeItems, corridorItems?)
[useEdgePicking.ts](../src/hooks/useEdgePicking.ts)
Returns `{ pickAt }`. Hit-tests a screen point against edge polylines
(`[start, ...waypoints, end]`) and corridor trunks by distance, returning the
closest pickable edge — used to open the edge popover on click.

### useChangeFlash(value)
[useChangeFlash.ts](../src/hooks/useChangeFlash.ts)
Returns a counter that starts at `0` and increments whenever `value` changes
between renders (compared with `Object.is`). Used as the `key` of a transient
overlay element so it remounts — replaying its one-shot flash keyframe — each
time a tracked metric or status changes. `GraphEdge` tracks load
(width/colour/rps); `GraphNode` tracks roll-up health; `PodMiniCard` tracks
pod phase.
