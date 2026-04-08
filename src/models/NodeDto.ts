export enum NodeType {
    SERVICE = "SERVICE",
    DATABASE = "DATABASE",
    EXTERNAL = "EXTERNAL",
}

export interface NodeDto {
    id: string;
    name: string;
    type: NodeType;
    namespace: string;
    lastSeenAt: string;
}
