import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameSessionService } from './game-session.service';

@WebSocketGateway({
  cors: true,
})
export class GameSessionGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly gameSessionService: GameSessionService) {}

  private ensureSessionIdIsNumber(sessionId: number | string): number {
    return typeof sessionId === 'string' ? parseInt(sessionId, 10) : sessionId;
  }

  @SubscribeMessage('joinAsHost')
  async handleJoinAsHost(
    @MessageBody() data: { sessionId: number | string },
    @ConnectedSocket() client: Socket,
  ) {
    const sessionId = this.ensureSessionIdIsNumber(data.sessionId);

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
    const sessionId = this.ensureSessionIdIsNumber(data.sessionId);

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

  @SubscribeMessage('startQuiz')
  async handleStartQuiz(
    @MessageBody() data: { sessionId: number | string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data?.isHost) {
      client.emit('error', { message: 'Apenas o host pode iniciar o quiz' });
      return { success: false };
    }

    const sessionId = this.ensureSessionIdIsNumber(data.sessionId);
    const sessionWithQuiz =
      await this.gameSessionService.getSessionWithQuestions(sessionId);

    if (sessionWithQuiz && sessionWithQuiz.quiz.questions.length > 0) {
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
    }

    return { success: true };
  }

  @SubscribeMessage('submitAnswer')
  async handleSubmitAnswer(
    @MessageBody()
    data: {
      questionId: string;
      alternativeId: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const { sessionId, playerId, isHost } = client.data ?? {};

    if (!sessionId || !playerId || isHost) {
      client.emit('error', {
        message: 'Apenas players podem enviar respostas',
      });
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

  @SubscribeMessage('nextQuestion')
  async handleNextQuestion(
    @MessageBody()
    data: {
      sessionId: number | string;
      currentQuestionIndex: number;
    },
    @ConnectedSocket() client: Socket,
  ) {
    if (!client.data?.isHost) {
      client.emit('error', { message: 'Apenas o host pode avançar as perguntas' });
      return { success: false };
    }

    const sessionId = this.ensureSessionIdIsNumber(data.sessionId);
    const sessionWithQuiz =
      await this.gameSessionService.getSessionWithQuestions(sessionId);

    if (
      sessionWithQuiz &&
      data.currentQuestionIndex < sessionWithQuiz.quiz.questions.length - 1
    ) {
      const nextQuestionIndex = data.currentQuestionIndex + 1;
      const nextQuestion = sessionWithQuiz.quiz.questions[nextQuestionIndex];

      this.server.to(sessionId.toString()).emit('nextQuestion', {
        question: {
          id: nextQuestion.id,
          text: nextQuestion.text,
          alternatives: nextQuestion.alternatives.map((alt) => ({
            id: alt.id,
            text: alt.text,
          })),
        },
        currentQuestionIndex: nextQuestionIndex,
        totalQuestions: sessionWithQuiz.quiz.questions.length,
      });
    } else {
      const finalScores =
        await this.gameSessionService.getSessionScores(sessionId);
      this.server
        .to(sessionId.toString())
        .emit('quizEnded', { scores: finalScores });

      await this.gameSessionService.finishSession(sessionId);
    }

    return { success: true };
  }

  @SubscribeMessage('getScores')
  async handleGetScores(@ConnectedSocket() client: Socket) {
    const sessionId = client.data?.sessionId;

    if (!sessionId) {
      client.emit('error', {
        message: 'Não está conectado a uma sessão',
      });
      return { success: false };
    }

    const scores = await this.gameSessionService.getSessionScores(sessionId);
    this.server.to(sessionId.toString()).emit('scoresUpdate', { scores });

    return { scores };
  }
}
