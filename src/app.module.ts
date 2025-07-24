import { Module } from '@nestjs/common';
import { QuizModule } from './quiz/quiz.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [QuizModule, UserModule],
})
export class AppModule {}
