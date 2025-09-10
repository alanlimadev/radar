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

  // Evento para conectar um player à sessão
  @SubscribeMessage('joinSession')
  async handleJoinSession(
    @MessageBody() data: { sessionId: number; playerName: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Cria o player na sessão
    const player = await this.gameSessionService.addPlayerToSession(
      data.sessionId,
      data.playerName,
    );

    // Armazena informações do player no socket para uso futuro
    (client as any).data = {
      sessionId: data.sessionId,
      playerId: player.id,
      playerName: data.playerName,
    };

    // Adiciona o socket à sala da sessão
    await client.join(data.sessionId.toString());
    // Notifica todos os clientes da sala
    this.server.to(data.sessionId.toString()).emit('playerJoined', player);
    return player;
  }

  // Evento para iniciar o quiz
  @SubscribeMessage('startQuiz')
  async handleStartQuiz(@MessageBody() data: { sessionId: number }) {
    // Busca a primeira pergunta do quiz
    const sessionWithQuiz =
      await this.gameSessionService.getSessionWithQuestions(data.sessionId);

    if (sessionWithQuiz && sessionWithQuiz.quiz.questions.length > 0) {
      const firstQuestion = sessionWithQuiz.quiz.questions[0];

      // Envia a primeira pergunta para todos os players
      this.server.to(data.sessionId.toString()).emit('quizStarted', {
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

  // Evento para enviar resposta
  @SubscribeMessage('submitAnswer')
  async handleSubmitAnswer(
    @MessageBody()
    data: {
      questionId: string;
      alternativeId: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    // Pega informações do socket (armazenadas no joinSession)
    const clientData = (client as any).data;
    const sessionId = clientData?.sessionId;
    const playerId = clientData?.playerId;

    if (!sessionId || !playerId) {
      client.emit('error', {
        message: 'Player não está conectado à uma sessão',
      });
      return { success: false };
    }

    // Salva a resposta no banco
    const answer = await this.gameSessionService.submitAnswer(
      playerId,
      data.questionId,
      data.alternativeId,
    );

    // Notifica que a resposta foi recebida
    client.emit('answerSubmitted', {
      success: true,
      isCorrect: answer.isCorrect,
    });

    return { success: true };
  }

  // Evento para mostrar próxima pergunta (enviado pelo professor)
  @SubscribeMessage('nextQuestion')
  async handleNextQuestion(
    @MessageBody() data: { sessionId: number; currentQuestionIndex: number },
  ) {
    const sessionWithQuiz =
      await this.gameSessionService.getSessionWithQuestions(data.sessionId);

    if (
      sessionWithQuiz &&
      data.currentQuestionIndex < sessionWithQuiz.quiz.questions.length - 1
    ) {
      const nextQuestionIndex = data.currentQuestionIndex + 1;
      const nextQuestion = sessionWithQuiz.quiz.questions[nextQuestionIndex];

      // Envia a próxima pergunta para todos os players
      this.server.to(data.sessionId.toString()).emit('nextQuestion', {
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
      // Quiz terminou - envia resultado final
      const finalScores = await this.gameSessionService.getSessionScores(
        data.sessionId,
      );
      this.server
        .to(data.sessionId.toString())
        .emit('quizEnded', { scores: finalScores });

      // Marca a sessão como finalizada
      await this.gameSessionService.finishSession(data.sessionId);
    }

    return { success: true };
  }

  // Evento para buscar placar atual
  @SubscribeMessage('getScores')
  async handleGetScores(@ConnectedSocket() client: Socket) {
    const clientData = (client as any).data;
    const sessionId = clientData?.sessionId;

    if (!sessionId) {
      client.emit('error', {
        message: 'Player não está conectado à uma sessão',
      });
      return { success: false };
    }

    const scores = await this.gameSessionService.getSessionScores(sessionId);

    // Envia o placar para todos os players da sessão
    this.server.to(sessionId.toString()).emit('scoresUpdate', { scores });

    return { scores };
  }
}
