import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { Server as HttpServer } from 'http';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';

interface StateUpdatedPayload {
  status: string;
  state: {
    status: string;
    isFinished: boolean;
    isLeaderboard: boolean;
    currentQuestion: null | {
      id: string;
      text: string;
      timeLimitSeconds: number;
      alternatives: Array<{ id: string; text: string; isCorrect?: boolean }>;
    };
    myAnswer: null | {
      questionId: string;
      alternativeId: string;
      isCorrect: boolean;
      pointsAwarded: number;
    };
    scores: Array<{
      playerId: string;
      name: string;
      score: number;
      correctAnswers: number;
    }>;
  };
}

interface RoomJoinedPayload {
  isHost: boolean;
  room: { code: string; status: string };
  state: {
    status: string;
    currentQuestion: null;
  };
  players: Array<{ id: string; name: string }>;
}

interface PlayerJoinedPayload {
  player: { name: string };
}

const waitForEvent = <T>(
  socket: Socket,
  event: string,
  timeoutMs = 3000,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout aguardando ${event}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };

    socket.on(event, handler);
  });

const emitWithAck = <T>(
  socket: Socket,
  event: string,
  payload?: unknown,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout aguardando ack de ${event}`));
    }, 3000);

    socket.emit(event, payload, (ack: T) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });

const connectSocket = async (url: string): Promise<Socket> => {
  const socket = io(url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

  return socket;
};

describe('RADAR WebSocket (e2e) — protocolo universal', () => {
  let app: INestApplication;
  let dataDir: string;
  let originalDatabaseUrl: string | undefined;
  let hostSocket: Socket | undefined;
  let playerSocket: Socket | undefined;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-ws-e2e-'));
    const dataPath = path.join(dataDir, 'data');
    fs.mkdirSync(dataPath, { recursive: true });

    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.RADAR_DATA_DIR = dataDir;
    process.env.DATABASE_URL = `file:${path.join(dataPath, 'radar.db')}`;

    execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
      cwd: path.join(__dirname, '..'),
      env: process.env,
      stdio: 'pipe',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    hostSocket?.disconnect();
    playerSocket?.disconnect();
    await app?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.RADAR_DATA_DIR;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('executa host + player + resposta final sem emitir eventos legados', async () => {
    const httpServer = app.getHttpServer() as HttpServer;
    const address = httpServer.address() as AddressInfo;
    const serverUrl = `http://127.0.0.1:${address.port}`;

    const register = await request(httpServer)
      .post('/auth/register')
      .send({ username: 'professor.ws', password: 'senha123' })
      .expect(201);
    const { access_token: token } = register.body as { access_token: string };

    const quiz = await request(httpServer)
      .post('/quizzes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Quiz WebSocket',
        questions: [
          {
            text: 'Qual é a capital do Brasil?',
            timeLimitSeconds: 20,
            alternatives: [
              { text: 'Brasília', isCorrect: true },
              { text: 'Rio de Janeiro', isCorrect: false },
              { text: 'São Paulo', isCorrect: false },
              { text: 'Salvador', isCorrect: false },
            ],
          },
        ],
      })
      .expect(201);

    const quizBody = quiz.body as { id: string };
    const room = await request(httpServer)
      .post('/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        gameType: 'quiz',
        config: { quizId: quizBody.id },
      })
      .expect(201);

    const roomBody = room.body as { code: string };
    const roomCode = roomBody.code;
    hostSocket = await connectSocket(serverUrl);
    playerSocket = await connectSocket(serverUrl);

    const legacyEvents = [
      'joinAsHost',
      'joinSession',
      'startQuiz',
      'nextQuestion',
      'submitAnswer',
      'getScores',
      'finishQuiz',
      'existingPlayers',
      'playerJoined',
      'playerLeft',
      'quizStarted',
      'answerSubmitted',
      'scoresUpdate',
      'questionEnded',
      'quizEnded',
      'sessionFinished',
      'error',
    ];
    const receivedLegacyEvents: string[] = [];
    for (const socket of [hostSocket, playerSocket]) {
      for (const event of legacyEvents) {
        socket.on(event, () => receivedLegacyEvents.push(event));
      }
    }

    // Host entra via radar:joinAsHost
    const hostJoinedPromise = waitForEvent<RoomJoinedPayload>(
      hostSocket,
      'radar:roomJoined',
    );
    const hostJoinAck = await emitWithAck<{ success: boolean }>(
      hostSocket,
      'radar:joinAsHost',
      { roomCode },
    );
    expect(hostJoinAck.success).toBe(true);
    const hostJoined = await hostJoinedPromise;
    expect(hostJoined.isHost).toBe(true);
    expect(hostJoined.state.status).toBe('LOBBY');
    expect(hostJoined.state.currentQuestion).toBeNull();

    // Player entra via radar:joinRoom
    const hostPlayerJoinedPromise = waitForEvent<PlayerJoinedPayload>(
      hostSocket,
      'radar:playerJoined',
    );
    const playerJoinedPromise = waitForEvent<RoomJoinedPayload>(
      playerSocket,
      'radar:roomJoined',
    );
    const playerJoinAck = await emitWithAck<{ success: boolean }>(
      playerSocket,
      'radar:joinRoom',
      { roomCode, playerName: 'Alice' },
    );
    expect(playerJoinAck.success).toBe(true);
    const playerJoined = await playerJoinedPromise;
    const hostPlayerJoined = await hostPlayerJoinedPromise;
    expect(playerJoined.players).toHaveLength(1);
    expect(hostPlayerJoined.player.name).toBe('Alice');

    // START_GAME via radar:dispatchAction
    const hostStartedPromise = waitForEvent<StateUpdatedPayload>(
      hostSocket,
      'radar:stateUpdated',
    );
    const playerStartedPromise = waitForEvent<StateUpdatedPayload>(
      playerSocket,
      'radar:stateUpdated',
    );
    const startAck = await emitWithAck<{ success: boolean }>(
      hostSocket,
      'radar:dispatchAction',
      { type: 'START_GAME' },
    );
    expect(startAck.success).toBe(true);

    const [hostStarted, playerStarted] = await Promise.all([
      hostStartedPromise,
      playerStartedPromise,
    ]);
    expect(hostStarted.state.status).toBe('QUESTION_ACTIVE');
    expect(hostStarted.state.currentQuestion?.timeLimitSeconds).toBe(20);
    expect(hostStarted.state.currentQuestion?.alternatives[0].isCorrect).toBe(
      true,
    );
    expect(playerStarted.state.currentQuestion?.alternatives[0].isCorrect).toBe(
      undefined,
    );

    // SUBMIT_ANSWER via radar:dispatchAction
    const playerFinishedStatePromise = waitForEvent<StateUpdatedPayload>(
      playerSocket,
      'radar:stateUpdated',
    );
    const gameEndedPromise = waitForEvent<{
      results: Array<{
        playerName: string;
        score: number;
        correctAnswers: number;
      }>;
    }>(playerSocket, 'radar:gameEnded');
    const answerAck = await emitWithAck<{
      response: { isCorrect: boolean; pointsAwarded: number };
    }>(playerSocket, 'radar:dispatchAction', {
      type: 'SUBMIT_ANSWER',
      payload: {
        questionId: playerStarted.state.currentQuestion!.id,
        alternativeId: playerStarted.state.currentQuestion!.alternatives[0].id,
      },
    });
    expect(answerAck.response).toMatchObject({
      isCorrect: true,
      pointsAwarded: 1000,
    });

    const [playerFinishedState, gameEnded] = await Promise.all([
      playerFinishedStatePromise,
      gameEndedPromise,
    ]);
    expect(playerFinishedState.state.isFinished).toBe(true);
    expect(playerFinishedState.state.myAnswer).toMatchObject({
      isCorrect: true,
      pointsAwarded: 1000,
    });
    expect(playerFinishedState.state.scores[0]).toMatchObject({
      name: 'Alice',
      score: 1000,
      correctAnswers: 1,
    });
    expect(gameEnded.results[0]).toMatchObject({
      playerName: 'Alice',
      score: 1000,
      correctAnswers: 1,
    });
    expect(receivedLegacyEvents).toEqual([]);
  });
});
