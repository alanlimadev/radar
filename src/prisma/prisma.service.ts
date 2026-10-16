import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

function getDatabaseUrl(): string {
  let dataDir: string;

  if (process.env.RADAR_DATA_DIR) {
    dataDir = path.join(process.env.RADAR_DATA_DIR, 'data');
  } else {
    const appData =
      process.env.APPDATA ||
      (process.platform === 'darwin'
        ? `${process.env.HOME}/Library/Application Support`
        : `${process.env.HOME}/.config`);
    dataDir = appData
      ? path.join(appData, 'com.radar.quiz', 'data')
      : path.join(process.cwd(), 'data');
  }

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const targetDbPath = path.join(dataDir, 'radar.db');

  // Se o banco ainda não existe no diretório de dados do usuário, copia o template inicial se disponível
  if (!fs.existsSync(targetDbPath)) {
    const templateCandidates = [
      path.join(process.cwd(), 'radar.db'),
      path.join(process.cwd(), 'prisma', 'radar.db'),
      path.join(__dirname, 'radar.db'),
      path.join(__dirname, 'prisma', 'radar.db'),
    ];

    for (const candidate of templateCandidates) {
      if (fs.existsSync(candidate)) {
        try {
          fs.copyFileSync(candidate, targetDbPath);
          console.log(`Template radar.db copiado com sucesso de ${candidate} para ${targetDbPath}`);
          break;
        } catch (err) {
          console.error(`Erro ao copiar template radar.db de ${candidate}:`, err);
        }
      }
    }
  }

  // Se uma DATABASE_URL explícita foi fornecida e não for relativa, usa ela
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('file:.')) {
    return process.env.DATABASE_URL;
  }

  const normalizedPath = targetDbPath.replace(/\\/g, '/');
  return `file:${normalizedPath}`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = getDatabaseUrl();
    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: ['error', 'warn'],
    });
    this.logger.log(`Conectando banco de dados SQLite em: ${dbUrl}`);
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Conexão com SQLite Prisma inicializada com sucesso.');
    } catch (error) {
      this.logger.error('Falha ao conectar no SQLite:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
