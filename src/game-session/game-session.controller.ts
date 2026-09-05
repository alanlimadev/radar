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
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GameSessionService } from './game-session.service';
import { CreateGameSessionDto } from './dtos';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Game Session')
@Controller('game-session')
export class GameSessionController {
  constructor(private readonly gameSessionService: GameSessionService) {}

  @ApiOperation({
    summary: 'Criar nova sessão de jogo',
    description:
      'Cria uma nova sessão de jogo baseada em um quiz existente. O host pode usar este endpoint para iniciar uma nova sessão que os players poderão se conectar.',
  })
  @ApiBody({
    type: CreateGameSessionDto,
    description: 'Dados para criar a sessão de jogo',
  })
  @ApiResponse({
    status: 201,
    description: 'Sessão de jogo criada com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos fornecidos',
  })
  @ApiResponse({
    status: 404,
    description: 'Quiz não encontrado',
  })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  async createSession(@Body() dto: CreateGameSessionDto, @Request() req) {
    return this.gameSessionService.createSession(dto, req.user.id);
  }

  @ApiOperation({
    summary: 'Buscar detalhes da sessão',
    description:
      'Retorna informações completas da sessão de jogo, incluindo o quiz com suas perguntas e alternativas, além dos jogadores conectados.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID ou PIN da sessão de jogo',
    example: '739182',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalhes da sessão retornados com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Sessão não encontrada',
  })
  @Get(':id')
  async getSession(@Param('id') id: string) {
    return this.gameSessionService.getSessionWithQuestions(id);
  }

  @ApiOperation({
    summary: 'Listar jogadores da sessão',
  })
  @ApiParam({
    name: 'id',
    description: 'ID ou PIN da sessão de jogo',
    example: '739182',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de jogadores retornada com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Sessão não encontrada',
  })
  @Get(':id/players')
  async getSessionPlayers(@Param('id') id: string) {
    return this.gameSessionService.getSessionPlayers(id);
  }

  @ApiOperation({
    summary: 'Buscar placar da sessão',
  })
  @ApiParam({
    name: 'id',
    description: 'ID ou PIN da sessão de jogo',
    example: '739182',
  })
  @ApiResponse({
    status: 200,
    description: 'Placar retornado com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Sessão não encontrada',
  })
  @Get(':id/scores')
  async getSessionScores(@Param('id') id: string) {
    return this.gameSessionService.getSessionScores(id);
  }

  @ApiOperation({
    summary: 'Finalizar sessão de jogo',
  })
  @ApiParam({
    name: 'id',
    description: 'ID ou PIN da sessão de jogo',
    example: '739182',
  })
  @ApiResponse({
    status: 200,
    description: 'Sessão finalizada com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Sessão não encontrada',
  })
  @Put(':id/finish')
  async finishSession(@Param('id') id: string) {
    return this.gameSessionService.finishSession(id);
  }
}
