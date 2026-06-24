# kubeflow.frontend — Documentation

Frontend for a Kubernetes observability tool. It renders **service-to-service
communication** as a column-based topology graph, styles edges by load / latency /
errors, and lets the user scrub through historical graph snapshots.

The backend is the **source of truth**. The frontend only renders processed
snapshots (nodes + edges + per-pod metrics) — it never ingests or recomputes
telemetry.

## Tech stack

- **React 19** + **TypeScript** (`~5.8`)
- **Vite 6** for dev/build
- No UI framework — rendering is hand-rolled **SVG** with inline styles
- No state library — local `useState` + custom hooks

## Quick start

```bash
npm install
npm run dev      # vite dev server
npm run build    # tsc -b && vite build
npm run preview  # preview production build
```

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8080` | Backend base URL |
| `VITE_GRAPH_SNAPSHOT_PATH` | `/api/graph` | REST snapshot endpoint |
| `VITE_GRAPH_STREAM_PATH` | `/api/graph/stream` | SSE live-update endpoint |

> `USE_MOCK` in [src/App.tsx](../src/App.tsx) toggles a static
> [mockSnapshot](../src/data/mockSnapshot.ts) instead of hitting the backend —
> useful for offline UI work.

## Documentation index

| Doc | Contents |
| --- | --- |
| [architecture.md](architecture.md) | System context, data flow, directory layout |
| [data-model.md](data-model.md) | DTOs: snapshot, node, edge, pod, timeline points |
| [backend-api.md](backend-api.md) | Endpoints consumed and the response contract |
| [rendering-pipeline.md](rendering-pipeline.md) | Snapshot → columns → layout → edges → SVG |
| [strategies.md](strategies.md) | Pluggable topology layout strategies |
| [components.md](components.md) | React component reference |
| [hooks.md](hooks.md) | Custom hooks reference |
| [helpers.md](helpers.md) | Geometry / edge / color helper reference |
| [visual-language.md](visual-language.md) | Colors, widths, and metric → style mapping |
