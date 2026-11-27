import { RadarGateway } from './radar.gateway';
import { RoomManagerService } from '../services/room-manager.service';
import { GameRegistryService } from '../services/game-registry.service';
import { QuizGameDefinition } from '../../quiz/quiz-game.definition';

describe('RadarGateway universal protocol', () => {
  let gateway: RadarGateway;
  let roomManager: RoomManagerService;
  let gameRegistry: GameRegistryService;
  let quizGame: QuizGameDefinition;

  // Mock Socket.IO Server: registra tudo que foi emitido, por canal.
  let emittedByChannel: Record<string, Array<{ event: string; data: any }>>;
  let emittedToSockets: Array<{ event: string; data: any }>;

  const mockServer: any = {
    to: (channel: string) => ({
      emit: (event: string, data: any) => {
        if (!emittedByChannel[channel]) emittedByChannel[channel] = [];
        emittedByChannel[channel].push({ event, data });
      },
    }),
  };

  const createMockSocket = (id: string) => {
    const emitted: Array<{ event: string; data: any }> = [];
    return {
      id,
      data: {} as any,
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn((event: string, data: any) => {
        emitted.push({ event, data });
        emittedToSockets.push({ event, data });
      }),
      broadcast: {
        to: (channel: string) => ({
          emit: (event: string, data: any) => {
            if (!emittedByChannel[channel]) emittedByChannel[channel] = [];
            emittedByChannel[channel].push({ event, data });
          },
        }),
      },
      _getEmitted: () => emitted,
    };
  };

  const eventsFor = (channel: string) => emittedByChannel[channel] ?? [];

  const findEvent = (channel: string, event: string) =>
    eventsFor(channel).find((entry) => entry.event === event);

  const allEmittedEvents = () => [
    ...Object.values(emittedByChannel).flat(),
    ...emittedToSockets,
  ];

  beforeEach(() => {
    quizGame = new QuizGameDefinition();
    gameRegistry = new GameRegistryService();
    gameRegistry.register(quizGame);
    roomManager = new RoomManagerService(gameRegistry);
    gateway = new RadarGateway(roomManager, gameRegistry);
    gateway.server = mockServer;
    emittedByChannel = {};
    emittedToSockets = [];
  });

  it('runs the full quiz lifecycle using only the radar:* protocol', async () => {
    // 1. Host cria sala de quiz com perguntas realistas
    const room = await roomManager.createRoom('host-1', 'quiz', {
      title: 'Quiz de História e Geografia',
      questions: [
        {
          id: 'q-brasil',
          text: 'Qual é a capital federal do Brasil?',
          order: 0,
          alternatives: [
            { id: 'alt-bsb', text: 'Brasília', isCorrect: true },
            { id: 'alt-sp', text: 'São Paulo', isCorrect: false },
            { id: 'alt-rj', text: 'Rio de Janeiro', isCorrect: false },
            { id: 'alt-ssa', text: 'Salvador', isCorrect: false },
          ],
        },
        {
          id: 'q-franca',
          text: 'Qual monumento fica localizado em Paris?',
          order: 1,
          alternatives: [
            { id: 'alt-eiffel', text: 'Torre Eiffel', isCorrect: true },
            { id: 'alt-coliseu', text: 'Coliseu', isCorrect: false },
            {
              id: 'alt-liberdade',
              text: 'Estátua da Liberdade',
              isCorrect: false,
            },
            { id: 'alt-bigben', text: 'Big Ben', isCorrect: false },
          ],
        },
      ],
    });

    expect(room.code).toBeDefined();

    // 2. Host entra via radar:joinAsHost
    const hostSocket = createMockSocket('socket-host-1');
    const hostJoinResult = await gateway.handleRadarJoinAsHost(
      { roomCode: room.code },
      hostSocket as any,
    );
    expect(hostJoinResult.success).toBe(true);

    const hostRoomJoined = (hostSocket as any)
      ._getEmitted()
      .find((entry: any) => entry.event === 'radar:roomJoined');
    expect(hostRoomJoined).toBeDefined();
    expect(hostRoomJoined.data.isHost).toBe(true);
    expect(hostRoomJoined.data.state.status).toBe('LOBBY');
    expect(hostRoomJoined.data.state.currentQuestion).toBeNull();

    // 3. Player entra via radar:joinRoom
    const playerSocket = createMockSocket('socket-player-1');
    const playerJoinResult = await gateway.handleRadarJoinRoom(
      { roomCode: room.code, playerName: 'Controle-01' },
      playerSocket as any,
    );
    expect(playerJoinResult.success).toBe(true);
    expect(playerJoinResult.player.name).toBe('Controle-01');

    const playerRoomJoined = (playerSocket as any)
      ._getEmitted()
      .find((entry: any) => entry.event === 'radar:roomJoined');
    expect(playerRoomJoined.data.isHost).toBe(false);
    expect(playerRoomJoined.data.players).toHaveLength(1);

    const peerJoined = findEvent(room.code, 'radar:playerJoined');
    expect(peerJoined!.data.player.name).toBe('Controle-01');
    expect(peerJoined!.data.totalPlayers).toBe(1);

    // 4. Host inicia o jogo via radar:dispatchAction
    const startResult = await gateway.handleRadarDispatchAction(
      { type: 'START_GAME' },
      hostSocket as any,
    );
    expect(startResult.success).toBe(true);

    const hostStartedState = findEvent('socket-host-1', 'radar:stateUpdated');
    expect(hostStartedState!.data.status).toBe('IN_PROGRESS');
    expect(hostStartedState!.data.state.status).toBe('QUESTION_ACTIVE');
    expect(hostStartedState!.data.state.currentQuestion.id).toBe('q-brasil');
    expect(
      hostStartedState!.data.state.currentQuestion.alternatives[0].isCorrect,
    ).toBe(true);

    const playerStartedState = findEvent(
      'socket-player-1',
      'radar:stateUpdated',
    );
    expect(playerStartedState!.data.state.currentQuestion.id).toBe('q-brasil');
    expect(
      playerStartedState!.data.state.currentQuestion.alternatives[0].isCorrect,
    ).toBeUndefined();

    // 5. Player responde via radar:dispatchAction
    const submitResult = await gateway.handleRadarDispatchAction(
      {
        type: 'SUBMIT_ANSWER',
        payload: { questionId: 'q-brasil', alternativeId: 'alt-bsb' },
      },
      playerSocket as any,
    );
    expect(submitResult.response.isCorrect).toBe(true);
    expect(submitResult.response.pointsAwarded).toBe(1000);

    const playerLeaderboard = eventsFor('socket-player-1')
      .filter((entry) => entry.event === 'radar:stateUpdated')
      .at(-1);
    expect(playerLeaderboard!.data.state.isLeaderboard).toBe(true);
    expect(playerLeaderboard!.data.state.correctAlternativeId).toBe('alt-bsb');
    expect(playerLeaderboard!.data.state.myAnswer).toMatchObject({
      questionId: 'q-brasil',
      alternativeId: 'alt-bsb',
      isCorrect: true,
      pointsAwarded: 1000,
    });
    expect(playerLeaderboard!.data.state.scores[0]).toMatchObject({
      playerName: 'Controle-01',
      score: 1000,
    });

    // 6. Host avança do leaderboard para a próxima questão
    await gateway.handleRadarDispatchAction(
      { type: 'NEXT_QUESTION' },
      hostSocket as any,
    );

    const nextQuestionState = eventsFor('socket-player-1')
      .filter((entry) => entry.event === 'radar:stateUpdated')
      .at(-1);
    expect(nextQuestionState!.data.state.status).toBe('QUESTION_ACTIVE');
    expect(nextQuestionState!.data.state.currentQuestion.id).toBe('q-franca');
    expect(nextQuestionState!.data.state.myAnswer).toBeNull();

    // 7. Player responde a última pergunta e o jogo termina
    await gateway.handleRadarDispatchAction(
      {
        type: 'SUBMIT_ANSWER',
        payload: { questionId: 'q-franca', alternativeId: 'alt-eiffel' },
      },
      playerSocket as any,
    );

    const gameEnded = findEvent(room.code, 'radar:gameEnded');
    expect(gameEnded).toBeDefined();
    expect(gameEnded!.data.results[0]).toMatchObject({
      playerName: 'Controle-01',
      score: 2000,
      correctAnswers: 2,
    });

    // 8. Nenhum evento legado foi emitido pelo gateway
    expect(allEmittedEvents().length).toBeGreaterThan(0);
    for (const entry of allEmittedEvents()) {
      expect(entry.event.startsWith('radar:')).toBe(true);
    }
  });

  it('notifies peers when a player leaves via radar:leaveRoom', async () => {
    const room = await roomManager.createRoom('host-1', 'quiz', {
      title: 'Quiz',
      questions: [
        {
          id: 'q1',
          text: 'Pergunta',
          order: 0,
          alternatives: [
            { id: 'a1', text: 'A', isCorrect: true },
            { id: 'a2', text: 'B', isCorrect: false },
          ],
        },
      ],
    });

    const hostSocket = createMockSocket('socket-host');
    const playerSocket = createMockSocket('socket-player');
    await gateway.handleRadarJoinAsHost(
      { roomCode: room.code },
      hostSocket as any,
    );
    await gateway.handleRadarJoinRoom(
      { roomCode: room.code, playerName: 'Alice' },
      playerSocket as any,
    );

    const result = await gateway.handleRadarLeaveRoom(playerSocket as any);

    expect(result.success).toBe(true);
    expect(playerSocket.leave).toHaveBeenCalledWith(room.code);
    expect(findEvent(room.code, 'radar:playerLeft')?.data).toMatchObject({
      playerName: 'Alice',
    });
  });

  it('does not expose legacy quiz handlers anymore', () => {
    const legacyHandlers = [
      'handleLegacyJoinAsHost',
      'handleLegacyJoinSession',
      'handleLegacyStartQuiz',
      'handleLegacySubmitAnswer',
      'handleLegacyNextQuestion',
      'handleLegacyGetScores',
      'handleLegacyFinishQuiz',
    ];

    for (const handler of legacyHandlers) {
      expect((gateway as any)[handler]).toBeUndefined();
    }
  });
});
