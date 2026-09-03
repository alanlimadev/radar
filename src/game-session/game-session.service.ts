import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameSessionDto } from './dtos';
import { RoomManagerService } from '../core/services/room-manager.service';
import { QuizService } from '../quiz/quiz.service';

@Injectable()
export class GameSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roomManager: RoomManagerService,
    private readonly quizService: QuizService,
  ) {}

  async createSession(dto: CreateGameSessionDto, hostId: string) {
    const quiz = await this.quizService.findQuizById(dto.quizId);
    if (!quiz) {
      throw new NotFoundException('Quiz não encontrado');
    }

    // Inicializa a sala no RADAR Core Engine com as perguntas do Quiz
    const room = await this.roomManager.createRoom(
      hostId,
      'quiz',
      {
        quizId: quiz.id,
        title: quiz.title,
        questions: quiz.questions.map((q) => ({
          id: q.id,
          text: q.text,
          order: q.order,
          alternatives: q.alternatives.map((a) => ({
            id: a.id,
            text: a.text,
            isCorrect: a.isCorrect,
          })),
        })),
      },
    );

    // Persiste a sala no banco genérico
    await this.prisma.gameRoom.create({
      data: {
        id: room.id,
        code: room.code,
        gameType: 'quiz',
        hostId,
        status: 'IN_PROGRESS',
        config: {
          quizId: quiz.id,
          title: quiz.title,
        },
        startedAt: room.createdAt,
      },
    });

    return {
      id: room.code,
      code: room.code,
      quizId: dto.quizId,
      status: 'IN_PROGRESS',
      startedAt: room.createdAt,
      endedAt: null,
    };
  }

  async getSessionWithQuestions(sessionId: string | number) {
    const sessionStr = String(sessionId);
    const room = this.roomManager.findRoom(sessionStr);

    if (room) {
      const quizConfig = room.config as any;
      return {
        id: room.code,
        code: room.code,
        quizId: quizConfig?.quizId,
        status: room.status,
        startedAt: room.createdAt,
        endedAt: room.endedAt,
        quiz: {
          id: quizConfig?.quizId,
          title: quizConfig?.title,
          questions: quizConfig?.questions,
        },
        players: Array.from(room.players.values()),
      };
    }

    const dbRoom = await this.prisma.gameRoom.findFirst({
      where: { OR: [{ id: sessionStr }, { code: sessionStr }] },
      include: { players: true },
    });

    if (!dbRoom) {
      throw new NotFoundException('Sessão não encontrada');
    }

    return dbRoom;
  }

  async getSessionScores(sessionId: string | number) {
    const room = this.roomManager.findRoom(String(sessionId));
    if (room) {
      return this.roomManager.getFinalResults(room.code);
    }
    return [];
  }

  async getSession(sessionId: string | number) {
    const sessionStr = String(sessionId);
    const room = this.roomManager.findRoom(sessionStr);
    if (room) {
      return {
        id: room.code,
        code: room.code,
        status: room.status,
        startedAt: room.createdAt,
        endedAt: room.endedAt,
      };
    }

    return this.prisma.gameRoom.findFirst({
      where: { OR: [{ id: sessionStr }, { code: sessionStr }] },
    });
  }

  async getSessionPlayers(sessionId: string | number) {
    const room = this.roomManager.findRoom(String(sessionId));
    if (room) {
      return Array.from(room.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score ?? 0,
        gameSessionId: room.code,
      }));
    }

    const dbPlayers = await this.prisma.roomPlayer.findMany({
      where: { room: { code: String(sessionId) } },
    });

    return dbPlayers;
  }

  async finishSession(sessionId: string | number) {
    const sessionStr = String(sessionId);
    const room = this.roomManager.findRoom(sessionStr);
    if (room) {
      await this.roomManager.finishRoom(room.code);
    }

    await this.prisma.gameRoom.updateMany({
      where: { OR: [{ id: sessionStr }, { code: sessionStr }] },
      data: {
        status: 'FINISHED',
        endedAt: new Date(),
      },
    });

    return { success: true };
  }
}
