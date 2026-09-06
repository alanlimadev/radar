import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RoomManagerService } from '../services/room-manager.service';
import { GameRegistryService } from '../services/game-registry.service';
import { RadarGateway } from '../gateways/radar.gateway';
import { CreateRoomDto } from './dtos';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@ApiTags('RADAR Core Rooms')
@Controller('rooms')
export class RoomController {
  constructor(
    private readonly roomManager: RoomManagerService,
    private readonly gameRegistry: GameRegistryService,
    private readonly radarGateway: RadarGateway,
  ) {}

  @ApiOperation({
    summary: 'Listar jogos registrados no RADAR Framework',
    description: 'Retorna a lista de todos os jogos instalados e seus metadados de configuração.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de jogos retornada com sucesso',
  })
  @Get('games')
  listGames() {
    return this.gameRegistry.list();
  }

  @ApiOperation({
    summary: 'Criar uma nova sala de jogo',
    description: 'Cria uma nova sala gerando um PIN curto para entrada dos jogadores na rede local.',
  })
  @ApiResponse({
    status: 201,
    description: 'Sala criada com sucesso',
  })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  async createRoom(@Body() dto: CreateRoomDto, @Request() req) {
    const room = await this.roomManager.createRoom(
      req.user.id,
      dto.gameType,
      dto.config || {},
    );

    return {
      id: room.id,
      code: room.code,
      gameType: room.gameType,
      status: room.status,
      createdAt: room.createdAt,
    };
  }

  @ApiOperation({
    summary: 'Buscar detalhes da sala por PIN ou ID',
  })
  @ApiParam({
    name: 'code',
    description: 'PIN de 6 dígitos ou ID da sala',
    example: '739182',
  })
  @Get(':code')
  getRoom(@Param('code') code: string) {
    const room = this.roomManager.findRoom(code);
    if (!room) return null;

    return {
      id: room.id,
      code: room.code,
      gameType: room.gameType,
      status: room.status,
      playerCount: room.players.size,
      createdAt: room.createdAt,
    };
  }

  @ApiOperation({
    summary: 'Listar jogadores conectados à sala',
  })
  @ApiParam({
    name: 'code',
    description: 'PIN da sala',
    example: '739182',
  })
  @Get(':code/players')
  getPlayers(@Param('code') code: string) {
    return this.roomManager.getRoomPlayers(code);
  }

  @ApiOperation({
    summary: 'Buscar resultados ou pontuações da sala',
  })
  @ApiParam({
    name: 'code',
    description: 'PIN da sala',
    example: '739182',
  })
  @Get(':code/scores')
  getScores(@Param('code') code: string) {
    return this.roomManager.getFinalResults(code);
  }

  @ApiOperation({
    summary: 'Finalizar a sala de jogo',
  })
  @ApiParam({
    name: 'code',
    description: 'PIN da sala',
    example: '739182',
  })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':code/finish')
  async finishRoom(@Param('code') code: string) {
    const room = await this.roomManager.finishRoom(code);
    let scores: any[] = [];
    try {
      scores = this.roomManager.getFinalResults(room.code);
    } catch {
      scores = [];
    }
    this.radarGateway.notifyRoomFinished(room.code, scores);
    return room;
  }
}
