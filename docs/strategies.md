# Topology strategies

A **strategy** encapsulates how a graph snapshot is turned into renderable edges
and corridors. Strategies are pluggable so the layout can change without touching
the canvas. They live in [src/strategies](../src/strategies) and are registered in
[src/strategies/index.ts](../src/strategies/index.ts).

## The interface

[topologyStrategy.ts](../src/strategies/topologyStrategy.ts):

```ts
interface TopologyStrategy {
    id: string;                // stable id (persistence / URL params)
    label: string;             // shown in the ControlPanel
    description?: string;      // tooltip
    hideHubCapsules?: boolean; // omit IN/OUT hub capsule indicators on nodes

    adjustPositions?(positions, nodes, nodeCols, nodeGeometries): Record<string, Position>;

    build(nodes, edges, positions, nodeMap, nodeCols, colSpacing, nodeGeometries): BuildEdgeResult;
}
```

- `adjustPositions` (optional) runs **after** the default linear layout and
  **before** edges are built. It returns a new positions map.
- `build` produces the render-ready `{ edgeItems, corridorItems }`
  (`BuildEdgeResult`).

## Registered strategies

| id | label | hubCapsules | Summary |
| --- | --- | --- | --- |
| `hub-corridor` | Hub Corridor | shown | Shares vertical corridor trunks between columns; directional IN/OUT hub capsules on each node's right side. |
| `arc-column` | Arc Column | hidden | Nodes within a column bow into a C-arc (middle pushed left, top/bottom flush right); same-column edges sweep through the arc bowl, cross-column edges flow as S-curves. **Default.** |

`DEFAULT_STRATEGY_ID = arcColumnStrategy.id` (`arc-column`).
`getStrategy(id)` falls back to `hubCorridorStrategy` for unknown ids.

### hub-corridor

[hubCorridorStrategy.ts](../src/strategies/hubCorridorStrategy.ts) — routes edges
into shared vertical **corridor trunks** between columns and renders directional
hub capsules (amber OUT / indigo IN) on the right edge of each node. Trunk width
grows with total RPS (bounded 12–30px).

### arc-column

[arcColumnStrategy.ts](../src/strategies/arcColumnStrategy.ts) — bows each column
into a C-arc and draws edges as cubic beziers. Same-column bidirectional pairs are
offset by `BIDIR_BOWL_OFFSET` (20px) so the two curves stay visually and pickably
distinct. Provides bezier sample waypoints for the edge picker.

## Adding a strategy

1. Create `src/strategies/myStrategy.ts` exporting a `TopologyStrategy`.
2. Register it in [src/strategies/index.ts](../src/strategies/index.ts) by adding
   it to `TOPOLOGY_STRATEGIES`.
3. It appears automatically in the [ControlPanel](../src/components/ControlPanel.tsx)
   strategy selector.
