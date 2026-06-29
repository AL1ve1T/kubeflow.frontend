import { useRef } from "react";

/**
 * Returns a counter that increments whenever `value` changes between renders
 * (it stays at 0 on the initial mount). Use the returned value as the `key` of
 * a transient overlay element so it remounts — and replays its one-shot CSS
 * animation — each time the tracked metric or status changes.
 */
export function useChangeFlash(value: unknown): number {
    const prev = useRef(value);
    const count = useRef(0);
    if (!Object.is(prev.current, value)) {
        prev.current = value;
        count.current += 1;
    }
    return count.current;
}
