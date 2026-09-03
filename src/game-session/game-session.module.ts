import { Module } from '@nestjs/common';
import { GameSessionService } from './game-session.service';
import { GameSessionController } from './game-session.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QuizModule } from '../quiz/quiz.module';

@Module({
  imports: [PrismaModule, QuizModule],
  controllers: [GameSessionController],
  providers: [GameSessionService],
  exports: [GameSessionService],
})
export class GameSessionModule {}
