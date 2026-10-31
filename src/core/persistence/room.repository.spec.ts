import { RoomRepository } from './room.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { Player } from '../interfaces/player.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makePlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  name: `Player-${id}`,
  socketId: `sock-${id}`,
  isHost: false,
  connected: true,
  joinedAt: new Date('2026-10-29T18:00:00.000Z'),
  score: 0,
  metadata: {},
  ...overrides,
});

const makeResults = (overrides: object = {}) => ({
  schemaVersion: 1,
  session: {
    roomId: 'room-1',
    code: '123456',
    quizId: 'quiz-1',
    quizTitle: 'Revolução Francesa',
    createdAt: '2026-10-29T18:01:40.000Z',
    gameStartedAt: '2026-10-29T18:02:11.000Z',
    endedAt: '2026-10-29T18:11:43.000Z',
    durationMs: 572000,
  },
  totals: {
    players: 1,
    questions: 3,
    answers: 3,
    correct: 2,
    incorrect: 1,
    unanswered: 0,
    accuracy: 0.6667,
    answerRate: 1,
  },
  questions: [],
  players: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

const buildPrismaMock = () => {
  const gameRooms: Map<
    string,
    {
      id: string;
      code: string;
      gameType: string;
      hostId: string;
      status: string;
      config: string;
      startedAt: Date;
      endedAt: Date | null;
      results: string | null;
    }
  > = new Map();

  const roomPlayers: Map<
    string,
    {
      id: string;
      name: string;
      roomId: string;
      score: number;
      metadata: string;
      joinedAt: Date;
    }
  > = new Map();

  const prisma = {
    gameRoom: {
      count: jest.fn(({ where }: any) => {
        let count = 0;
        for (const room of gameRooms.values()) {
          if (where.code && room.code !== where.code) continue;
          count++;
        }
        return Promise.resolve(count);
      }),

      create: jest.fn(({ data }: any) => {
        gameRooms.set(data.id, {
          ...data,
          endedAt: null,
          results: null,
        });
        return Promise.resolve(data);
      }),

      findUnique: jest.fn(({ where }: any) => {
        const room = gameRooms.get(where.id);
        if (!room) return Promise.resolve(null);
        return Promise.resolve(room);
      }),

      findFirst: jest.fn(({ where }: any) => {
        for (const room of gameRooms.values()) {
          if (where.id && room.id !== where.id) continue;
          if (where.hostId && room.hostId !== where.hostId) continue;
          if (where.results?.not === null && room.results === null) continue;
          return Promise.resolve(room);
        }
        return Promise.resolve(null);
      }),

      findMany: jest.fn(({ where }: any) => {
        const results: any[] = [];
        for (const room of gameRooms.values()) {
          if (where.hostId && room.hostId !== where.hostId) continue;
          if (where.results?.not === null && room.results === null) continue;
          results.push(room);
        }
        // orderBy endedAt desc
        results.sort((a, b) => {
          const da = a.endedAt ? new Date(a.endedAt).getTime() : 0;
          const db = b.endedAt ? new Date(b.endedAt).getTime() : 0;
          return db - da;
        });
        return Promise.resolve(results);
      }),

      update: jest.fn(({ where, data }: any) => {
        const room = gameRooms.get(where.id);
        if (!room) throw new Error(`Room ${where.id} not found`);
        Object.assign(room, data);
        return Promise.resolve(room);
      }),

      deleteMany: jest.fn(({ where }: any) => {
        let count = 0;
        for (const [id, room] of gameRooms.entries()) {
          if (where.id && room.id !== where.id) continue;
          if (where.hostId && room.hostId !== where.hostId) continue;
          gameRooms.delete(id);
          count++;
        }
        return Promise.resolve({ count });
      }),
    },

    roomPlayer: {
      upsert: jest.fn(({ where, create, update }: any) => {
        const existing = roomPlayers.get(where.id);
        if (existing) {
          Object.assign(existing, update);
          return Promise.resolve(existing);
        }
        roomPlayers.set(where.id, { ...create });
        return Promise.resolve(create);
      }),

      updateMany: jest.fn(({ where, data }: any) => {
        let count = 0;
        for (const [id, player] of roomPlayers.entries()) {
          if (where.id && player.id !== where.id) continue;
          if (where.roomId && player.roomId !== where.roomId) continue;
          Object.assign(player, data);
          count++;
        }
        return Promise.resolve({ count });
      }),
    },

    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),

    // Expose internals for assertions
    _gameRooms: gameRooms,
    _roomPlayers: roomPlayers,
  };

  return prisma as unknown as PrismaService & {
    _gameRooms: typeof gameRooms;
    _roomPlayers: typeof roomPlayers;
  };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RoomRepository', () => {
  let repo: RoomRepository;
  let prisma: ReturnType<typeof buildPrismaMock>;

  const BASE_INPUT = {
    id: 'room-1',
    code: '123456',
    gameType: 'quiz',
    hostId: 'host-A',
    config: { quizId: 'quiz-1' },
    startedAt: new Date('2026-10-29T18:01:40.000Z'),
  };

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new RoomRepository(prisma);
  });

  // -------------------------------------------------------------------------
  // codeExists
  // -------------------------------------------------------------------------
  describe('codeExists', () => {
    it('returns false when no room has the code', async () => {
      expect(await repo.codeExists('999999')).toBe(false);
    });

    it('returns true after a room with that code is created', async () => {
      await repo.createRoom(BASE_INPUT);
      expect(await repo.codeExists('123456')).toBe(true);
    });

    it('returns false for a different code even if another room exists', async () => {
      await repo.createRoom(BASE_INPUT);
      expect(await repo.codeExists('000000')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // createRoom
  // -------------------------------------------------------------------------
  describe('createRoom', () => {
    it('persists the room with LOBBY status', async () => {
      await repo.createRoom(BASE_INPUT);
      const room = prisma._gameRooms.get('room-1');
      expect(room).toBeDefined();
      expect(room!.status).toBe('LOBBY');
      expect(room!.hostId).toBe('host-A');
      expect(room!.results).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // upsertPlayer
  // -------------------------------------------------------------------------
  describe('upsertPlayer', () => {
    it('creates a player record on first join', async () => {
      await repo.createRoom(BASE_INPUT);
      const player = makePlayer('p1', { score: 100 });
      await repo.upsertPlayer('room-1', player);

      const stored = prisma._roomPlayers.get('p1');
      expect(stored).toBeDefined();
      expect(stored!.score).toBe(100);
    });

    it('updates score and metadata on reconnect without creating duplicate', async () => {
      await repo.createRoom(BASE_INPUT);
      const player = makePlayer('p1', { score: 100 });
      await repo.upsertPlayer('room-1', player);
      await repo.upsertPlayer('room-1', { ...player, score: 500 });

      expect(prisma._roomPlayers.size).toBe(1);
      expect(prisma._roomPlayers.get('p1')!.score).toBe(500);
    });

    it('stores leftEarly=true when player is disconnected', async () => {
      await repo.createRoom(BASE_INPUT);
      const player = makePlayer('p1', { connected: false });
      await repo.upsertPlayer('room-1', player);

      const meta = JSON.parse(prisma._roomPlayers.get('p1')!.metadata);
      expect(meta.leftEarly).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // finishRoom — idempotência
  // -------------------------------------------------------------------------
  describe('finishRoom (idempotency)', () => {
    const endedAt = new Date('2026-10-29T18:11:43.000Z');

    it('writes results when none exist yet', async () => {
      await repo.createRoom(BASE_INPUT);
      const results = makeResults();

      await repo.finishRoom({ roomId: 'room-1', endedAt, results, players: [] });

      const room = prisma._gameRooms.get('room-1')!;
      expect(room.status).toBe('FINISHED');
      expect(JSON.parse(room.results!)).toMatchObject({ schemaVersion: 1 });
    });

    it('does NOT overwrite existing results on a second call', async () => {
      await repo.createRoom(BASE_INPUT);
      const firstResults = makeResults({ session: { quizTitle: 'First' } });
      const secondResults = makeResults({ session: { quizTitle: 'Second' } });

      await repo.finishRoom({ roomId: 'room-1', endedAt, results: firstResults, players: [] });
      await repo.finishRoom({ roomId: 'room-1', endedAt, results: secondResults, players: [] });

      const stored = JSON.parse(prisma._gameRooms.get('room-1')!.results!);
      // Must preserve the FIRST snapshot
      expect(stored.session.quizTitle).toBe('First');
    });

    it('still marks room as FINISHED even when results is null (no game started)', async () => {
      await repo.createRoom(BASE_INPUT);

      await repo.finishRoom({ roomId: 'room-1', endedAt, results: null, players: [] });

      const room = prisma._gameRooms.get('room-1')!;
      expect(room.status).toBe('FINISHED');
      expect(room.results).toBeNull();
    });

    it('updates player scores during finishRoom', async () => {
      await repo.createRoom(BASE_INPUT);
      const player = makePlayer('p1', { score: 0 });
      await repo.upsertPlayer('room-1', player);

      const finishedPlayer = { ...player, score: 1500 };
      await repo.finishRoom({
        roomId: 'room-1',
        endedAt,
        results: makeResults(),
        players: [finishedPlayer],
      });

      expect(prisma._roomPlayers.get('p1')!.score).toBe(1500);
    });
  });

  // -------------------------------------------------------------------------
  // listReports — isolamento por hostId
  // -------------------------------------------------------------------------
  describe('listReports (host isolation)', () => {
    const endedAt = new Date('2026-10-29T18:11:43.000Z');

    const createFinishedRoom = async (id: string, code: string, hostId: string) => {
      await repo.createRoom({ ...BASE_INPUT, id, code, hostId });
      const base = makeResults();
      await repo.finishRoom({
        roomId: id,
        endedAt,
        results: {
          ...base,
          session: { ...base.session, roomId: id, code, quizTitle: `Quiz-${id}` },
        },
        players: [],
      });
    };

    it('returns only the reports that belong to the requesting host', async () => {
      await createFinishedRoom('room-A1', '111111', 'host-A');
      await createFinishedRoom('room-A2', '222222', 'host-A');
      await createFinishedRoom('room-B1', '333333', 'host-B');

      const { items, total } = await repo.listReports('host-A', { limit: 20, offset: 0 });

      expect(total).toBe(2);
      expect(items.every((r) => r.id !== 'room-B1')).toBe(true);
    });

    it('returns an empty list when the host has no finished reports', async () => {
      await createFinishedRoom('room-B1', '111111', 'host-B');

      const { items, total } = await repo.listReports('host-A', { limit: 20, offset: 0 });

      expect(total).toBe(0);
      expect(items).toHaveLength(0);
    });

    it('does not include rooms without results (game never started)', async () => {
      await repo.createRoom({ ...BASE_INPUT, id: 'room-no-report', code: '444444' });
      await repo.finishRoom({ roomId: 'room-no-report', endedAt, results: null, players: [] });

      const { items } = await repo.listReports('host-A', { limit: 20, offset: 0 });

      expect(items.find((r) => r.id === 'room-no-report')).toBeUndefined();
    });

    it('supports pagination via limit and offset', async () => {
      await createFinishedRoom('room-A1', '111111', 'host-A');
      await createFinishedRoom('room-A2', '222222', 'host-A');
      await createFinishedRoom('room-A3', '333333', 'host-A');

      const page1 = await repo.listReports('host-A', { limit: 2, offset: 0 });
      const page2 = await repo.listReports('host-A', { limit: 2, offset: 2 });

      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(3);
      expect(page2.items).toHaveLength(1);
    });

    it('filters by quizId when provided', async () => {
      // room-A1: quizId = 'quiz-1' (default from BASE_INPUT / makeResults)
      await createFinishedRoom('room-A1', '111111', 'host-A');

      // room-A2: different quizId
      await repo.createRoom({ ...BASE_INPUT, id: 'room-A2', code: '222222', hostId: 'host-A' });
      await repo.finishRoom({
        roomId: 'room-A2',
        endedAt,
        results: {
          schemaVersion: 1,
          session: {
            roomId: 'room-A2',
            code: '222222',
            quizId: 'quiz-OTHER',
            quizTitle: 'Outro Quiz',
            createdAt: '2026-10-29T18:01:40.000Z',
            gameStartedAt: '2026-10-29T18:02:11.000Z',
            endedAt: '2026-10-29T18:11:43.000Z',
            durationMs: 572000,
          },
          totals: { players: 0, questions: 0, answers: 0, correct: 0, incorrect: 0, unanswered: 0, accuracy: 0, answerRate: 0 },
          questions: [],
          players: [],
        },
        players: [],
      });

      const { items, total } = await repo.listReports('host-A', {
        limit: 20,
        offset: 0,
        quizId: 'quiz-1',
      });

      expect(total).toBe(1);
      expect(items[0].id).toBe('room-A1');
    });
  });

  // -------------------------------------------------------------------------
  // findReport — isolamento por hostId
  // -------------------------------------------------------------------------
  describe('findReport (host isolation)', () => {
    const endedAt = new Date('2026-10-29T18:11:43.000Z');

    it('returns the report when the correct host requests it', async () => {
      await repo.createRoom(BASE_INPUT);
      await repo.finishRoom({ roomId: 'room-1', endedAt, results: makeResults(), players: [] });

      const report = await repo.findReport('room-1', 'host-A');
      expect(report).not.toBeNull();
      expect(report!.id).toBe('room-1');
    });

    it('returns null when a different host requests the same report (isolation — yields 404, not 403)', async () => {
      await repo.createRoom(BASE_INPUT);
      await repo.finishRoom({ roomId: 'room-1', endedAt, results: makeResults(), players: [] });

      const report = await repo.findReport('room-1', 'host-B');
      expect(report).toBeNull();
    });

    it('returns null when the room exists but has no results', async () => {
      await repo.createRoom(BASE_INPUT);
      await repo.finishRoom({ roomId: 'room-1', endedAt, results: null, players: [] });

      const report = await repo.findReport('room-1', 'host-A');
      expect(report).toBeNull();
    });

    it('returns null for a non-existent report id', async () => {
      const report = await repo.findReport('does-not-exist', 'host-A');
      expect(report).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // deleteReport — isolamento por hostId
  // -------------------------------------------------------------------------
  describe('deleteReport (host isolation)', () => {
    const endedAt = new Date('2026-10-29T18:11:43.000Z');

    it('deletes the report and returns count=1 for the owner', async () => {
      await repo.createRoom(BASE_INPUT);
      await repo.finishRoom({ roomId: 'room-1', endedAt, results: makeResults(), players: [] });

      const count = await repo.deleteReport('room-1', 'host-A');
      expect(count).toBe(1);
      expect(prisma._gameRooms.has('room-1')).toBe(false);
    });

    it('returns count=0 when a different host tries to delete (no side-effects)', async () => {
      await repo.createRoom(BASE_INPUT);
      await repo.finishRoom({ roomId: 'room-1', endedAt, results: makeResults(), players: [] });

      const count = await repo.deleteReport('room-1', 'host-B');
      expect(count).toBe(0);
      // Room must still be there
      expect(prisma._gameRooms.has('room-1')).toBe(true);
    });

    it('returns count=0 for a non-existent report id', async () => {
      const count = await repo.deleteReport('ghost-room', 'host-A');
      expect(count).toBe(0);
    });

    it('a second delete after successful delete returns count=0 (double-delete safe)', async () => {
      await repo.createRoom(BASE_INPUT);
      await repo.finishRoom({ roomId: 'room-1', endedAt, results: makeResults(), players: [] });

      await repo.deleteReport('room-1', 'host-A');
      const second = await repo.deleteReport('room-1', 'host-A');
      expect(second).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // PIN collision (codeExists used by room-manager)
  // -------------------------------------------------------------------------
  describe('PIN collision guard', () => {
    it('codeExists reflects rooms that are already FINISHED (historic PINs)', async () => {
      await repo.createRoom(BASE_INPUT);
      await repo.finishRoom({
        roomId: 'room-1',
        endedAt: new Date(),
        results: makeResults(),
        players: [],
      });

      // The finished room's PIN must still be detectable so new rooms don't reuse it
      expect(await repo.codeExists('123456')).toBe(true);
    });
  });
});
