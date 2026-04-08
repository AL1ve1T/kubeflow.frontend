import { TopologyCanvas } from "./components/TopologyCanvas";
import { mockSnapshot } from "./data/mockSnapshot";

export function App() {
    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                background: "#ffffff",
                overflow: "hidden",
            }}
        >
            <TopologyCanvas snapshot={mockSnapshot} />
        </div>
    );
}
