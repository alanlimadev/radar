import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Room, RoomStatus } from '../interfaces/room.interface';
import { Player } from '../interfaces/player.interface';
import { GameAction, ActionResult } from '../interfaces/game-action.interface';
import { GameContext, ActionContext } from '../interfaces/game-definition.interface';
import { GameRegistryService } from './game-registry.service';
import { PinUtil } from '../network/pin.util';

@Injectable()
export class RoomManagerService {
  private readonly logger = new Logger(RoomManagerService.name);

  // Armazenamento em memória para máxima performance e baixa latência
  private readonly roomsByCode = new Map<string, Room>();
  private readonly roomsById = new Map<string, Room>();
  private readonly socketToRoom = new Map<string, { roomCode: string; playerId?: string; isHost: boolean }>();

  constructor(private readonly gameRegistry: GameRegistryService) {}

  /**
   * Cria uma nova sala para um jogo registrado.
   */
  async createRoom<TConfig = any>(
    hostId: string,
    gameType: string,
    config: TConfig,
  ): Promise<Room> {
    const gameDef = this.gameRegistry.get(gameType);
    if (!gameDef) {
      throw new BadRequestException(`Tipo de jogo "${gameType}" não está registrado.`);
    }

    const roomId = randomUUID();
    let roomCode = PinUtil.generateNumericPin(6);

    // Garante que o PIN seja único entre as salas ativas
    while (this.roomsByCode.has(roomCode)) {
      roomCode = PinUtil.generateNumericPin(6);
    }

    const context: GameContext = {
      roomId,
      roomCode,
      hostId,
      players: [],
    };

    const initialState = await gameDef.init(config, context);

    const room: Room = {
      id: roomId,
      code: roomCode,
      gameType,
      hostId,
      status: 'LOBBY',
      config,
      state: initialState,
      players: new Map<string, Player>(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.roomsByCode.set(roomCode, room);
    this.roomsById.set(roomId, room);

    this.logger.log(`🏠 Sala criada [${roomCode}] para o jogo "${gameType}" pelo host "${hostId}"`);
    return room;
  }

  /**
   * Conecta um Host à sala.
   */
  async joinAsHost(
    roomCodeOrId: string,
    socketId: string,
  ): Promise<{ room: Room; hostState: any }> {
    const room = this.findRoom(roomCodeOrId);
    if (!room) {
      throw new NotFoundException(`Sala "${roomCodeOrId}" não encontrada.`);
    }

    room.hostSocketId = socketId;
    room.updatedAt = new Date();

    this.socketToRoom.set(socketId, {
      roomCode: room.code,
      isHost: true,
    });

    const gameDef = this.gameRegistry.get(room.gameType)!;
    const hostState = gameDef.getClientState(room.state, undefined, true);

    return { room, hostState };
  }

  /**
   * Conecta um jogador à sala (ou reconecta caso já estivesse cadastrado).
   */
  async joinRoom(
    roomCodeOrId: string,
    playerName: string,
    socketId: string,
    metadata: Record<string, any> = {},
  ): Promise<{
    room: Room;
    player: Player;
    clientState: any;
    isReconnection: boolean;
    events?: any[];
  }> {
    const room = this.findRoom(roomCodeOrId);
    if (!room) {
      throw new NotFoundException(`Sala "${roomCodeOrId}" não encontrada.`);
    }

    if (room.status === 'FINISHED') {
      throw new BadRequestException('Esta sessão já foi finalizada.');
    }

    const gameDef = this.gameRegistry.get(room.gameType)!;
    const playersList = Array.from(room.players.values());

    // Procura jogador existente pelo nome para suporte a reconexão em WLAN instável
    const existingPlayer = playersList.find(
      (p) => p.name.trim().toLowerCase() === playerName.trim().toLowerCase(),
    );

    let player: Player;
    let isReconnection = false;
    let events: any[] | undefined;

    const gameContext: GameContext = {
      roomId: room.id,
      roomCode: room.code,
      hostId: room.hostId,
      players: playersList,
    };

    if (existingPlayer) {
      // Reconexão
      existingPlayer.socketId = socketId;
      existingPlayer.connected = true;
      player = existingPlayer;
      isReconnection = true;

      if (gameDef.onPlayerReconnect) {
        const actionResult = gameDef.onPlayerReconnect(room.state, player, gameContext);
        room.state = actionResult.newState;
        events = actionResult.events;
      }
      this.logger.log(`🔄 Jogador "${player.name}" reconectou na sala [${room.code}]`);
    } else {
      // Novo Jogador: só pode entrar enquanto a sala está no lobby.
      // Reconexões de jogadores já cadastrados continuam permitidas.
      if (room.status !== 'LOBBY') {
        throw new BadRequestException('Sessão já iniciada.');
      }

      player = {
        id: randomUUID(),
        name: playerName.trim(),
        socketId,
        isHost: false,
        connected: true,
        joinedAt: new Date(),
        score: 0,
        metadata,
      };

      room.players.set(player.id, player);

      if (gameDef.onPlayerJoin) {
        const actionResult = gameDef.onPlayerJoin(room.state, player, gameContext);
        room.state = actionResult.newState;
        events = actionResult.events;
      }
      this.logger.log(`➕ Jogador "${player.name}" (${player.id}) entrou na sala [${room.code}]`);
    }

    room.updatedAt = new Date();

    this.socketToRoom.set(socketId, {
      roomCode: room.code,
      playerId: player.id,
      isHost: false,
    });

    const clientState = gameDef.getClientState(room.state, player, false);

    return {
      room,
      player,
      clientState,
      isReconnection,
      events,
    };
  }

  /**
   * Despacha uma ação de jogo universal para a máquina de regras do jogo.
   */
  async dispatchAction(
    roomCodeOrId: string,
    action: GameAction,
  ): Promise<ActionResult> {
    const room = this.findRoom(roomCodeOrId);
    if (!room) {
      throw new NotFoundException(`Sala "${roomCodeOrId}" não encontrada.`);
    }

    const gameDef = this.gameRegistry.get(room.gameType);
    if (!gameDef) {
      throw new BadRequestException(`Jogo "${room.gameType}" não encontrado.`);
    }

    const playersList = Array.from(room.players.values());
    const sender = action.isHost
      ? ({
          id: room.hostId,
          name: 'HOST',
          socketId: room.hostSocketId ?? '',
          isHost: true,
          connected: true,
          joinedAt: room.createdAt,
          metadata: {},
        } as Player)
      : room.players.get(action.senderId);

    if (!sender) {
      throw new BadRequestException('Remetente da ação não encontrado na sala.');
    }

    const actionContext: ActionContext = {
      roomId: room.id,
      roomCode: room.code,
      hostId: room.hostId,
      players: playersList,
      sender,
    };

    // Executa a transição de estado através do reducer do jogo
    const result = gameDef.onAction(room.state, action, actionContext);
    room.state = result.newState;
    room.updatedAt = new Date();

    // Verifica se o jogo começou ou terminou
    if (room.status === 'LOBBY' && action.type.toUpperCase().includes('START')) {
      room.status = 'IN_PROGRESS';
    }

    if (gameDef.isFinished(room.state)) {
      room.status = 'FINISHED';
      room.endedAt = new Date();
      this.logger.log(`🏁 Partida da sala [${room.code}] foi finalizada!`);
    }

    return result;
  }

  /**
   * Trata desconexão de socket na rede local.
   */
  handleSocketDisconnect(socketId: string): {
    room?: Room;
    player?: Player;
    isHost: boolean;
  } | null {
    const record = this.socketToRoom.get(socketId);
    if (!record) return null;

    this.socketToRoom.delete(socketId);
    const room = this.roomsByCode.get(record.roomCode);
    if (!room) return null;

    if (record.isHost) {
      this.logger.warn(`⚠️ Host da sala [${room.code}] desconectou do socket.`);
      return { room, isHost: true };
    }

    if (record.playerId) {
      const player = room.players.get(record.playerId);
      if (player) {
        player.connected = false;
        const gameDef = this.gameRegistry.get(room.gameType);
        if (gameDef?.onPlayerLeave) {
          const gameContext: GameContext = {
            roomId: room.id,
            roomCode: room.code,
            hostId: room.hostId,
            players: Array.from(room.players.values()),
          };
          const actionResult = gameDef.onPlayerLeave(room.state, player, gameContext);
          room.state = actionResult.newState;
        }
        this.logger.log(`👋 Jogador "${player.name}" desconectou da sala [${room.code}]`);
        return { room, player, isHost: false };
      }
    }

    return null;
  }

  /**
   * Retorna os jogadores formatados para a sala.
   */
  getRoomPlayers(roomCodeOrId: string): Player[] {
    const room = this.findRoom(roomCodeOrId);
    if (!room) throw new NotFoundException('Sala não encontrada.');
    return Array.from(room.players.values());
  }

  /**
   * Retorna o estado sanitizado para o cliente especificado.
   */
  getClientState(roomCodeOrId: string, forPlayerId?: string, isHost?: boolean): any {
    const room = this.findRoom(roomCodeOrId);
    if (!room) throw new NotFoundException('Sala não encontrada.');

    const gameDef = this.gameRegistry.get(room.gameType);
    if (!gameDef) throw new NotFoundException('Jogo não encontrado.');

    const player = forPlayerId ? room.players.get(forPlayerId) : undefined;
    return gameDef.getClientState(room.state, player, isHost);
  }

  /**
   * Retorna os resultados finais de uma sala finalizada.
   */
  getFinalResults(roomCodeOrId: string): any {
    const room = this.findRoom(roomCodeOrId);
    if (!room) throw new NotFoundException('Sala não encontrada.');

    const gameDef = this.gameRegistry.get(room.gameType);
    if (!gameDef) throw new NotFoundException('Jogo não encontrado.');

    const playersList = Array.from(room.players.values());
    return gameDef.getFinalResults(room.state, playersList);
  }

  /**
   * Encerra manualmente uma sala.
   */
  async finishRoom(roomCodeOrId: string): Promise<Room> {
    const room = this.findRoom(roomCodeOrId);
    if (!room) throw new NotFoundException('Sala não encontrada.');

    room.status = 'FINISHED';
    room.endedAt = new Date();
    if (room.state && typeof room.state === 'object') {
      (room.state as any).status = 'GAME_OVER';
    }
    return room;
  }

  /**
   * Busca uma sala por código PIN ou por ID UUID.
   */
  findRoom(codeOrId: string | number): Room | undefined {
    const str = String(codeOrId);
    return this.roomsByCode.get(str) || this.roomsById.get(str);
  }
}
