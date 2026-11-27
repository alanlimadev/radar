import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { SpaFallbackFilter } from './core/http/spa-fallback.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // Entrega os arquivos estaticos do client e o fallback do SPA (deep links
  // como /game e /loginScreen). Ver SpaFallbackFilter para o motivo de nao
  // usarmos o @nestjs/serve-static.
  const clientPath = join(process.cwd(), 'client');
  if (existsSync(join(clientPath, 'index.html'))) {
    app.useStaticAssets(clientPath);
    app.useGlobalFilters(new SpaFallbackFilter(clientPath));
  }

  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (res.statusCode >= 400) {
        console.error(
          `[HTTP ERROR] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms)`,
        );
      } else {
        console.log(
          `[HTTP] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms)`,
        );
      }
    });
    next();
  });

  const config = new DocumentBuilder()
    .setTitle('Kahoot Offline API')
    .setDescription(
      `
      API para gerenciamento de quizzes e sessões de jogo em tempo real.
      
      ## Funcionalidades Principais:
      - **Usuários**: Cadastro e autenticação de hosts
      - **Quizzes**: Criação e gerenciamento de quizzes com perguntas
      - **Game Sessions**: Sessões de jogo em tempo real para players
      
      ## WebSocket (Comunicação em Tempo Real):
      Esta API utiliza WebSocket (Socket.IO) na porta **3333** para comunicação em tempo real durante as sessões de jogo.
      
      **URL de conexão**: \`ws://localhost:3333\`
      
      ### Protocolo universal:
      - \`radar:joinAsHost\`: Conectar o host à sala
      - \`radar:joinRoom\`: Conectar um jogador à sala
      - \`radar:dispatchAction\`: Enviar uma ação do jogo (\`{ type, payload }\`)
      - \`radar:leaveRoom\`: Sair da sala
      - \`radar:roomJoined\`, \`radar:playerJoined\`, \`radar:playerLeft\`, \`radar:stateUpdated\`, \`radar:gameEnded\`, \`radar:error\`: Eventos emitidos pelo servidor
      
      ### Como usar:
      1. Crie uma sessão via REST API
      2. Conecte host e jogadores via WebSocket
      3. Inicie o jogo com \`radar:dispatchAction\` (\`{ "type": "START_GAME" }\`)
      
      Consulte o contrato completo em \`AGENTS.md\` e \`README.md\`
    `,
    )
    .setVersion('1.0')
    .addTag('Auth', 'Endpoints de autenticação e autorização')
    .addTag('Users', 'Gerenciamento de usuários (hosts)')
    .addTag('Quiz', 'Criação e gerenciamento de quizzes')
    .addTag('Game Session', 'Sessões de jogo em tempo real')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  await app.listen(3333, '0.0.0.0');
}
bootstrap().catch((error) => console.error('Error starting server:', error));
