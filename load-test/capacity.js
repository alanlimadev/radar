#!/usr/bin/env node
/**
 * load-test/capacity.js — Suíte de testes de carga do RADAR.
 *
 * Emula N clientes virtuais (bots) que se conectam concorrentemente ao
 * RadarGateway via Socket.IO, ingressam em uma mesma sala utilizando um PIN
 * válido (roomCode de 6 dígitos) e submetem respostas simultâneas a cada
 * rodada. A instrumentação monitora:
 *
 *   1. a taxa de sucesso no handshake WebSocket;
 *   2. o tempo médio de confirmação de entrada (`radar:roomJoined`);
 *   3. a ausência de timeouts sob rajadas de eventos;
 *   4. a consistência entre o placar calculado em memória (`radar:gameEnded`)
 *      e o relatório persistido no SQLite (`GET /reports/:id`).
 *
 * Uso:
 *   node load-test/capacity.js                  # 30 bots, sobe servidor local
 *   node load-test/capacity.js --bots 50        # 50 bots
 *   node load-test/capacity.js --url http://localhost:3333
 *                                                # aponta para servidor já em execução
 *
 * No modo padrão, o servidor é erguido a partir do build compilado (dist/)
 * com um banco SQLite isolado em diretório temporário — nenhum dado de
 * desenvolvimento é tocado. Requer `npm run build` prévio.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { io } = require('socket.io-client');

const RADAR_ROOT = path.resolve(__dirname, '..');
const QUESTION_COUNT = 5;
const TIME_LIMIT_SECONDS = 10;
const MAX_PLAYERS_SUPPORTED = 200;

function parseArgs(argv) {
  const args = { bots: 30, url: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--bots') args.bots = Number(argv[i + 1] ?? 30);
    if (argv[i] === '--url') args.url = argv[i + 1] ?? null;
  }
  if (!Number.isFinite(args.bots) || args.bots < 1) {
    console.error('Número de bots inválido (use --bots N, N >= 1).');
    process.exit(1);
  }
  if (args.bots > MAX_PLAYERS_SUPPORTED) {
    console.error(
      `O domínio de quiz limita salas a ${MAX_PLAYERS_SUPPORTED} jogadores; use no máximo ${MAX_PLAYERS_SUPPORTED} bots.`,
    );
    process.exit(1);
  }
  return args;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function avg(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function emitAck(socket, event, payload, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      resolve({ timedOut: true, latencyMs: Date.now() - startedAt });
    }, timeoutMs);
    socket.emit(event, payload, (ack) => {
      clearTimeout(timer);
      resolve({ timedOut: false, ack, latencyMs: Date.now() - startedAt });
    });
  });
}

function waitFor(predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - startedAt > timeoutMs) {
        return reject(new Error(`Timeout aguardando ${label}`));
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const startedAt = Date.now();

  const metrics = {
    bots: args.bots,
    handshakeOk: 0,
    handshakeFail: 0,
    joinLatencies: [],
    joinTimeouts: 0,
    questionLatencies: [],
    questionTimeouts: 0,
    ackLatencies: [],
    ackTimeouts: 0,
    gameEndedTimeout: false,
    consistencyOk: false,
    consistentPlayers: 0,
    reportAnswers: 0,
    expectedAnswers: args.bots * QUESTION_COUNT,
  };

  let app = null;
  let dataDir = null;
  const sockets = [];

  const watchdog = setTimeout(() => {
    console.error('\nLOAD FAIL: timeout global (90s) — abortando.');
    process.exit(1);
  }, 90_000);
  watchdog.unref?.();

  try {
    let baseUrl = args.url;

    if (!baseUrl) {
      // Banco isolado em temporário: nunca toca o banco de desenvolvimento.
      dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-capacity-'));
      process.env.RADAR_DATA_DIR = dataDir;
      process.env.DATABASE_URL = `file:${path.join(dataDir, 'radar.db')}`;

      execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
        cwd: RADAR_ROOT,
        env: process.env,
        stdio: 'pipe',
      });

      const appModulePath = path.join(RADAR_ROOT, 'dist', 'app.module.js');
      if (!fs.existsSync(appModulePath)) {
        throw new Error(
          'dist/app.module.js não encontrado — rode `npm run build` antes do teste de carga.',
        );
      }

      const { NestFactory } = require(path.join(RADAR_ROOT, 'node_modules', '@nestjs', 'core'));
      const { ValidationPipe } = require(path.join(RADAR_ROOT, 'node_modules', '@nestjs', 'common'));
      const { AppModule } = require(appModulePath);

      app = await NestFactory.create(AppModule, { logger: false });
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address();
      baseUrl = `http://127.0.0.1:${address.port}`;
    }

    const api = async (method, route, body, token) => {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      const parsed = text ? JSON.parse(text) : null;
      if (!response.ok) {
        throw new Error(`${method} ${route} -> ${response.status}: ${text}`);
      }
      return parsed;
    };

    // ---- Preparação do conteúdo (REST, como o professor faria) ----
    const suffix = crypto.randomUUID().slice(0, 8);
    const registered = await api('POST', '/auth/register', {
      username: `capacity.${suffix}`,
      password: 'senha123',
    });
    const token = registered.access_token;

    const quiz = await api(
      'POST',
      '/quizzes',
      {
        title: `Capacidade ${suffix}`,
        questions: Array.from({ length: QUESTION_COUNT }, (_, qIdx) => ({
          text: `Pergunta ${qIdx + 1} da suíte de carga?`,
          timeLimitSeconds: TIME_LIMIT_SECONDS,
          alternatives: [
            { text: 'Alternativa correta', isCorrect: true },
            { text: 'Alternativa errada A', isCorrect: false },
            { text: 'Alternativa errada B', isCorrect: false },
            { text: 'Alternativa errada C', isCorrect: false },
          ],
        })),
      },
      token,
    );

    // Gabarito pelo REST (o jogador nunca recebe isCorrect durante a partida).
    const quizDetails = await api('GET', `/quizzes/${quiz.id}`, undefined, token);
    const groundTruth = new Map(
      quizDetails.questions.map((question) => {
        const correct = question.alternatives.find((a) => a.isCorrect);
        const wrong = question.alternatives.find((a) => !a.isCorrect);
        return [question.id, { correctId: correct.id, wrongId: wrong.id }];
      }),
    );

    const room = await api(
      'POST',
      '/rooms',
      { gameType: 'quiz', config: { quizId: quiz.id } },
      token,
    );

    // ---- Host ----
    const hostSocket = io(baseUrl, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(hostSocket);

    const hostSeen = { playerJoined: 0, leaderboard: new Map(), gameEnded: null, reportId: null };
    hostSocket.on('radar:playerJoined', () => {
      hostSeen.playerJoined += 1;
    });
    hostSocket.on('radar:stateUpdated', (payload) => {
      if (payload?.state?.isLeaderboard && payload.state.currentQuestionIndex !== undefined) {
        hostSeen.leaderboard.set(payload.state.currentQuestionIndex, true);
      }
    });
    hostSocket.on('radar:gameEnded', (payload) => {
      hostSeen.gameEnded = payload;
      hostSeen.reportId = payload?.reportId ?? null;
    });

    await new Promise((resolve, reject) => {
      hostSocket.once('connect', resolve);
      hostSocket.once('connect_error', reject);
    });
    const hostJoin = await emitAck(hostSocket, 'radar:joinAsHost', { roomCode: room.code }, 10_000);
    if (hostJoin.timedOut || hostJoin.ack?.success !== true) {
      throw new Error(`Host não conseguiu entrar na sala: ${JSON.stringify(hostJoin.ack)}`);
    }

    // ---- Bots: handshake concorrente ----
    const bots = Array.from({ length: args.bots }, (_, i) => ({
      index: i,
      name: `Bot-${String(i + 1).padStart(3, '0')}`,
      socket: io(baseUrl, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      }),
      connected: false,
      joined: false,
      active: true,
      joinLatencyMs: null,
      questionEventAt: null,
      currentQuestion: null,
    }));
    bots.forEach((bot) => sockets.push(bot.socket));

    await Promise.all(
      bots.map(
        (bot) =>
          new Promise((resolve) => {
            const timer = setTimeout(() => {
              if (!bot.connected) {
                metrics.handshakeFail += 1;
                bot.active = false;
              }
              resolve();
            }, 10_000);
            bot.socket.once('connect', () => {
              clearTimeout(timer);
              bot.connected = true;
              metrics.handshakeOk += 1;
              resolve();
            });
            bot.socket.once('connect_error', () => {
              clearTimeout(timer);
              metrics.handshakeFail += 1;
              bot.active = false;
              resolve();
            });
          }),
      ),
    );

    // ---- Bots: ingresso na mesma sala (PIN válido) ----
    const joinPromises = bots.map(async (bot) => {
      if (!bot.active) return;
      bot.socket.on('radar:roomJoined', (payload) => {
        if (payload?.player?.name === bot.name) {
          bot.joined = true;
          bot.joinLatencyMs = Date.now() - bot.joinEmittedAt;
        }
      });
      bot.joinEmittedAt = Date.now();
      await emitAck(bot.socket, 'radar:joinRoom', { roomCode: room.code, playerName: bot.name }, 10_000);
      await waitFor(() => bot.joined, 10_000, `radar:roomJoined do ${bot.name}`).catch(() => {
        metrics.joinTimeouts += 1;
        bot.active = false;
      });
      if (bot.joined) metrics.joinLatencies.push(bot.joinLatencyMs);
    });
    await Promise.all(joinPromises);

    const activeBots = bots.filter((bot) => bot.active);
    if (activeBots.length === 0) throw new Error('Nenhum bot ingressou na sala.');

    // Bots escutam a questão ativa por rodada.
    bots.forEach((bot) => {
      bot.socket.on('radar:stateUpdated', (payload) => {
        const state = payload?.state;
        if (state?.currentQuestion && !state.isLeaderboard && !state.isFinished) {
          bot.currentQuestion = {
            index: state.currentQuestionIndex,
            id: state.currentQuestion.id,
            receivedAt: Date.now(),
          };
        }
      });
    });

    // ---- Início da partida e rajadas de respostas ----
    await emitAck(hostSocket, 'radar:dispatchAction', { type: 'START_GAME' }, 10_000);

    for (let round = 0; round < QUESTION_COUNT; round += 1) {
      // Todos os bots devem receber a questão antes da rajada (sincronia real).
      await Promise.all(
        activeBots.map((bot) =>
          waitFor(
            () => bot.currentQuestion?.index === round,
            20_000,
            `questão ${round + 1} para ${bot.name}`,
          )
            .then(() => metrics.questionLatencies.push(Date.now() - bot.currentQuestion.receivedAt))
            .catch(() => {
              metrics.questionTimeouts += 1;
            }),
        ),
      );

      const readyBots = activeBots.filter((bot) => bot.currentQuestion?.index === round);
      const answers = readyBots.map((bot) => {
        const truth = groundTruth.get(bot.currentQuestion.id);
        const alternativeId = bot.index % 2 === 0 ? truth.correctId : truth.wrongId;
        return {
          bot,
          promise: emitAck(
            bot.socket,
            'radar:dispatchAction',
            {
              type: 'SUBMIT_ANSWER',
              payload: { questionId: bot.currentQuestion.id, alternativeId },
            },
            10_000,
          ),
        };
      });

      // Rajada: todos os emits disparados no mesmo tick.
      const results = await Promise.all(answers.map((entry) => entry.promise));
      for (const result of results) {
        if (result.timedOut) metrics.ackTimeouts += 1;
        else metrics.ackLatencies.push(result.latencyMs);
      }

      if (round < QUESTION_COUNT - 1) {
        await waitFor(
          () => hostSeen.leaderboard.has(round),
          20_000,
          `leaderboard da rodada ${round + 1}`,
        ).catch(() => {
          metrics.questionTimeouts += 1;
        });
        await emitAck(hostSocket, 'radar:dispatchAction', { type: 'NEXT_QUESTION' }, 10_000);
      }
    }

    await waitFor(() => hostSeen.gameEnded !== null, 20_000, 'radar:gameEnded').catch(() => {
      metrics.gameEndedTimeout = true;
    });

    // ---- Consistência: placar em memória x relatório persistido ----
    if (hostSeen.gameEnded && hostSeen.reportId) {
      const report = await api('GET', `/reports/${hostSeen.reportId}`, undefined, token);
      const memoryScores = new Map(
        hostSeen.gameEnded.results.map((result) => [result.playerName, result.score]),
      );
      const reportScores = new Map(report.players.map((player) => [player.name, player.score]));

      let consistent = 0;
      for (const [name, score] of memoryScores) {
        if (reportScores.get(name) === score) consistent += 1;
      }
      metrics.consistentPlayers = consistent;
      metrics.consistencyOk =
        report.totals?.players === args.bots &&
        report.totals?.answers === metrics.expectedAnswers &&
        consistent === memoryScores.size;
      metrics.reportAnswers = report.totals?.answers ?? 0;
    }

    // ---- Relatório ----
    const totalMs = Date.now() - startedAt;
    const pass =
      metrics.handshakeOk === args.bots &&
      metrics.joinTimeouts === 0 &&
      metrics.questionTimeouts === 0 &&
      metrics.ackTimeouts === 0 &&
      !metrics.gameEndedTimeout &&
      metrics.consistencyOk;

    console.log('\n==================== SUÍTE DE CARGA — RADAR ====================');
    console.log(`Servidor .................... ${args.url ?? 'local (loopback, banco isolado)'}`);
    console.log(`Clientes virtuais (bots) .... ${args.bots}`);
    console.log(`Rodadas ..................... ${QUESTION_COUNT} perguntas x ${TIME_LIMIT_SECONDS}s`);
    console.log(`Handshake WebSocket ......... ${metrics.handshakeOk}/${args.bots} OK` +
      (metrics.handshakeFail ? ` (${metrics.handshakeFail} falhas)` : ' (100%)'));
    console.log(
      `Latência radar:roomJoined ... média ${avg(metrics.joinLatencies).toFixed(1)} ms | p95 ${percentile(metrics.joinLatencies, 95).toFixed(1)} ms`,
    );
    console.log(
      `Entrega da questão .......... média ${avg(metrics.questionLatencies).toFixed(1)} ms | p95 ${percentile(metrics.questionLatencies, 95).toFixed(1)} ms`,
    );
    console.log(
      `Ack de resposta (rajada) ... média ${avg(metrics.ackLatencies).toFixed(1)} ms | p95 ${percentile(metrics.ackLatencies, 95).toFixed(1)} ms`,
    );
    console.log(
      `Timeouts observados ........ ${metrics.joinTimeouts + metrics.questionTimeouts + metrics.ackTimeouts + (metrics.gameEndedTimeout ? 1 : 0)}` +
        ` (join: ${metrics.joinTimeouts}, questão: ${metrics.questionTimeouts}, ack: ${metrics.ackTimeouts}, gameEnded: ${metrics.gameEndedTimeout ? 1 : 0})`,
    );
    console.log(
      `Consistência memória x BD ... ${metrics.consistencyOk ? 'OK' : 'FALHOU'} (${metrics.consistentPlayers} jogadores conferem; respostas no relatório: ${metrics.reportAnswers}/${metrics.expectedAnswers})`,
    );
    console.log(`Duração total ............... ${(totalMs / 1000).toFixed(1)} s`);
    console.log(`RESULTADO ................... ${pass ? 'PASS' : 'FAIL'}`);
    console.log('==================================================================\n');

    process.exitCode = pass ? 0 : 1;
  } finally {
    clearTimeout(watchdog);
    for (const socket of sockets) {
      try {
        socket.disconnect();
      } catch {
        // melhor esforço
      }
    }
    try {
      await app?.close();
    } catch {
      // melhor esforço
    }
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('\nLOAD FAIL');
  console.error(error);
  process.exitCode = 1;
});
