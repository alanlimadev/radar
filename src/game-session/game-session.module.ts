import { Module } from '@nestjs/common';
import { GameSessionService } from './game-session.service';
import { GameSessionController } from './game-session.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { GameSessionGateway } from './game-session.gateway';

@Module({
  imports: [PrismaModule],
  controllers: [GameSessionController],
  providers: [GameSessionService, GameSessionGateway],
})
export class GameSessionModule {}
