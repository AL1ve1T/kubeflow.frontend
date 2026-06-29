# Visual language

How backend metrics map to on-screen styling. The UI is a clean, observability-style
layout: a left control sidebar, a pannable/zoomable SVG canvas of column-arranged
nodes, and a bottom history scrubber.

## Nodes

- **Workload nodes**: rounded rectangles (`BORDER_RADIUS=12`), header with the
  service name and `×podCount`, and inner **pod mini-cards** (per-pod CPU/RAM/health).
- **INPUT nodes**: rendered as the left-hand entry **bar** (`BAR_WIDTH=40`), not a
  card.
- Node height grows with pod count so replicas are always visible.
- Pod readiness color (per [healthColor.ts](../src/helpers/healthColor.ts)):

  | Ratio of not-ready pods | Color |
  | --- | --- |
  | 0 (all ready) | green `#4ade80` |
  | partial | amber `#f59e0b` |
  | 1 (all not-ready) | red `#ef4444` |

## Edges

Edges are **directional**, animated with a dashed flow to indicate direction.

### Color — worst-of(load, error)
`colorFromMetrics(errorRate, loadLevel, rps)`:

| Severity | Condition | Color |
| --- | --- | --- |
| critical | `loadLevel=CRITICAL` or `errorRate ≥ 0.15` | red `#ef4444` |
| high | `loadLevel=HIGH` or `errorRate ≥ 0.05` | orange `#f97316` |
| elevated | `loadLevel=ELEVATED` or `errorRate ≥ 0.005` | yellow `#eab308` |
| healthy | otherwise | green `#22c55e` |
| inactive | `rps === 0` | grey `#9ca3af` |

Severity is `max(loadSeverity, errorSeverity)` — the worst signal wins.

### Width — proportional to load
`relativeEdgeWidth(rps, maxRps)`: inactive edges are thin (1.5px); active edges
scale **2–10px** with `rps / maxRps`. So **low load → thin, high load → thick**,
matching the project's "thin green / thick red" intent.

### Tiers
`getEdgeTier(edge)` classifies prominence: `primary` (HIGH/CRITICAL),
`secondary` (ELEVATED), `background` (near-idle). The `showInactiveEdges` toggle
hides `rps === 0` edges entirely.

### Hub tint (hub-corridor strategy)
Segments leaving an **OUT** hub are tinted amber; segments arriving at an **IN** hub
are tinted indigo.

## Change animations

Graph mutations are eased in with subtle motion (keyframes in
[animations.ts](../src/helpers/animations.ts)):

- **New node / pod / edge** — fades (and slightly scales/slides) in on first appearance.
- **Edge load change** — a brief brightened pulse runs along the path when width/colour/rps changes.
- **Status change** — a coloured ring pulses around a node (roll-up health) or pod (phase).

These replay via [useChangeFlash](../src/hooks/useChangeFlash.ts) whenever the tracked
value changes; the perpetual dashed edge flow is unrelated (`EDGE_FLOW_KEYFRAME`).

## Canvas chrome

- Dot-grid background; area outside the node bounding box is greyed via an SVG mask.
- Dashed vertical separators between columns.
- Column labels pinned to the top of the screen, following their column as you pan.
- **Focus mode**: clicking a node dims the rest and shows a "Focus: \<node\>" banner
  with an × to exit.
