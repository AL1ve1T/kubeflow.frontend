import type { PodPhase } from "./NodeDto";

/**
 * A single pod (replica) underneath a workload node.
 *
 * Pods only carry resource and health signals — CPU, memory, phase and restart
 * info. Traffic (RPS / latency / errors) is a property of the workload edge and
 * is never attributed to an individual pod, because Kubernetes load-balances
 * requests across pods at the network layer.
 *
 * `cpuUtilization` / `memoryUtilization` are ratios in [0..1]. A value of exactly
 * `0.0` means "no fresh sample", not "0% load".
 */
export interface PodDto {
    podName: string;
    cpuUtilization: number;
    memoryUtilization: number;
    podPhase: PodPhase;
    restartCount: number;
    lastRestartAt: string | null;
    lastRestartReason: string | null;
    lastSeenAt: string;
}
