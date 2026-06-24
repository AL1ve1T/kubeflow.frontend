# Backend API

All requests go through [src/api/graphApi.ts](../src/api/graphApi.ts).
URLs are built with `buildApiUrl(path)` against `VITE_API_BASE_URL`
(default `http://localhost:8080`).

## Endpoints

| Method | Path | Used by | Returns |
| --- | --- | --- | --- |
| GET | `/api/graph` | `useGraphSubscription` (initial) | `GraphSnapshot[]` |
| SSE | `/api/graph/stream` | `useGraphSubscription` (live) | `GraphSnapshot[]` per event |
| GET | `/api/graph/history?from&to&namespace` | `useHistoryRange` | `GraphSnapshot[]` |
| GET | `/api/nodes/{id}/restarts?from&to&namespace` | `fetchRestartTimeline` | `RestartEventDto[]` |
| GET | `/api/nodes/{id}/resource-metrics?from&to&namespace` | `fetchResourceMetrics` | `ResourceMetricsPointDto[]` |
| GET | `/api/nodes/{id}/request-rate?from&to&namespace` | `fetchRequestRate` | `RequestRatePointDto[]` |
| GET | `/api/namespaces/{ns}/request-timeline?from&to` | `fetchNamespaceRequestTimeline` | `NamespaceRequestTimelinePoint[]` |

`from` / `to` are ISO timestamps; `namespace` scopes node-level history queries.
Path segments are `encodeURIComponent`-escaped.

## Live subscription contract

`useGraphSubscription`:

1. `GET /api/graph` once for the initial state.
2. Opens an `EventSource` on `/api/graph/stream`.
3. Handles **both** unnamed `message` events and named `graph-update` events.
4. Each event body is JSON that resolves (via `extractGraphSnapshots`) to a
   `GraphSnapshot[]`. Malformed payloads are ignored; the stream waits for the
   next event.
5. On error it sets status `error` and surfaces a "connection lost" message while
   the browser auto-reconnects.

Status values: `idle → subscribing → connected → error`.

## Response parsing (defensive)

`extractGraphSnapshots(payload)` tolerates several backend shapes so the UI is
resilient to wrapping:

- a bare `GraphSnapshot[]`
- a single `GraphSnapshot` object
- a wrapper object containing one of the keys
  `snapshot`, `graphSnapshot`, `graph`, `state`, `payload`, `data`
  (each either a snapshot or an array of snapshots)

`isGraphSnapshotLike` validates that `nodes` and `edges` are arrays.
`normalizeSnapshot` fills a missing `namespace` with `""` and a missing/empty
`generatedAt` with the current time.

## History windowing

`useHistoryRange` requests a rolling **1-hour** window. The window **start is
anchored at mount** and never advances, so existing `scrubIndex` values stay valid
as new snapshots are appended. While live it re-fetches every **30s**.
