export interface RestartEventDto {
    detectedAt: string;
    restartAt: string | null;
    reason: string | null;
    restartCount: number;
    countDelta: number;
    recoveredAt: string | null;
}
