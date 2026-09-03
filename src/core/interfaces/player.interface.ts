export interface Player<TMetadata = Record<string, any>> {
  id: string;
  name: string;
  socketId: string;
  isHost: boolean;
  connected: boolean;
  joinedAt: Date;
  score?: number;
  metadata: TMetadata;
}
