import { Module, Global } from '@nestjs/common';
import { GameRegistryService } from './services/game-registry.service';
import { RoomManagerService } from './services/room-manager.service';
import { RadarGateway } from './gateways/radar.gateway';
import { RoomController } from './controllers/room.controller';

@Global()
@Module({
  controllers: [RoomController],
  providers: [
    GameRegistryService,
    RoomManagerService,
    RadarGateway,
  ],
  exports: [
    GameRegistryService,
    RoomManagerService,
    RadarGateway,
  ],
})
export class RadarCoreModule {}
