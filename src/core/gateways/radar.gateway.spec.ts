import { RadarGateway } from './radar.gateway';
import { RoomManagerService } from '../services/room-manager.service';
import { GameRegistryService } from '../services/game-registry.service';
import { QuizGameDefinition } from '../../quiz/quiz-game.definition';

describe('RadarGateway Packet Verification & Size Analysis', () => {
  let gateway: RadarGateway;
  let roomManager: RoomManagerService;
  let gameRegistry: GameRegistryService;
  let quizGame: QuizGameDefinition;

  // Mock Socket.IO Server
  const emittedToRooms: Record<string, Array<{ event: string; data: any }>> = {};
  const mockServer: any = {
    to: (room: string) => ({
      emit: (event: string, data: any) => {
        if (!emittedToRooms[room]) emittedToRooms[room] = [];
        emittedToRooms[room].push({ event, data });
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
      }),
      broadcast: {
        to: (room: string) => ({
          emit: (event: string, data: any) => {
            if (!emittedToRooms[room]) emittedToRooms[room] = [];
            emittedToRooms[room].push({ event, data });
          },
        }),
      },
      _getEmitted: () => emitted,
    };
  };

  const measureSocketIoPacket = (event: string, data?: any) => {
    const jsonStr = data !== undefined ? JSON.stringify([event, data]) : JSON.stringify([event]);
    // Em Socket.IO v4, o pacote de evento começa com o opcode "42"
    const wireStr = `42${jsonStr}`;
    return {
      jsonBytes: Buffer.byteLength(jsonStr, 'utf8'),
      wireBytes: Buffer.byteLength(wireStr, 'utf8'),
      raw: wireStr,
    };
  };

  beforeEach(() => {
    quizGame = new QuizGameDefinition();
    gameRegistry = new GameRegistryService();
    gameRegistry.register(quizGame);
    roomManager = new RoomManagerService(gameRegistry);
    gateway = new RadarGateway(roomManager, gameRegistry);
    gateway.server = mockServer;
  });

  it('verifies complete lifecycle, packet schemas, and measures exact byte sizes', async () => {
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
            { id: 'alt-liberdade', text: 'Estátua da Liberdade', isCorrect: false },
            { id: 'alt-bigben', text: 'Big Ben', isCorrect: false },
          ],
        },
      ],
    });

    expect(room.code).toBeDefined();

    // 2. Host conecta e emite joinAsHost
    const hostSocket = createMockSocket('socket-host-1');
    const hostJoinPayload = { sessionId: room.code };
    const hostJoinPkt = measureSocketIoPacket('joinAsHost', hostJoinPayload);
    console.log('\n--- PACOTES DO HOST ---');
    console.log(`[ENVIO HOST] joinAsHost: ${hostJoinPkt.wireBytes} bytes | Wire: ${hostJoinPkt.raw}`);
    expect(hostJoinPkt.wireBytes).toBeLessThan(100);

    await gateway.handleLegacyJoinAsHost(hostJoinPayload, hostSocket as any);

    // 3. Player conecta e emite joinSession
    const playerSocket = createMockSocket('socket-player-1');
    const playerJoinPayload = { sessionId: room.code, playerName: 'Controle-01' };
    const playerJoinPkt = measureSocketIoPacket('joinSession', playerJoinPayload);
    console.log(`[ENVIO PLAYER] joinSession: ${playerJoinPkt.wireBytes} bytes | Wire: ${playerJoinPkt.raw}`);
    expect(playerJoinPkt.wireBytes).toBeLessThan(120);

    const playerJoinedResult = await gateway.handleLegacyJoinSession(playerJoinPayload, playerSocket as any);
    expect(playerJoinedResult.name).toBe('Controle-01');

    // 4. Host inicia o quiz: startQuiz (sem payload)
    const startQuizPkt = measureSocketIoPacket('startQuiz');
    console.log(`[ENVIO HOST] startQuiz: ${startQuizPkt.wireBytes} bytes | Wire: ${startQuizPkt.raw}`);
    expect(startQuizPkt.wireBytes).toBeLessThan(25);

    await gateway.handleLegacyStartQuiz(hostSocket as any);

    // Verifica pacote RECEBIDO pelo player: quizStarted
    const roomEvents = emittedToRooms[room.code] || [];
    const quizStartedEvent = roomEvents.find((e) => e.event === 'quizStarted');
    expect(quizStartedEvent).toBeDefined();
    const quizStartedPkt = measureSocketIoPacket('quizStarted', quizStartedEvent!.data);
    console.log('\n--- PACOTES RECEBIDOS PELO CONTROLE/PLAYER ---');
    console.log(`[RECEBIMENTO] quizStarted: ${quizStartedPkt.wireBytes} bytes`);
    console.log(`[RECEBIMENTO payload]:`, JSON.stringify(quizStartedEvent!.data, null, 2));
    expect(quizStartedPkt.wireBytes).toBeGreaterThan(200);
    expect(quizStartedPkt.wireBytes).toBeLessThan(1500);

    // 5. Player envia resposta via submitAnswer
    const submitPayload = {
      questionId: 'q-brasil',
      alternativeId: 'alt-bsb',
    };
    const submitPkt = measureSocketIoPacket('submitAnswer', submitPayload);
    console.log(`\n[ENVIO PLAYER] submitAnswer: ${submitPkt.wireBytes} bytes | Wire: ${submitPkt.raw}`);
    expect(submitPkt.wireBytes).toBeLessThan(120);

    await gateway.handleLegacySubmitAnswer(submitPayload, playerSocket as any);

    // Verifica confirmação recebida pelo player: answerSubmitted
    const playerEmitted = playerSocket._getEmitted();
    const answerSubmittedEvt = playerEmitted.find((e) => e.event === 'answerSubmitted');
    expect(answerSubmittedEvt).toBeDefined();
    expect(answerSubmittedEvt!.data.isCorrect).toBe(true);
    expect(answerSubmittedEvt!.data.pointsAwarded).toBe(1000);

    const answerSubmittedPkt = measureSocketIoPacket('answerSubmitted', answerSubmittedEvt!.data);
    console.log(`[RECEBIMENTO] answerSubmitted: ${answerSubmittedPkt.wireBytes} bytes | Wire: ${answerSubmittedPkt.raw}`);
    expect(answerSubmittedPkt.wireBytes).toBeLessThan(100);

    // 6. Host avança para a próxima pergunta: nextQuestion (sem payload)
    const nextQuestionPkt = measureSocketIoPacket('nextQuestion');
    console.log(`\n[ENVIO HOST] nextQuestion: ${nextQuestionPkt.wireBytes} bytes | Wire: ${nextQuestionPkt.raw}`);
    expect(nextQuestionPkt.wireBytes).toBeLessThan(25);

    // 1º clique do host avança para leaderboard
    await gateway.handleLegacyNextQuestion(hostSocket as any);

    // 2º clique do host avança para próxima questão
    await gateway.handleLegacyNextQuestion(hostSocket as any);

    const nextQuestionEvt = (emittedToRooms[room.code] || []).find((e) => e.event === 'nextQuestion');
    expect(nextQuestionEvt).toBeDefined();
    const nextQuestionRecvPkt = measureSocketIoPacket('nextQuestion', nextQuestionEvt!.data);
    console.log(`[RECEBIMENTO] nextQuestion: ${nextQuestionRecvPkt.wireBytes} bytes`);
    expect(nextQuestionRecvPkt.wireBytes).toBeGreaterThan(200);
    expect(nextQuestionRecvPkt.wireBytes).toBeLessThan(1500);

    // 7. Player responde a segunda pergunta e finaliza o jogo
    await gateway.handleLegacySubmitAnswer(
      { questionId: 'q-franca', alternativeId: 'alt-eiffel' },
      playerSocket as any,
    );

    const quizEndedEvt = (emittedToRooms[room.code] || []).find((e) => e.event === 'quizEnded');
    expect(quizEndedEvt).toBeDefined();
    const quizEndedPkt = measureSocketIoPacket('quizEnded', quizEndedEvt!.data);
    console.log(`[RECEBIMENTO] quizEnded: ${quizEndedPkt.wireBytes} bytes`);
    console.log(`[RECEBIMENTO payload quizEnded]:`, JSON.stringify(quizEndedEvt!.data));
    expect(quizEndedPkt.wireBytes).toBeLessThan(2000);
  });
});
