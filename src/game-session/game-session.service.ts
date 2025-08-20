import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameSessionDto } from './dtos';

@Injectable()
export class GameSessionService {
  constructor(private prisma: PrismaService) {}

  async createSession(dto: CreateGameSessionDto) {
    return this.prisma.gameSession.create({
      data: {
        quizId: dto.quizId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
  }

  async addPlayerToSession(sessionId: string, playerName: string) {
    // Cria o player vinculado à sessão
    return this.prisma.player.create({
      data: {
        name: playerName,
        gameSessionId: sessionId,
      },
    });
  }

  async getSessionWithQuestions(sessionId: string) {
    return this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        quiz: {
          include: {
            questions: {
              include: {
                alternatives: true,
              },
              orderBy: {
                text: 'asc',
              },
            },
          },
        },
        players: true,
      },
    });
  }

  async submitAnswer(
    playerId: string,
    questionId: string,
    alternativeId: string,
  ) {
    // Busca a alternativa para verificar se está correta
    const alternative = await this.prisma.alternative.findUnique({
      where: { id: alternativeId },
    });

    // Cria a resposta do player
    return this.prisma.answer.create({
      data: {
        playerId,
        questionId,
        alternativeId,
        isCorrect: alternative?.isCorrect || false,
        answeredAt: new Date(),
      },
    });
  }

  async getSessionScores(sessionId: string) {
    // Busca todos os players da sessão com suas respostas
    const players = await this.prisma.player.findMany({
      where: { gameSessionId: sessionId },
      include: {
        answers: {
          where: { isCorrect: true },
        },
      },
    });

    // Calcula o score de cada player
    return players
      .map((player) => ({
        playerId: player.id,
        playerName: player.name,
        correctAnswers: player.answers.length,
        score: player.answers.length,
      }))
      .sort((a, b) => b.score - a.score);
  }

  async finishSession(sessionId: string) {
    return this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: 'FINISHED',
        endedAt: new Date(),
      },
    });
  }
}
