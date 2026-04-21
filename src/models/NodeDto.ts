export enum NodeType {
    SERVICE = "SERVICE",
    DATABASE = "DATABASE",
    CACHE = "CACHE",
    QUEUE = "QUEUE",
    GATEWAY = "GATEWAY",
    INPUT = "INPUT",
}

export interface NodeDto {
    id: string;
    name: string;
    type: NodeType;
    lastSeenAt: string;
}
