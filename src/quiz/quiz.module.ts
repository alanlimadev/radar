import { Module, OnModuleInit } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { QuizRepository } from './quiz.repository';
import { QuizGameDefinition } from './quiz-game.definition';
import { PrismaModule } from '../prisma/prisma.module';
import { GameRegistryService } from '../core/services/game-registry.service';

@Module({
  imports: [PrismaModule],
  controllers: [QuizController],
  providers: [QuizService, QuizRepository, QuizGameDefinition],
  exports: [QuizService, QuizGameDefinition],
})
export class QuizModule implements OnModuleInit {
  constructor(
    private readonly gameRegistry: GameRegistryService,
    private readonly quizGameDef: QuizGameDefinition,
  ) {}

  onModuleInit() {
    this.gameRegistry.register(this.quizGameDef);
  }
}
