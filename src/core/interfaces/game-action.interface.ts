export interface GameAction<TPayload = any> {
  type: string;
  payload: TPayload;
  senderId: string;
  isHost: boolean;
  timestamp: Date;
}

export interface BroadcastEvent {
  event: string;
  payload: any;
  target?: 'ALL' | 'HOST_ONLY' | 'PLAYERS_ONLY' | string[];
}

export interface ActionResult<TState = any> {
  newState: TState;
  events?: BroadcastEvent[];
  directResponse?: any;
  error?: string;
}
