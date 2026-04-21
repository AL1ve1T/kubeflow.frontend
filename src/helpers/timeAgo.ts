export function formatTimeAgo(timestampMs: number, nowMs = Date.now()): string {
    const diffSeconds = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));

    if (diffSeconds < 60) return "just now";

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}
