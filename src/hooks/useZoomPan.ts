import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface Pan {
    x: number;
    y: number;
}

interface Bounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const PAN_MARGIN = 200;

/**
 * Clamp pan so the viewport stays within PAN_MARGIN of bounds
 */
function clampPan(p: Pan, z: number, bounds: Bounds, vw: number, vh: number): Pan {
    const minPanX = vw - (bounds.maxX * z) - PAN_MARGIN;
    const maxPanX = -(bounds.minX * z) + PAN_MARGIN;
    const minPanY = vh - (bounds.maxY * z) - PAN_MARGIN;
    const maxPanY = -(bounds.minY * z) + PAN_MARGIN;

    return {
        x: Math.min(maxPanX, Math.max(minPanX, p.x)),
        y: Math.min(maxPanY, Math.max(minPanY, p.y)),
    };
}

/**
 * Hook for zoom and pan state management
 */
export function useZoomPan(
    svgRef: React.RefObject<SVGSVGElement>,
    bounds: Bounds,
) {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

    // Center the graph in the viewport once, on first mount, so nodes appear in
    // the middle of the screen instead of anchored at the world origin (top-left).
    const hasCenteredRef = useRef(false);
    useLayoutEffect(() => {
        if (hasCenteredRef.current) return;
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) return;

        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        setPan({
            x: rect.width / 2 - centerX * zoom,
            y: rect.height / 2 - centerY * zoom,
        });
        hasCenteredRef.current = true;
    }, [bounds, svgRef, zoom]);

    // Coalesce pan updates to one per animation frame so a burst of mousemove
    // events does not trigger a full canvas re-render on every pointer sample.
    const panRafRef = useRef<number | null>(null);
    const pendingPanRef = useRef<Pan | null>(null);

    // Refs for closures in wheel listener
    const zoomState = useRef({ zoom, pan });
    zoomState.current = { zoom, pan };

    // Setup wheel listener with Ctrl-only zoom
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return;
            e.preventDefault();

            const rect = svg.getBoundingClientRect();
            const vw = rect.width;
            const vh = rect.height;
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;

            const { zoom: z, pan: p } = zoomState.current;
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
            const ratio = newZoom / z;

            const rawPan = {
                x: cursorX - ratio * (cursorX - p.x),
                y: cursorY - ratio * (cursorY - p.y),
            };
            const clampedPan = clampPan(rawPan, newZoom, bounds, vw, vh);
            setPan(clampedPan);
            setZoom(newZoom);
        };

        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => svg.removeEventListener("wheel", onWheel);
    }, [bounds]);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0) return;
            setIsPanning(true);
            panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        },
        [pan],
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isPanning) return;
            const svg = svgRef.current;
            if (!svg) return;

            const rect = svg.getBoundingClientRect();
            const vw = rect.width;
            const vh = rect.height;
            const rawPan = {
                x: panStart.current.panX + (e.clientX - panStart.current.x),
                y: panStart.current.panY + (e.clientY - panStart.current.y),
            };
            pendingPanRef.current = clampPan(rawPan, zoom, bounds, vw, vh);

            if (panRafRef.current === null) {
                panRafRef.current = requestAnimationFrame(() => {
                    panRafRef.current = null;
                    if (pendingPanRef.current) setPan(pendingPanRef.current);
                });
            }
        },
        [isPanning, zoom, bounds],
    );

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        if (panRafRef.current !== null) {
            cancelAnimationFrame(panRafRef.current);
            panRafRef.current = null;
        }
        if (pendingPanRef.current) {
            setPan(pendingPanRef.current);
            pendingPanRef.current = null;
        }
    }, []);

    // Cancel any pending pan frame on unmount.
    useEffect(() => {
        return () => {
            if (panRafRef.current !== null) cancelAnimationFrame(panRafRef.current);
        };
    }, []);

    return {
        zoom,
        pan,
        isPanning,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
    };
}
