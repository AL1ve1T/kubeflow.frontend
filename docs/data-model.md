# Data model

All DTOs live in [src/models](../src/models) and are re-exported from
[src/models/index.ts](../src/models/index.ts). They mirror the backend contract —
the frontend does not invent fields.

## GraphSnapshot

[src/models/GraphSnapshot.ts](../src/models/GraphSnapshot.ts) — one snapshot of a
namespace at a point in time.

```ts
interface GraphSnapshot {
    namespace: string;
    nodes: NodeDto[];
    edges: EdgeDto[];
    generatedAt: string; // ISO timestamp
}
```

## NodeDto

[src/models/NodeDto.ts](../src/models/NodeDto.ts) — a workload (service) or an
input boundary.

```ts
interface NodeDto {
    id: string;
    name: string;
    type: NodeType;
    podPhase: PodPhase;
    podCount: number;
    restartCount: number;
    lastRestartAt: string | null;
    lastRestartReason: string | null;
    lastSeenAt: string;
    pods: PodDto[] | null; // null on older history snapshots → treat as []
}

enum NodeType { SERVICE, DATABASE, CACHE, QUEUE, GATEWAY, INPUT }
type PodPhase = "RUNNING" | "PENDING" | "NOT_READY" | "CRASH_LOOP" | "FAILED" | "UNKNOWN";
```

- `INPUT` nodes are rendered as the left-hand entry **bar**, not a rounded card.
- **CPU/RAM live on pods, not on the node** — a workload has no CPU/RAM of its own.

## PodDto

[src/models/PodDto.ts](../src/models/PodDto.ts) — a single replica under a workload.

```ts
interface PodDto {
    podName: string;
    cpuUtilization: number;    // ratio [0..1]; exact 0.0 means "no fresh sample"
    memoryUtilization: number; // ratio [0..1]
    podPhase: PodPhase;
    restartCount: number;
    lastRestartAt: string | null;
    lastRestartReason: string | null;
    lastSeenAt: string;
}
```

> Pods carry **only resource + health** signals. Traffic (RPS / latency / errors)
> belongs to the workload **edge** and is never attributed to a single pod, because
> Kubernetes load-balances requests across pods at the network layer.

## EdgeDto

[src/models/EdgeDto.ts](../src/models/EdgeDto.ts) — directional service-to-service
communication.

```ts
interface EdgeDto {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    protocol: string;
    requestsPerSecond: number;
    averageLatencyMs: number;
    maxLatencyMs: number;
    errorCount: number;
    errorRate: number;        // [0..1]
    loadLevel: LoadLevel;
    lastSeenAt: string;
}

type LoadLevel = "NORMAL" | "ELEVATED" | "HIGH" | "CRITICAL";
```

## Timeline / history DTOs

| Type | File | Purpose |
| --- | --- | --- |
| `NamespaceRequestTimelinePoint` | [NamespaceRequestTimelinePoint.ts](../src/models/NamespaceRequestTimelinePoint.ts) | Per-timestamp totals (requests, pods, not-ready pods) for the scrubber |
| `RequestRatePointDto` | [RequestRatePointDto.ts](../src/models/RequestRatePointDto.ts) | Per-node request-rate history |
| `ResourceMetricsPointDto` | [ResourceMetricsPointDto.ts](../src/models/ResourceMetricsPointDto.ts) | Per-node CPU/RAM history |
| `RestartEventDto` | [RestartEventDto.ts](../src/models/RestartEventDto.ts) | Per-node restart events |

These power the node detail charts ([useNodeHistory](../src/hooks/useNodeHistory.ts))
and the namespace timeline strip in the scrubber.

## Compatibility notes

- `NodeDto.pods` may be `null` on history snapshots persisted **before** replica-set
  support was added — always coerce to `[]`.
- `cpuUtilization` / `memoryUtilization` of exactly `0.0` means "no fresh sample",
  not literally 0% — don't render it as a healthy zero-load reading.
