import { Player } from './player.interface';

export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'PAUSED' | 'FINISHED';

export interface Room<TState = any, TConfig = any> {
  id: string;
  code: string;
  gameType: string;
  hostId: string;
  hostSocketId?: string;
  status: RoomStatus;
  config: TConfig;
  state: TState;
  players: Map<string, Player>;
  createdAt: Date;
  updatedAt: Date;
  /** Instante em que a partida realmente começou (primeira ação START). */
  gameStartedAt?: Date;
  endedAt?: Date;
  /** Indica se o snapshot do relatório foi gravado com sucesso no SQLite. */
  reportPersisted?: boolean;
}

export interface RoomSummary {
  id: string;
  code: string;
  gameType: string;
  hostId: string;
  status: RoomStatus;
  playerCount: number;
  createdAt: Date;
}
