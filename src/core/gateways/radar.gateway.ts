import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { UseFilters, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RoomManagerService } from '../services/room-manager.service';
import { GameRegistryService } from '../services/game-registry.service';
import { RadarWsExceptionFilter } from './ws-exception.filter';
import { GameAction } from '../interfaces/game-action.interface';
import { Room } from '../interfaces/room.interface';

@UseFilters(new RadarWsExceptionFilter())
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  // Tolerância a oscilações de Wi-Fi: mantém a conexão viva por até 60s
  // sem resposta do cliente antes de declarar desconexão (evita quedas
  // prematuras por perda breve de pacotes em redes escolares).
  pingTimeout: 60_000,
  pingInterval: 25_000,
  maxHttpBufferSize: 1_000_000,
})
export class RadarGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RadarGateway.name);

  constructor(
    private readonly roomManager: RoomManagerService,
    private readonly gameRegistry: GameRegistryService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.debug(`🔌 Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`🔌 Cliente desconectado: ${client.id}`);
    const result = this.roomManager.handleSocketDisconnect(client.id);

    if (result?.room && !result.isHost && result.player) {
      this.server.to(result.room.code).emit('radar:playerLeft', {
        playerId: result.player.id,
        playerName: result.player.name,
      });
    }
  }

  // ==========================================
  // PROTOCOLO UNIVERSAL RADAR (RADAR FRAMEWORK)
  // ==========================================

  @SubscribeMessage('radar:joinAsHost')
  async handleRadarJoinAsHost(
    @MessageBody() data: { roomCode: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { room, hostState } = await this.roomManager.joinAsHost(
      data.roomCode,
      client.id,
    );

    client.data = {
      roomCode: room.code,
      roomId: room.id,
      isHost: true,
      senderId: room.hostId,
    };

    await client.join(room.code);

    client.emit('radar:roomJoined', {
      isHost: true,
      room: {
        id: room.id,
        code: room.code,
        gameType: room.gameType,
        status: room.status,
      },
      state: hostState,
      players: Array.from(room.players.values()),
    });

    return { success: true, roomCode: room.code };
  }

  @SubscribeMessage('radar:joinRoom')
  async handleRadarJoinRoom(
    @MessageBody()
    data: {
      roomCode: string;
      playerName: string;
      metadata?: Record<string, any>;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { room, player, clientState, isReconnection } =
      await this.roomManager.joinRoom(
        data.roomCode,
        data.playerName,
        client.id,
        data.metadata,
      );

    client.data = {
      roomCode: room.code,
      roomId: room.id,
      isHost: false,
      playerId: player.id,
      playerName: player.name,
      senderId: player.id,
    };

    await client.join(room.code);

    const players = Array.from(room.players.values());

    // Resposta para o próprio jogador
    client.emit('radar:roomJoined', {
      isHost: false,
      player,
      room: {
        id: room.id,
        code: room.code,
        gameType: room.gameType,
        status: room.status,
      },
      state: clientState,
      players,
      isReconnection,
    });

    // Notifica os demais na sala
    client.broadcast.to(room.code).emit('radar:playerJoined', {
      player,
      totalPlayers: players.length,
    });

    return { success: true, player };
  }

  @SubscribeMessage('radar:dispatchAction')
  async handleRadarDispatchAction(
    @MessageBody() data: { type: string; payload?: any; roomCode?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomCode = data.roomCode || client.data?.roomCode;
    const isHost = Boolean(client.data?.isHost);
    const senderId =
      client.data?.senderId || (isHost ? 'host' : client.data?.playerId);

    if (!roomCode || !senderId) {
      client.emit('radar:error', {
        message: 'Você não está conectado a uma sala ativa.',
      });
      return { success: false, error: 'Sessão não identificada' };
    }

    const action: GameAction = {
      type: data.type,
      payload: data.payload,
      senderId,
      isHost,
      timestamp: new Date(),
    };

    const actionResult = await this.roomManager.dispatchAction(
      roomCode,
      action,
    );
    const room = this.roomManager.findRoom(roomCode);

    if (room) {
      // Sincroniza o estado atualizado com todos os participantes
      await this.syncRoomState(room);

      // Eventos extras gerados pelo reducer são sempre encapsulados no
      // protocolo universal, para o core permanecer agnóstico ao jogo.
      for (const evt of actionResult.events ?? []) {
        this.emitCustomEvent(client, room, evt);
      }

      // Se o jogo terminou, emite encerramento com resultados finais
      if (room.status === 'FINISHED') {
        const results = this.roomManager.getFinalResults(room.code);
        const hasReport = this.roomManager.hasPersistedReport(room);

        this.server.to(room.code).emit('radar:gameEnded', {
          results,
          reportId: hasReport ? room.id : null,
        });

        this.notifyReportStatus(room, hasReport);
      }
    }

    return {
      success: true,
      response: actionResult.directResponse,
    };
  }

  @SubscribeMessage('radar:leaveRoom')
  async handleRadarLeaveRoom(@ConnectedSocket() client: Socket) {
    const roomCode = client.data?.roomCode;
    if (roomCode) {
      await client.leave(roomCode);
      const result = this.roomManager.handleSocketDisconnect(client.id);
      if (result?.room && !result.isHost && result.player) {
        this.server.to(result.room.code).emit('radar:playerLeft', {
          playerId: result.player.id,
          playerName: result.player.name,
        });
      }
    }
    client.data = {};
    return { success: true };
  }

  /**
   * Encaminha um evento de domínio do jogo para os destinatários corretos,
   * sempre dentro do canal genérico `radar:customEvent`.
   */
  private emitCustomEvent(client: Socket, room: Room, evt: any): void {
    if (!evt.target || evt.target === 'ALL') {
      this.server.to(room.code).emit('radar:customEvent', evt);
      return;
    }

    if (evt.target === 'HOST_ONLY' && room.hostSocketId) {
      this.server.to(room.hostSocketId).emit('radar:customEvent', evt);
      return;
    }

    if (evt.target === 'PLAYERS_ONLY') {
      client.broadcast.to(room.code).emit('radar:customEvent', evt);
      return;
    }

    if (Array.isArray(evt.target)) {
      for (const playerId of evt.target) {
        const targetPlayer = room.players.get(playerId);
        if (targetPlayer?.socketId) {
          this.server.to(targetPlayer.socketId).emit('radar:customEvent', evt);
        }
      }
    }
  }

  /**
   * Sincroniza o estado filtrado para cada participante da sala.
   */
  private async syncRoomState(room: Room) {
    const gameDef = this.gameRegistry.get(room.gameType);
    if (!gameDef) return;

    // Estado do Host
    if (room.hostSocketId) {
      const hostState = gameDef.getClientState(room.state, undefined, true);
      this.server.to(room.hostSocketId).emit('radar:stateUpdated', {
        state: hostState,
        status: room.status,
      });
    }

    // Estado dos Players (filtrado por jogador)
    for (const player of room.players.values()) {
      if (player.connected && player.socketId) {
        const playerState = gameDef.getClientState(room.state, player, false);
        this.server.to(player.socketId).emit('radar:stateUpdated', {
          state: playerState,
          status: room.status,
        });
      }
    }
  }

  /**
   * Avisa o host se o relatório ficou disponível ou se houve falha ao salvar.
   */
  notifyReportStatus(room: Room, hasReport: boolean) {
    if (!room?.hostSocketId) return;

    if (hasReport) {
      this.server.to(room.hostSocketId).emit('radar:reportReady', {
        reportId: room.id,
        roomCode: room.code,
      });
      return;
    }

    // Só avisa quando a partida chegou a começar (senão não há relatório).
    if (room.gameStartedAt) {
      this.server.to(room.hostSocketId).emit('radar:reportError', {
        roomCode: room.code,
        message: 'Não foi possível salvar o relatório da sessão.',
      });
    }
  }

  /**
   * Notifica todos os participantes conectados na sala que a sessão foi finalizada.
   */
  notifyRoomFinished(
    roomCode: string,
    scores: any[] = [],
    reportId: string | null = null,
  ) {
    this.server.to(roomCode).emit('radar:roomFinished', { roomCode });
    this.server.to(roomCode).emit('radar:gameEnded', {
      results: scores,
      reportId,
    });
  }
}
