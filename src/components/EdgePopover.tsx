import type { EdgeDto } from "../models";

interface EdgePopoverProps {
    edge: EdgeDto;
    x: number;
    y: number;
    onClose: () => void;
}

const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    padding: "4px 0",
};

const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#6b7280",
};

const valueStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "#1f2937",
};

export function EdgePopover({ edge, x, y, onClose }: EdgePopoverProps) {
    return (
        <div
            onClick={(e) => e.stopPropagation()}
            style={{
                position: "fixed",
                left: x + 12,
                top: y - 8,
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                padding: "12px 16px",
                minWidth: 200,
                fontFamily: "Inter, system-ui, sans-serif",
                zIndex: 10,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                }}
            >
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                    {edge.protocol}
                </span>
                <button
                    onClick={onClose}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 16,
                        color: "#9ca3af",
                        lineHeight: 1,
                        padding: 0,
                    }}
                >
                    ×
                </button>
            </div>

            <div style={rowStyle}>
                <span style={labelStyle}>Requests/s</span>
                <span style={valueStyle}>{edge.requestsPerSecond}</span>
            </div>
            <div style={rowStyle}>
                <span style={labelStyle}>Total requests</span>
                <span style={valueStyle}>{edge.requestCount.toLocaleString()}</span>
            </div>
            <div style={rowStyle}>
                <span style={labelStyle}>Avg latency</span>
                <span style={valueStyle}>{edge.averageLatencyMs} ms</span>
            </div>
            <div style={rowStyle}>
                <span style={labelStyle}>Max latency</span>
                <span style={valueStyle}>{edge.maxLatencyMs} ms</span>
            </div>
            <div style={rowStyle}>
                <span style={labelStyle}>Error rate</span>
                <span
                    style={{
                        ...valueStyle,
                        color: edge.errorRate > 0.01 ? "#ef4444" : "#1f2937",
                    }}
                >
                    {(edge.errorRate * 100).toFixed(2)}%
                </span>
            </div>
        </div>
    );
}
