import { Module, Global } from '@nestjs/common';
import { GameRegistryService } from './services/game-registry.service';
import { RoomManagerService } from './services/room-manager.service';
import { RadarGateway } from './gateways/radar.gateway';
import { RoomController } from './controllers/room.controller';
import { ReportsController } from './controllers/reports.controller';
import { RoomRepository } from './persistence/room.repository';

@Global()
@Module({
  controllers: [RoomController, ReportsController],
  providers: [
    GameRegistryService,
    RoomManagerService,
    RoomRepository,
    RadarGateway,
  ],
  exports: [
    GameRegistryService,
    RoomManagerService,
    RoomRepository,
    RadarGateway,
  ],
})
export class RadarCoreModule {}
