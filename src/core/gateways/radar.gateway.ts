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

@UseFilters(new RadarWsExceptionFilter())
@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
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

    if (result && result.room) {
      const roomCode = result.room.code;
      if (!result.isHost && result.player) {
        const payload = {
          playerId: result.player.id,
          playerName: result.player.name,
        };
        this.server.to(roomCode).emit('radar:playerLeft', payload);
        // Compatibilidade legada
        this.server.to(roomCode).emit('playerLeft', payload);
      }
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

    const players = Array.from(room.players.values());

    client.emit('radar:roomJoined', {
      isHost: true,
      room: {
        id: room.id,
        code: room.code,
        gameType: room.gameType,
        status: room.status,
      },
      state: hostState,
      players,
    });

    // Eventos legados de compatibilidade
    client.emit('existingPlayers', players);

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

    // Eventos legados de compatibilidade
    client.emit('existingPlayers', players);
    client.broadcast.to(room.code).emit('playerJoined', player);

    return { success: true, player };
  }

  @SubscribeMessage('radar:dispatchAction')
  async handleRadarDispatchAction(
    @MessageBody() data: { type: string; payload?: any; roomCode?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomCode = data.roomCode || client.data?.roomCode;
    const isHost = Boolean(client.data?.isHost);
    const senderId = client.data?.senderId || (isHost ? 'host' : client.data?.playerId);

    if (!roomCode || !senderId) {
      client.emit('radar:error', { message: 'Você não está conectado a uma sala ativa.' });
      return { success: false, error: 'Sessão não identificada' };
    }

    const action: GameAction = {
      type: data.type,
      payload: data.payload,
      senderId,
      isHost,
      timestamp: new Date(),
    };

    const actionResult = await this.roomManager.dispatchAction(roomCode, action);
    const room = this.roomManager.findRoom(roomCode);

    if (room) {
      // Sincroniza o estado atualizado com todos os participantes
      await this.syncRoomState(room);

      // Dispara eventos extras gerados pelo reducer do jogo
      if (actionResult.events && actionResult.events.length > 0) {
        for (const evt of actionResult.events) {
          const isLegacyEvent = Boolean(evt.event && !evt.event.startsWith('radar:'));

          if (!evt.target || evt.target === 'ALL') {
            this.server.to(room.code).emit('radar:customEvent', evt);
            if (isLegacyEvent) {
              this.server.to(room.code).emit(evt.event, evt.payload);
            }
          } else if (evt.target === 'HOST_ONLY' && room.hostSocketId) {
            this.server.to(room.hostSocketId).emit('radar:customEvent', evt);
            if (isLegacyEvent) {
              this.server.to(room.hostSocketId).emit(evt.event, evt.payload);
            }
          } else if (evt.target === 'PLAYERS_ONLY') {
            client.broadcast.to(room.code).emit('radar:customEvent', evt);
            if (isLegacyEvent) {
              client.broadcast.to(room.code).emit(evt.event, evt.payload);
            }
          } else if (Array.isArray(evt.target)) {
            for (const pid of evt.target) {
              const targetPlayer = room.players.get(pid);
              if (targetPlayer?.socketId) {
                this.server.to(targetPlayer.socketId).emit('radar:customEvent', evt);
                if (isLegacyEvent) {
                  this.server.to(targetPlayer.socketId).emit(evt.event, evt.payload);
                }
              }
            }
          }
        }
      }

      // Se o jogo terminou, emite encerramento com resultados finais
      if (room.status === 'FINISHED') {
        const results = this.roomManager.getFinalResults(room.code);
        this.server.to(room.code).emit('radar:gameEnded', { results });
        // Compatibilidade legada
        this.server.to(room.code).emit('quizEnded', { scores: results });
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
      this.roomManager.handleSocketDisconnect(client.id);
    }
    client.data = {};
    return { success: true };
  }

  /**
   * Sincroniza o estado filtrado para cada participante da sala.
   */
  private async syncRoomState(room: any) {
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

    // Estado dos Players
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

  // ==========================================
  // COMPATIBILIDADE LEGADA (QUIZ EVENTS)
  // ==========================================

  @SubscribeMessage('joinAsHost')
  async handleLegacyJoinAsHost(
    @MessageBody() data: { sessionId: number | string },
    @ConnectedSocket() client: Socket,
  ) {
    return this.handleRadarJoinAsHost({ roomCode: String(data.sessionId) }, client);
  }

  @SubscribeMessage('joinSession')
  async handleLegacyJoinSession(
    @MessageBody() data: { sessionId: number | string; playerName: string },
    @ConnectedSocket() client: Socket,
  ) {
    const result = await this.handleRadarJoinRoom(
      { roomCode: String(data.sessionId), playerName: data.playerName },
      client,
    );
    return result.player;
  }

  @SubscribeMessage('startQuiz')
  async handleLegacyStartQuiz(@ConnectedSocket() client: Socket) {
    return this.handleRadarDispatchAction(
      { type: 'START_GAME' },
      client,
    );
  }

  @SubscribeMessage('submitAnswer')
  async handleLegacySubmitAnswer(
    @MessageBody() data: { questionId: string; alternativeId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const result = await this.handleRadarDispatchAction(
      {
        type: 'SUBMIT_ANSWER',
        payload: {
          questionId: data.questionId,
          alternativeId: data.alternativeId,
        },
      },
      client,
    );

    client.emit('answerSubmitted', {
      success: true,
      isCorrect: result?.response?.isCorrect ?? false,
      pointsAwarded: result?.response?.pointsAwarded ?? 0,
    });

    return result;
  }

  @SubscribeMessage('nextQuestion')
  async handleLegacyNextQuestion(@ConnectedSocket() client: Socket) {
    return this.handleRadarDispatchAction(
      { type: 'NEXT_QUESTION' },
      client,
    );
  }

  @SubscribeMessage('getScores')
  async handleLegacyGetScores(@ConnectedSocket() client: Socket) {
    const roomCode = client.data?.roomCode;
    if (!roomCode) {
      client.emit('error', { message: 'Não está conectado a uma sessão' });
      return { success: false };
    }

    const scores = this.roomManager.getFinalResults(roomCode);
    this.server.to(roomCode).emit('scoresUpdate', { scores });
    return { scores };
  }

  @SubscribeMessage('finishQuiz')
  async handleLegacyFinishQuiz(@ConnectedSocket() client: Socket) {
    const roomCode = client.data?.roomCode;
    if (roomCode) {
      await this.roomManager.finishRoom(roomCode);
      let scores: any[] = [];
      try {
        scores = this.roomManager.getFinalResults(roomCode);
      } catch {
        scores = [];
      }
      this.notifyRoomFinished(roomCode, scores);
    }
    return { success: true };
  }

  /**
   * Notifica todos os participantes conectados na sala que a sessão foi finalizada.
   */
  notifyRoomFinished(roomCode: string, scores?: any[]) {
    this.server.to(roomCode).emit('radar:roomFinished', { roomCode });
    this.server.to(roomCode).emit('sessionFinished', { roomCode });
    this.server.to(roomCode).emit('quizEnded', { scores: scores || [] });
  }
}
