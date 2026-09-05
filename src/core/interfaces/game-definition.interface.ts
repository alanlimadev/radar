import { Player } from './player.interface';
import { GameAction, ActionResult } from './game-action.interface';

export interface GameContext {
  roomId: string;
  roomCode: string;
  hostId: string;
  players: Player[];
}

export interface ActionContext extends GameContext {
  sender: Player;
}

export interface GameMetadata {
  gameType: string;
  name: string;
  description?: string;
  version: string;
  minPlayers?: number;
  maxPlayers?: number;
}

export interface IGameDefinition<TState = any, TConfig = any, TPublicState = any> {
  readonly gameType: string;
  readonly name: string;
  readonly description?: string;
  readonly version: string;
  readonly minPlayers?: number;
  readonly maxPlayers?: number;

  /**
   * Inicializa o estado interno do jogo a partir da configuração fornecida pelo host.
   */
  init(config: TConfig, context: GameContext): TState | Promise<TState>;

  /**
   * Gancho disparado quando um jogador entra na sala.
   */
  onPlayerJoin?(state: TState, player: Player, context: GameContext): ActionResult<TState>;

  /**
   * Gancho disparado quando um jogador se desconecta.
   */
  onPlayerLeave?(state: TState, player: Player, context: GameContext): ActionResult<TState>;

  /**
   * Gancho disparado quando um jogador reconecta na mesma sessão.
   */
  onPlayerReconnect?(state: TState, player: Player, context: GameContext): ActionResult<TState>;

  /**
   * Reducer principal: processa uma ação de jogo e devolve o novo estado e eventos.
   */
  onAction(state: TState, action: GameAction, context: ActionContext): ActionResult<TState>;

  /**
   * Retorna a visão do estado visível para um jogador específico ou para o host.
   * Usado para omitir respostas corretas ou informações privadas.
   */
  getClientState(state: TState, forPlayer?: Player, isHost?: boolean): TPublicState;

  /**
   * Verifica se a condição de término do jogo foi atingida.
   */
  isFinished(state: TState): boolean;

  /**
   * Retorna os dados de encerramento / ranking final / estatísticas.
   */
  getFinalResults(state: TState): any;
}
