import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameSessionDto } from './dtos';

@Injectable()
export class GameSessionService {
  constructor(private prisma: PrismaService) {}

  async createSession(dto: CreateGameSessionDto, hostId: string) {
    return this.prisma.gameSession.create({
      data: {
        quizId: dto.quizId,
        hostId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
  }

  async addPlayerToSession(sessionId: number, playerName: string) {
    // Cria o player vinculado à sessão
    return this.prisma.player.create({
      data: {
        name: playerName,
        gameSessionId: sessionId,
      },
    });
  }

  async getSessionWithQuestions(sessionId: number) {
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
                order: 'asc',
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
    const alternative = await this.prisma.alternative.findUnique({
      where: { id: alternativeId },
    });

    if (!alternative || alternative.questionId !== questionId) {
      throw new BadRequestException(
        'Alternativa inválida para esta pergunta.',
      );
    }

    return this.prisma.answer.create({
      data: {
        playerId,
        questionId,
        alternativeId,
        isCorrect: alternative.isCorrect,
        answeredAt: new Date(),
      },
    });
  }

  async getSessionScores(sessionId: number) {
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

  async getSession(sessionId: number) {
    return this.prisma.gameSession.findUnique({
      where: { id: sessionId },
    });
  }

  async getSessionPlayers(sessionId: number) {
    return this.prisma.player.findMany({
      where: { gameSessionId: sessionId },
    });
  }

  async finishSession(sessionId: number) {
    return this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: 'FINISHED',
        endedAt: new Date(),
      },
    });
  }
}
