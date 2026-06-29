/**
 * Shared CSS keyframes for graph change animations.
 *
 * Entrance keyframes play once when an element first mounts (a new node, pod,
 * or edge appearing in a snapshot). Flash keyframes are replayed on demand via
 * a remounting overlay element (see useChangeFlash) when an existing element's
 * load or status changes.
 */
export const KF_NODE_APPEAR = "kf-node-appear";
export const KF_POD_APPEAR = "kf-pod-appear";
export const KF_EDGE_APPEAR = "kf-edge-appear";
export const KF_STATUS_FLASH = "kf-status-flash";
export const KF_LOAD_FLASH = "kf-load-flash";

/** Full keyframe CSS injected once at the canvas root. */
export const GRAPH_ANIMATION_CSS = `
@keyframes ${KF_NODE_APPEAR} { from { opacity: 0; transform: scale(0.82); } to { opacity: 1; transform: scale(1); } }
@keyframes ${KF_POD_APPEAR} { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ${KF_EDGE_APPEAR} { from { opacity: 0; } to { opacity: 1; } }
@keyframes ${KF_STATUS_FLASH} { from { opacity: 0.85; transform: scale(1); } to { opacity: 0; transform: scale(1.16); } }
@keyframes ${KF_LOAD_FLASH} { from { opacity: 0.55; } to { opacity: 0; } }
`;
