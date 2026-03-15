export interface WorldState {
  version: 1;
  createdAt: string;
  updatedAt: string;
  terrainSeed: number;
  gridWidth: number;
  gridHeight: number;
  nodes: Record<string, PersistedNode>;
}

export interface PersistedNode {
  gridX: number;
  gridY: number;
  tileSize: number;
  biome: string;
  community: number;
  firstSeen: string;
  lastSeen: string;
  removed: boolean;
  removedAt?: string;
}
