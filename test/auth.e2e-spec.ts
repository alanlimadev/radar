import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppModule } from '../src/app.module';

describe('Auth (e2e) — cadastro e login por username', () => {
  let app: INestApplication;
  let dataDir: string;
  let originalDatabaseUrl: string | undefined;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-e2e-'));
    const dataPath = path.join(dataDir, 'data');
    fs.mkdirSync(dataPath, { recursive: true });

    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.RADAR_DATA_DIR = dataDir;
    process.env.DATABASE_URL = `file:${path.join(dataPath, 'radar.db')}`;

    // Cria um SQLite isolado com o schema atual antes de inicializar o Nest.
    // `db push` evita depender do histórico PostgreSQL antigo das migrations.
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
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.RADAR_DATA_DIR;
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it('normaliza o username, bloqueia duplicado e autentica', async () => {
    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: '  Alan.Lima  ',
        password: 'senha123',
      })
      .expect(201);

    expect(register.body.user).toMatchObject({
      username: 'alan.lima',
    });
    expect(register.body.user).not.toHaveProperty('email');
    expect(register.body.access_token).toBeDefined();

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'alan.lima',
        password: 'senha123',
      })
      .expect(409);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: ' ALAN.LIMA ', password: 'senha123' })
      .expect(200);

    expect(login.body.access_token).toBeDefined();
    expect(login.body.user).toMatchObject({
      username: 'alan.lima',
    });
    expect(login.body.user).not.toHaveProperty('email');
  });

  it('rejeita credenciais inválidas e username fora da regra', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'nao.existe', password: 'senha123' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'nome invalido!',
        password: 'senha123',
      })
      .expect(400);
  });

  it('isola os quizzes por professor (listagem e acesso direto)', async () => {
    const professorA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'professor.a',
        password: 'senha123',
      })
      .expect(201);

    const professorB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'professor.b',
        password: 'senha123',
      })
      .expect(201);

    const tokenA = professorA.body.access_token as string;
    const tokenB = professorB.body.access_token as string;

    const created = await request(app.getHttpServer())
      .post('/quizzes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Quiz privado do A' })
      .expect(201);

    const quizId = created.body.id as string;

    const listA = await request(app.getHttpServer())
      .get('/quizzes')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(listA.body.map((quiz: { id: string }) => quiz.id)).toContain(quizId);

    const listB = await request(app.getHttpServer())
      .get('/quizzes')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(listB.body).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/quizzes/${quizId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403);

    await request(app.getHttpServer())
      .put(`/quizzes/${quizId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'Tentativa de sequestro' })
      .expect(403);

    await request(app.getHttpServer()).get('/quizzes').expect(401);
  });
});
