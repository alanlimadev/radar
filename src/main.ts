import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (res.statusCode >= 400) {
        console.error(`[HTTP ERROR] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms)`);
      } else {
        console.log(`[HTTP] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms)`);
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
      
      ### Eventos principais:
      - \`joinSession\`: Conectar jogador à sessão
      - \`startQuiz\`: Iniciar quiz (host)
      - \`submitAnswer\`: Enviar resposta (jogador)
      - \`nextQuestion\`: Próxima pergunta (host)
      - \`getScores\`: Buscar placar atual
      
      ### Como usar:
      1. Crie uma sessão via REST API
      2. Conecte jogadores via WebSocket
      3. Inicie o quiz e gerencie em tempo real
      
      Consulte a documentação completa no código-fonte em \`websocket-events.doc.ts\`
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
