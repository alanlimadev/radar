import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Player } from '../interfaces/player.interface';

export interface CreateRoomRecordInput {
  id: string;
  code: string;
  gameType: string;
  hostId: string;
  config: unknown;
  startedAt: Date;
}

export interface FinishRoomRecordInput {
  roomId: string;
  endedAt: Date;
  results: unknown | null;
  players: Player[];
}

export interface ReportSummary {
  id: string;
  code: string;
  quizId: string | null;
  quizTitle: string;
  endedAt: string;
  durationMs: number;
  playerCount: number;
  questionCount: number;
  accuracy: number;
}

/**
 * Persistência das salas/participantes/relatórios em SQLite.
 * O core só conhece este repositório; nenhuma regra de quiz vive aqui.
 */
@Injectable()
export class RoomRepository {
  private readonly logger = new Logger(RoomRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async codeExists(code: string): Promise<boolean> {
    const count = await this.prisma.gameRoom.count({ where: { code } });
    return count > 0;
  }

  async createRoom(input: CreateRoomRecordInput): Promise<void> {
    await this.prisma.gameRoom.create({
      data: {
        id: input.id,
        code: input.code,
        gameType: input.gameType,
        hostId: input.hostId,
        status: 'LOBBY',
        config: JSON.stringify(input.config ?? {}),
        startedAt: input.startedAt,
      },
    });
  }

  async upsertPlayer(roomId: string, player: Player): Promise<void> {
    const metadata = JSON.stringify({
      ...(player.metadata ?? {}),
      joinedAt: player.joinedAt.toISOString(),
      leftEarly: player.connected === false,
    });

    await this.prisma.roomPlayer.upsert({
      where: { id: player.id },
      create: {
        id: player.id,
        name: player.name,
        roomId,
        score: player.score ?? 0,
        metadata,
        joinedAt: player.joinedAt,
      },
      update: {
        name: player.name,
        score: player.score ?? 0,
        metadata,
      },
    });
  }

  /** Atualiza as pontuações de todos os jogadores em uma única transação. */
  async updateScores(roomId: string, players: Player[]): Promise<void> {
    if (players.length === 0) return;

    await this.prisma.$transaction(
      players.map((player) =>
        this.prisma.roomPlayer.updateMany({
          where: { id: player.id, roomId },
          data: {
            score: player.score ?? 0,
            metadata: JSON.stringify({
              ...(player.metadata ?? {}),
              joinedAt: player.joinedAt.toISOString(),
              leftEarly: player.connected === false,
            }),
          },
        }),
      ),
    );
  }

  /**
   * Encerra a sala e grava o snapshot. Idempotente: se `results` já existe,
   * o conteúdo anterior é preservado.
   */
  async finishRoom(input: FinishRoomRecordInput): Promise<void> {
    const existing = await this.prisma.gameRoom.findUnique({
      where: { id: input.roomId },
      select: { results: true },
    });

    const shouldWriteResults =
      input.results !== null && existing?.results == null;

    await this.prisma.$transaction([
      this.prisma.gameRoom.update({
        where: { id: input.roomId },
        data: {
          status: 'FINISHED',
          endedAt: input.endedAt,
          ...(shouldWriteResults
            ? { results: JSON.stringify(input.results) }
            : {}),
        },
      }),
      ...input.players.map((player) =>
        this.prisma.roomPlayer.updateMany({
          where: { id: player.id, roomId: input.roomId },
          data: {
            score: player.score ?? 0,
            metadata: JSON.stringify({
              ...(player.metadata ?? {}),
              joinedAt: player.joinedAt.toISOString(),
              leftEarly: player.connected === false,
            }),
          },
        }),
      ),
    ]);
  }

  async listReports(
    hostId: string,
    options: { limit: number; offset: number; quizId?: string },
  ): Promise<{ items: ReportSummary[]; total: number }> {
    const rooms = await this.prisma.gameRoom.findMany({
      where: { hostId, results: { not: null } },
      orderBy: { endedAt: 'desc' },
    });

    const allItems: ReportSummary[] = [];
    for (const room of rooms) {
      if (!room.results) continue;
      try {
        const parsed = JSON.parse(room.results);
        const session = parsed?.session ?? {};
        const totals = parsed?.totals ?? {};

        if (options.quizId && session.quizId !== options.quizId) {
          continue;
        }

        allItems.push({
          id: room.id,
          code: room.code,
          quizId: session.quizId ?? null,
          quizTitle: session.quizTitle ?? 'Quiz',
          endedAt: (
            room.endedAt ?? new Date(session.endedAt ?? Date.now())
          ).toISOString(),
          durationMs: Number(session.durationMs ?? 0),
          playerCount: Number(totals.players ?? 0),
          questionCount: Number(totals.questions ?? 0),
          accuracy: Number(totals.accuracy ?? 0),
        });
      } catch (error) {
        this.logger.warn(
          `Relatório inválido na sala ${room.id}: ${(error as Error).message}`,
        );
      }
    }

    const start = Math.max(0, options.offset);
    const end = start + Math.max(1, options.limit);
    return {
      items: allItems.slice(start, end),
      total: allItems.length,
    };
  }

  async findReport(
    reportId: string,
    hostId: string,
  ): Promise<{ id: string; results: any } | null> {
    const room = await this.prisma.gameRoom.findFirst({
      where: { id: reportId, hostId, results: { not: null } },
      select: { id: true, results: true },
    });

    if (!room?.results) return null;

    try {
      return { id: room.id, results: JSON.parse(room.results) };
    } catch (error) {
      this.logger.warn(
        `Relatório inválido na sala ${room.id}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Hard delete restrito ao dono. Retorna quantos registros foram removidos. */
  async deleteReport(reportId: string, hostId: string): Promise<number> {
    const result = await this.prisma.gameRoom.deleteMany({
      where: { id: reportId, hostId },
    });
    return result.count;
  }
}
