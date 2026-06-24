# kubeflow.frontend

Frontend for a Kubernetes observability tool. It renders **service-to-service
communication** as a column-based topology graph, styles edges by load / latency /
errors, and lets you scrub through historical graph snapshots.

The backend is the **source of truth** — the frontend only renders processed
snapshots (nodes + edges + per-pod metrics). It never ingests or recomputes
telemetry.

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

`USE_MOCK` in [src/App.tsx](src/App.tsx) renders a static
[mockSnapshot](src/data/mockSnapshot.ts) for offline UI work.

## Documentation

Full documentation lives in [docs/](docs/README.md):

| Doc | Contents |
| --- | --- |
| [docs/README.md](docs/README.md) | Overview + doc index |
| [docs/architecture.md](docs/architecture.md) | System context, data flow, directory layout |
| [docs/data-model.md](docs/data-model.md) | DTOs: snapshot, node, edge, pod, timeline points |
| [docs/backend-api.md](docs/backend-api.md) | Endpoints consumed and the response contract |
| [docs/rendering-pipeline.md](docs/rendering-pipeline.md) | Snapshot → columns → layout → edges → SVG |
| [docs/strategies.md](docs/strategies.md) | Pluggable topology layout strategies |
| [docs/components.md](docs/components.md) | React component reference |
| [docs/hooks.md](docs/hooks.md) | Custom hooks reference |
| [docs/helpers.md](docs/helpers.md) | Geometry / edge / color helper reference |
| [docs/visual-language.md](docs/visual-language.md) | Metric → style mapping |

> **Keep docs in sync.** When you change code, update the matching file under
> `docs/`. See the documentation policy in
> [.github/copilot-instructions.md](.github/copilot-instructions.md).
