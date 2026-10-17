import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Schema mínimo esperado no banco SQLite do usuário.
 * Usado no startup para detectar bancos criados por versões antigas do app
 * (ou arquivos corrompidos) e recriá-los a partir do template embutido.
 * Ao evoluir o schema.prisma, atualize este mapa.
 */
const REQUIRED_SCHEMA: Record<string, string[]> = {
  hosts: ['id', 'name', 'email', 'passwordHash'],
  game_rooms: [
    'id',
    'code',
    'gameType',
    'hostId',
    'status',
    'config',
    'results',
    'startedAt',
    'endedAt',
  ],
  room_players: ['id', 'name', 'roomId', 'score', 'metadata', 'joinedAt'],
  quizzes: ['id', 'title', 'description', 'createdBy'],
  questions: ['id', 'text', 'order', 'quizId'],
  alternatives: ['id', 'text', 'isCorrect', 'questionId'],
};

function resolveDataDir(): string {
  if (process.env.RADAR_DATA_DIR) {
    return path.join(process.env.RADAR_DATA_DIR, 'data');
  }

  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? `${process.env.HOME}/Library/Application Support`
      : `${process.env.HOME}/.config`);

  return appData
    ? path.join(appData, 'com.radar.quiz', 'data')
    : path.join(process.cwd(), 'data');
}

function getTemplateCandidates(): string[] {
  return [
    path.join(process.cwd(), 'radar.db'),
    path.join(process.cwd(), 'prisma', 'radar.db'),
    path.join(__dirname, 'radar.db'),
    path.join(__dirname, 'prisma', 'radar.db'),
  ];
}

function findTemplateDb(): string | null {
  for (const candidate of getTemplateCandidates()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveDatabaseUrl(targetDbPath: string): string {
  // Respeita uma DATABASE_URL absoluta/externa, se fornecida.
  if (
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.startsWith('file:.')
  ) {
    return process.env.DATABASE_URL;
  }

  return `file:${targetDbPath.replace(/\\/g, '/')}`;
}

function copyTemplateIfMissing(targetDbPath: string): void {
  if (fs.existsSync(targetDbPath)) {
    return;
  }

  const template = findTemplateDb();
  if (!template) {
    return;
  }

  try {
    fs.copyFileSync(template, targetDbPath);
    console.log(
      `Template radar.db copiado com sucesso de ${template} para ${targetDbPath}`,
    );
  } catch (err) {
    console.error(`Erro ao copiar template radar.db de ${template}:`, err);
  }
}

function timestampSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly dbFilePath: string;
  private readonly isExternalDatabase: boolean;

  constructor() {
    const dataDir = resolveDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const targetDbPath = path.join(dataDir, 'radar.db');
    copyTemplateIfMissing(targetDbPath);

    const dbUrl = resolveDatabaseUrl(targetDbPath);
    const isExternal = !dbUrl.startsWith('file:');

    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: ['error', 'warn'],
    });

    this.dbFilePath = targetDbPath;
    this.isExternalDatabase = isExternal;
    this.logger.log(`Conectando banco de dados SQLite em: ${dbUrl}`);
  }

  async onModuleInit() {
    await this.$connect();

    try {
      await this.assertSchemaIsValid();
      this.logger.log('Conexão com SQLite Prisma inicializada com sucesso.');
    } catch (error) {
      await this.recoverFromIncompatibleDatabase(error);
    }
  }

  /**
   * Garante que as tabelas e colunas esperadas existem no banco.
   * Lança em caso de schema incompatível (banco de versão antiga/corrompido).
   */
  private async assertSchemaIsValid(): Promise<void> {
    for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
      let info: Array<{ name: string }>;
      try {
        info = await this.$queryRawUnsafe<Array<{ name: string }>>(
          `PRAGMA table_info("${table}")`,
        );
      } catch (error) {
        throw new Error(
          `Tabela "${table}" inacessível: ${(error as Error).message}`,
        );
      }

      if (!info || info.length === 0) {
        throw new Error(`Tabela "${table}" não existe no banco.`);
      }

      const present = new Set(info.map((c) => c.name));
      const missing = columns.filter((c) => !present.has(c));
      if (missing.length > 0) {
        throw new Error(
          `Colunas ausentes na tabela "${table}": ${missing.join(', ')}`,
        );
      }
    }
  }

  /**
   * Recria o banco a partir do template embutido quando o schema é incompatível.
   * O banco antigo é preservado como radar.db.bak-<timestamp>.
   */
  private async recoverFromIncompatibleDatabase(error: unknown): Promise<void> {
    this.logger.warn(
      `Banco de dados incompatível com a versão atual: ${(error as Error)?.message}`,
    );

    if (this.isExternalDatabase) {
      this.logger.error(
        'DATABASE_URL externa definida; não vou recriar o banco automaticamente.',
      );
      throw error;
    }

    const template = findTemplateDb();
    if (!template) {
      this.logger.error(
        'Nenhum template radar.db disponível para recriar o banco.',
      );
      throw error;
    }

    try {
      await this.$disconnect();

      if (fs.existsSync(this.dbFilePath)) {
        const backupPath = `${this.dbFilePath}.bak-${timestampSuffix()}`;
        fs.renameSync(this.dbFilePath, backupPath);
        this.logger.warn(`Banco antigo movido para: ${backupPath}`);
      }

      // Remove artefatos auxiliares do SQLite que possam ter ficado para trás.
      for (const suffix of ['-wal', '-shm', '-journal']) {
        const auxPath = `${this.dbFilePath}${suffix}`;
        if (fs.existsSync(auxPath)) {
          fs.rmSync(auxPath, { force: true });
        }
      }

      fs.copyFileSync(template, this.dbFilePath);
      this.logger.warn(`Banco recriado a partir do template: ${template}`);

      await this.$connect();
      await this.assertSchemaIsValid();
      this.logger.log('Banco de dados recriado e validado com sucesso.');
    } catch (recoveryError) {
      this.logger.error(
        'Falha ao recriar o banco de dados a partir do template:',
        recoveryError as any,
      );
      throw recoveryError;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
