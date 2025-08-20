import { Module } from '@nestjs/common';
import { QuizModule } from './quiz/quiz.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { GameSessionModule } from './game-session/game-session.module';

@Module({
  imports: [
    PrismaModule,
    QuizModule,
    UserModule,
    AuthModule,
    GameSessionModule,
  ],
})
export class AppModule {}
