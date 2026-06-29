# Components

All components are in [src/components](../src/components). Rendering is SVG-based
with inline styles. Frequently re-rendered components (`GraphNode`, `GraphEdge`,
`GraphCorridor`, `TimelineScrubber`) are wrapped in `React.memo`.

## Layout

### App
[App.tsx](../src/App.tsx) — top-level layout and state wiring. Owns selected
namespace, active strategy, `showInactiveEdges`, and `scrubIndex`. Computes the
`activeSnapshot` (live snapshot for the namespace, or history snapshot at
`scrubIndex`) and a fallback namespace timeline derived from history when the
backend timeline is empty. Renders `ControlPanel`, `TopologyCanvas`, and
`TimelineScrubber`. The snapshot handed to `TopologyCanvas` is passed through
`useDeferredValue`, so the expensive layout recompute runs as an interruptible
background transition and the rest of the UI stays responsive while a snapshot
loads; an "Updating…" badge shows while the deferred render is in progress. On
first open, a full-screen **loading overlay** masks the initial first-layout
computation until the first snapshot has rendered; it never reappears for
subsequent updates.

### ControlPanel
[ControlPanel.tsx](../src/components/ControlPanel.tsx) — left sidebar (220px).
Strategy selector, namespace selector, connection status, last-refresh text, and
the "show inactive edges" toggle.

### TimelineScrubber
[TimelineScrubber.tsx](../src/components/TimelineScrubber.tsx) — bottom history
strip. Shows the namespace request timeline and lets the user scrub to a history
snapshot (`onSelect(index)`); `null` index = live mode. Has a refresh button and
shows loading / error states. Curve geometry is memoized; each history
checkpoint is matched to its nearest timeline point via **binary search** over
pre-parsed timestamps (the timeline points are sorted ascending), so loading a
full history window stays cheap instead of running an O(history × points) scan.

## Canvas

### TopologyCanvas
[TopologyCanvas.tsx](../src/components/TopologyCanvas.tsx) — the core renderer.
Runs the [rendering pipeline](rendering-pipeline.md): column assignment, geometry,
layout, strategy build, bounds, and SVG composition. Wires up zoom/pan, hover,
selection/focus mode, and edge picking. Hosts the edge popover, node detail modal,
and focus-mode banner.

Props: `{ snapshot, strategyId, showInactiveEdges? }`.

### GraphNode
[GraphNode.tsx](../src/components/GraphNode.tsx) — one node. Workload nodes are
rounded rectangles with a header (name + `×podCount`) and inner **pod mini-cards**
showing per-pod CPU/RAM/health. `INPUT` nodes render as the left entry bar.
Renders IN/OUT hub capsules when the strategy enables them
(`hasRightOut` / `hasRightIn` / `hasLeftIn`). `memo`-ized. New nodes fade/scale in
on mount; a health-status change pulses a coloured ring around the node, and each
pod mini-card fades in on appearance and pulses on a phase change (via
[useChangeFlash](../src/hooks/useChangeFlash.ts)).

### GraphEdge
[GraphEdge.tsx](../src/components/GraphEdge.tsx) — one edge stub/branch as an SVG
path. Animated dashed flow (`DASH_PERIOD = 52`, `EDGE_FLOW_KEYFRAME = "edge-flow"`)
indicates direction; width and color come from the metric mapping. Optional end
dot and hub tint. `memo`-ized. New edges fade in on mount; a load change
(width/colour/rps) replays a brief brightened pulse along the path (via
[useChangeFlash](../src/hooks/useChangeFlash.ts)).

### GraphCorridor
[GraphCorridor.tsx](../src/components/GraphCorridor.tsx) — a shared vertical
corridor trunk (hub-corridor strategy). Rendered behind edges. `memo`-ized.

## Overlays

### EdgePopover
[EdgePopover.tsx](../src/components/EdgePopover.tsx) — small popover on edge click:
protocol, RPS, average/max latency, error count/rate. Positioned at `{x, y}`.

### NodePopover
[NodePopover.tsx](../src/components/NodePopover.tsx) — hover/click popover for a
node: per-pod metrics plus incoming/outgoing edge summaries.

### NodeDetailModal
[NodeDetailModal.tsx](../src/components/NodeDetailModal.tsx) — full node detail.
Loads history via [useNodeHistory](../src/hooks/useNodeHistory.ts) and renders
CPU/RAM, request-rate, and restart history charts, a per-pod replica panel
(resource + health only — never traffic), and incoming/outgoing edge lists.
Props include `node`, `outgoingEdges`, `incomingEdges`, `nodeMap`, `namespace`,
`onClose`.
