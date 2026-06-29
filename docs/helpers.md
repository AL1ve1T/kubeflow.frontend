# Helpers

Pure utilities in [src/helpers](../src/helpers). No React, no side effects — safe to
unit test in isolation.

## nodeGeometry.ts
[nodeGeometry.ts](../src/helpers/nodeGeometry.ts) — node sizing and edge ports.

Constants: `NODE_WIDTH=160`, `NODE_HEIGHT=56`, `BORDER_RADIUS=12`, `BAR_WIDTH=40`
(INPUT bar), `HUB_WIDTH=20`, `PORT_GAP=6`, `PORT_PADDING=12`,
`CANVAS_BAR_HEIGHT=600`, plus pod-card layout: `NODE_HEADER_H=24`,
`POD_CARD_H=34`, `POD_CARD_GAP=5`, `POD_AREA_PAD=8`.

| Function | Purpose |
| --- | --- |
| `getWorkloadNodeHeight(podN)` | Node height grows with pod count |
| `getStreamWidth(rps)` | Edge stroke width from RPS |
| `getNodeCenterY(node, position)` | Vertical center (INPUT bar vs workload) |
| `buildNodeGeometries(nodes, edges, nodeCols)` | Per-node `{ width, height }` map |
| `buildEdgeTargetPorts(...)` | Distributes incoming edges across a node's left ports |

Types: `Position`, `NodeGeometry`, `EdgePort`.

## edgeHelpers.ts
[edgeHelpers.ts](../src/helpers/edgeHelpers.ts) — edge classification, color, width,
and the shared edge-build machinery.

| Export | Purpose |
| --- | --- |
| `getEdgeTier(edge)` | `primary` (HIGH/CRITICAL) / `secondary` (ELEVATED) / `background` |
| `colorFromMetrics(errorRate, loadLevel, rps)` | Worst-of(load, error) → green/yellow/orange/red; grey if `rps===0` |
| `relativeEdgeWidth(rps, maxRps)` | 1.5px inactive, else 2–10px proportional |
| `buildEdgeRenderItems(...)` | Core builder shared by strategies → `BuildEdgeResult` |

Types: `EdgeTier`, `EdgeRenderItem`, `CorridorRenderItem`, `BuildEdgeResult`.

`EdgeRenderItem` carries `path`, `start`/`end`, optional `waypoints` (for bezier
picking), `color`, `width`, `rps`, `edgeIds`, `showEndDot`, and optional
`hubTint` (`"out"` amber / `"in"` indigo). `CorridorRenderItem` is a vertical trunk
with `x`, `minY`/`maxY`, `color`, `width` (12–30px by total RPS), and `edgeIds`.

## animations.ts
[animations.ts](../src/helpers/animations.ts) — shared CSS keyframes for graph
change animations. Exports keyframe-name constants (`KF_NODE_APPEAR`,
`KF_POD_APPEAR`, `KF_EDGE_APPEAR`, `KF_STATUS_FLASH`, `KF_LOAD_FLASH`) and
`GRAPH_ANIMATION_CSS`, the keyframe block injected once by `TopologyCanvas`.
Entrance keyframes (`*_APPEAR`) play once when a node/pod/edge first mounts;
flash keyframes pulse-and-fade an overlay that is replayed on demand via
[useChangeFlash](../src/hooks/useChangeFlash.ts) when load or status changes.

## healthColor.ts
[healthColor.ts](../src/helpers/healthColor.ts) — pod readiness color.

| Function | Purpose |
| --- | --- |
| `unhealthyRatio(notReady, total)` | not-ready / total clamped to [0..1] |
| `readinessColor(ratio)` | green `#4ade80` → amber `#f59e0b` → red `#ef4444` gradient (`lerpHex`) |

## columnHelpers.ts
[columnHelpers.ts](../src/helpers/columnHelpers.ts) — column label text and the
screen-X projection used to pin DOM column labels above their SVG columns under the
current pan/zoom.

## timeAgo.ts
[timeAgo.ts](../src/helpers/timeAgo.ts) — `formatTimeAgo(timestampMs, nowMs?)`
renders relative "x ago" strings (used for last-refresh text).
