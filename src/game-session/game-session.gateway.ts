import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseFilters } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { GameSessionService } from './game-session.service';
import { WsExceptionFilter } from './ws-exception.filter';

@UseFilters(new WsExceptionFilter())
@WebSocketGateway({ cors: true })
export class GameSessionGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Índice da pergunta atual por sessão — controlado pelo servidor
  private readonly sessionQuestionIndex = new Map<number, number>();

  constructor(private readonly gameSessionService: GameSessionService) {}

  handleDisconnect(client: Socket) {
    const { sessionId, playerId, playerName, isHost } = client.data ?? {};

    if (!sessionId) return;

    if (!isHost && playerId) {
      this.server
        .to(sessionId.toString())
        .emit('playerLeft', { playerId, playerName });
    }
  }

  @SubscribeMessage('joinAsHost')
  async handleJoinAsHost(
    @MessageBody() data: { sessionId: number | string },
    @ConnectedSocket() client: Socket,
  ) {
    const sessionId = Number(data.sessionId);

    const session = await this.gameSessionService.getSession(sessionId);
    if (!session) {
      client.emit('error', { message: 'Sessão não encontrada' });
      return { success: false };
    }

    client.data = { sessionId, isHost: true };
    await client.join(sessionId.toString());

    const players = await this.gameSessionService.getSessionPlayers(sessionId);
    client.emit('existingPlayers', players);

    return { success: true };
  }

  @SubscribeMessage('joinSession')
  async handleJoinSession(
    @MessageBody() data: { sessionId: number | string; playerName: string },
    @ConnectedSocket() client: Socket,
  ) {
    const sessionId = Number(data.sessionId);

    const session = await this.gameSessionService.getSession(sessionId);
    if (!session || session.status !== 'IN_PROGRESS') {
      client.emit('error', { message: 'Sessão não está disponível para entrada' });
      return { success: false };
    }

    const player = await this.gameSessionService.addPlayerToSession(
      sessionId,
      data.playerName,
    );

    client.data = {
      sessionId,
      playerId: player.id,
      playerName: data.playerName,
      isHost: false,
    };

    await client.join(sessionId.toString());

    const existingPlayers =
      await this.gameSessionService.getSessionPlayers(sessionId);
    client.emit('existingPlayers', existingPlayers);

    client.broadcast.to(sessionId.toString()).emit('playerJoined', player);
    return player;
  }

  // Payload sem sessionId — sessionId vem de client.data (definido no joinAsHost)
  @SubscribeMessage('startQuiz')
  async handleStartQuiz(@ConnectedSocket() client: Socket) {
    if (!client.data?.isHost) {
      client.emit('error', { message: 'Apenas o host pode iniciar o quiz' });
      return { success: false };
    }

    const sessionId: number = client.data.sessionId;

    const sessionWithQuiz =
      await this.gameSessionService.getSessionWithQuestions(sessionId);

    if (!sessionWithQuiz || sessionWithQuiz.quiz.questions.length === 0) {
      client.emit('error', { message: 'Quiz não possui perguntas' });
      return { success: false };
    }

    this.sessionQuestionIndex.set(sessionId, 0);

    const firstQuestion = sessionWithQuiz.quiz.questions[0];
    this.server.to(sessionId.toString()).emit('quizStarted', {
      question: {
        id: firstQuestion.id,
        text: firstQuestion.text,
        alternatives: firstQuestion.alternatives.map((alt) => ({
          id: alt.id,
          text: alt.text,
        })),
      },
      currentQuestionIndex: 0,
      totalQuestions: sessionWithQuiz.quiz.questions.length,
    });

    return { success: true };
  }

  @SubscribeMessage('submitAnswer')
  async handleSubmitAnswer(
    @MessageBody() data: { questionId: string; alternativeId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, playerId, isHost } = client.data ?? {};

    if (!sessionId || !playerId || isHost) {
      client.emit('error', { message: 'Apenas players podem enviar respostas' });
      return { success: false };
    }

    const answer = await this.gameSessionService.submitAnswer(
      playerId,
      data.questionId,
      data.alternativeId,
    );

    client.emit('answerSubmitted', {
      success: true,
      isCorrect: answer.isCorrect,
    });

    return { success: true };
  }

  // Payload sem sessionId nem currentQuestionIndex — ambos controlados pelo servidor
  @SubscribeMessage('nextQuestion')
  async handleNextQuestion(@ConnectedSocket() client: Socket) {
    if (!client.data?.isHost) {
      client.emit('error', { message: 'Apenas o host pode avançar as perguntas' });
      return { success: false };
    }

    const sessionId: number = client.data.sessionId;

    const sessionWithQuiz =
      await this.gameSessionService.getSessionWithQuestions(sessionId);

    if (!sessionWithQuiz) {
      client.emit('error', { message: 'Sessão não encontrada' });
      return { success: false };
    }

    const currentIndex = this.sessionQuestionIndex.get(sessionId) ?? 0;
    const totalQuestions = sessionWithQuiz.quiz.questions.length;

    if (currentIndex < totalQuestions - 1) {
      const nextIndex = currentIndex + 1;
      this.sessionQuestionIndex.set(sessionId, nextIndex);

      const nextQuestion = sessionWithQuiz.quiz.questions[nextIndex];
      this.server.to(sessionId.toString()).emit('nextQuestion', {
        question: {
          id: nextQuestion.id,
          text: nextQuestion.text,
          alternatives: nextQuestion.alternatives.map((alt) => ({
            id: alt.id,
            text: alt.text,
          })),
        },
        currentQuestionIndex: nextIndex,
        totalQuestions,
      });
    } else {
      const finalScores =
        await this.gameSessionService.getSessionScores(sessionId);

      this.server.to(sessionId.toString()).emit('quizEnded', { scores: finalScores });

      this.sessionQuestionIndex.delete(sessionId);
      await this.gameSessionService.finishSession(sessionId);
    }

    return { success: true };
  }

  @SubscribeMessage('getScores')
  async handleGetScores(@ConnectedSocket() client: Socket) {
    const sessionId = client.data?.sessionId;

    if (!sessionId) {
      client.emit('error', { message: 'Não está conectado a uma sessão' });
      return { success: false };
    }

    const scores = await this.gameSessionService.getSessionScores(sessionId);
    this.server.to(sessionId.toString()).emit('scoresUpdate', { scores });

    return { scores };
  }
}
