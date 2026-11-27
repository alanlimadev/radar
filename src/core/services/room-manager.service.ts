import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Room, RoomStatus } from '../interfaces/room.interface';
import { Player } from '../interfaces/player.interface';
import { GameAction, ActionResult } from '../interfaces/game-action.interface';
import {
  GameContext,
  ActionContext,
  ResultsReportContext,
} from '../interfaces/game-definition.interface';
import { GameRegistryService } from './game-registry.service';
import { PinUtil } from '../network/pin.util';
import { RoomRepository } from '../persistence/room.repository';

const ROOM_MEMORY_TTL_MS = 10 * 60 * 1000;
const PIN_MAX_ATTEMPTS = 10;

@Injectable()
export class RoomManagerService {
  private readonly logger = new Logger(RoomManagerService.name);

  // Armazenamento em memória para máxima performance e baixa latência
  private readonly roomsByCode = new Map<string, Room>();
  private readonly roomsById = new Map<string, Room>();
  private readonly socketToRoom = new Map<string, { roomCode: string; playerId?: string; isHost: boolean }>();

  constructor(
    private readonly gameRegistry: GameRegistryService,
    @Optional() private readonly roomRepository?: RoomRepository,
  ) {}

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
    const roomCode = await this.generateAvailablePin();

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

    await this.persistRoomCreation(room);

    this.logger.log(`🏠 Sala criada [${roomCode}] para o jogo "${gameType}" pelo host "${hostId}"`);
    return room;
  }

  /**
   * Sorteia um PIN livre tanto nas salas em memória quanto nos relatórios já
   * persistidos (evita colisão com a constraint `code @unique`).
   */
  private async generateAvailablePin(): Promise<string> {
    for (let attempt = 0; attempt < PIN_MAX_ATTEMPTS; attempt++) {
      const candidate = PinUtil.generateNumericPin(6);
      if (this.roomsByCode.has(candidate)) continue;

      if (this.roomRepository) {
        try {
          if (await this.roomRepository.codeExists(candidate)) continue;
        } catch (error) {
          // Fail-open: uma falha momentânea do banco não pode impedir a partida.
          this.logger.error(
            `Falha ao validar PIN no banco: ${(error as Error).message}`,
          );
        }
      }

      return candidate;
    }

    throw new ServiceUnavailableException(
      'Não foi possível gerar um PIN único. Tente novamente em instantes.',
    );
  }

  private async persistRoomCreation(room: Room): Promise<void> {
    if (!this.roomRepository) return;

    try {
      await this.roomRepository.createRoom({
        id: room.id,
        code: room.code,
        gameType: room.gameType,
        hostId: room.hostId,
        config: room.config,
        startedAt: room.createdAt,
      });
    } catch (error) {
      room.reportPersisted = false;
      this.logger.error(
        `Falha ao persistir sala [${room.code}]: ${(error as Error).message}`,
      );
    }
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

    await this.persistPlayer(room, player);

    const clientState = gameDef.getClientState(room.state, player, false);

    return {
      room,
      player,
      clientState,
      isReconnection,
      events,
    };
  }

  private async persistPlayer(room: Room, player: Player): Promise<void> {
    if (!this.roomRepository) return;

    try {
      await this.roomRepository.upsertPlayer(room.id, player);
    } catch (error) {
      room.reportPersisted = false;
      this.logger.error(
        `Falha ao persistir jogador "${player.name}" da sala [${room.code}]: ${(error as Error).message}`,
      );
    }
  }

  private async persistScores(room: Room): Promise<void> {
    if (!this.roomRepository) return;

    try {
      await this.roomRepository.updateScores(
        room.id,
        Array.from(room.players.values()),
      );
    } catch (error) {
      room.reportPersisted = false;
      this.logger.error(
        `Falha ao atualizar pontuações da sala [${room.code}]: ${(error as Error).message}`,
      );
    }
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
      room.gameStartedAt = room.gameStartedAt ?? new Date();
    }

    if (gameDef.isFinished(room.state)) {
      const wasFinished = room.status === 'FINISHED';
      room.status = 'FINISHED';
      room.endedAt = room.endedAt ?? new Date();
      await this.persistFinishedRoom(room);
      if (!wasFinished) {
        this.scheduleRoomCleanup(room);
      }
      this.logger.log(`🏁 Partida da sala [${room.code}] foi finalizada!`);
    } else {
      // Best-effort: falhas aqui não interrompem a partida.
      void this.persistScores(room);
    }

    return result;
  }

  /**
   * Grava o snapshot final (idempotente) e mantém a sala em memória por uma
   * janela curta para reconexões tardias.
   */
  private async persistFinishedRoom(room: Room): Promise<void> {
    if (!this.roomRepository) return;
    if (room.reportPersisted === true) return;

    const playersList = Array.from(room.players.values());
    const gameDef = this.gameRegistry.get(room.gameType);
    const endedAt = room.endedAt ?? new Date();

    let results: any = null;
    if (room.gameStartedAt && gameDef?.getResultsReport) {
      const context: ResultsReportContext = {
        roomId: room.id,
        roomCode: room.code,
        hostId: room.hostId,
        createdAt: room.createdAt,
        gameStartedAt: room.gameStartedAt,
        endedAt,
      };

      try {
        results = gameDef.getResultsReport(
          room.state,
          playersList,
          context,
        );
      } catch (error) {
        this.logger.error(
          `Falha ao montar relatório da sala [${room.code}]: ${(error as Error).message}`,
        );
      }
    }

    try {
      await this.roomRepository.finishRoom({
        roomId: room.id,
        endedAt,
        results,
        players: playersList,
      });
      room.reportPersisted = results !== null;
    } catch (error) {
      room.reportPersisted = false;
      this.logger.error(
        `Falha ao persistir relatório da sala [${room.code}]: ${(error as Error).message}`,
      );
    }
  }

  private scheduleRoomCleanup(room: Room): void {
    const timer = setTimeout(() => {
      this.roomsByCode.delete(room.code);
      this.roomsById.delete(room.id);
      this.logger.log(`🧹 Sala [${room.code}] removida da memória.`);
    }, ROOM_MEMORY_TTL_MS);

    // Não mantém o processo vivo (ex.: testes e scripts).
    (timer as any).unref?.();
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

    const wasFinished = room.status === 'FINISHED';
    room.status = 'FINISHED';
    room.endedAt = room.endedAt ?? new Date();

    await this.persistFinishedRoom(room);

    if (!wasFinished) {
      this.scheduleRoomCleanup(room);
    }

    return room;
  }

  /** Indica se a sala possui um relatório persistido disponível. */
  hasPersistedReport(room: Room): boolean {
    return Boolean(room.gameStartedAt) && room.reportPersisted === true;
  }

  /**
   * Busca uma sala por código PIN ou por ID UUID.
   */
  findRoom(codeOrId: string | number): Room | undefined {
    const str = String(codeOrId);
    return this.roomsByCode.get(str) || this.roomsById.get(str);
  }
}
