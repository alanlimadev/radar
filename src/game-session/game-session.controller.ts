import { Controller, Post, Body, Get, Param, Put } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { GameSessionService } from './game-session.service';
import { CreateGameSessionDto } from './dtos';

@ApiTags('Game Session')
@Controller('game-session')
export class GameSessionController {
  constructor(private readonly gameSessionService: GameSessionService) {}

  @ApiOperation({
    summary: 'Criar nova sessão de jogo',
    description:
      'Cria uma nova sessão de jogo baseada em um quiz existente. O professor pode usar este endpoint para iniciar uma nova sessão que os alunos poderão se conectar.',
  })
  @ApiBody({
    type: CreateGameSessionDto,
    description: 'Dados para criar a sessão de jogo',
  })
  @ApiResponse({
    status: 201,
    description: 'Sessão de jogo criada com sucesso',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        quizId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'IN_PROGRESS',
        startedAt: '2023-08-20T16:00:00.000Z',
        endedAt: null,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos fornecidos',
  })
  @ApiResponse({
    status: 404,
    description: 'Quiz não encontrado',
  })
  @Post()
  async createSession(@Body() dto: CreateGameSessionDto) {
    return this.gameSessionService.createSession(dto);
  }

  @ApiOperation({
    summary: 'Buscar detalhes da sessão',
    description:
      'Retorna informações completas da sessão de jogo, incluindo o quiz com suas perguntas e alternativas, além dos jogadores conectados.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da sessão de jogo',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalhes da sessão retornados com sucesso',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        quizId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'IN_PROGRESS',
        startedAt: '2023-08-20T16:00:00.000Z',
        endedAt: null,
        quiz: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          title: 'Quiz de História',
          description: 'Questões sobre história do Brasil',
          questions: [
            {
              id: '550e8400-e29b-41d4-a716-446655440002',
              text: 'Em que ano foi proclamada a independência do Brasil?',
              alternatives: [
                {
                  id: '550e8400-e29b-41d4-a716-446655440003',
                  text: '1822',
                  isCorrect: true,
                },
                {
                  id: '550e8400-e29b-41d4-a716-446655440004',
                  text: '1889',
                  isCorrect: false,
                },
              ],
            },
          ],
        },
        players: [
          {
            id: '550e8400-e29b-41d4-a716-446655440005',
            name: 'João Silva',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Sessão não encontrada',
  })
  @Get(':id')
  async getSession(@Param('id') sessionId: string) {
    return this.gameSessionService.getSessionWithQuestions(parseInt(sessionId));
  }

  @ApiOperation({
    summary: 'Listar jogadores da sessão',
    description:
      'Retorna a lista de todos os jogadores conectados à sessão de jogo.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da sessão de jogo',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de jogadores retornada com sucesso',
    schema: {
      example: [
        {
          id: '550e8400-e29b-41d4-a716-446655440005',
          name: 'João Silva',
          gameSessionId: '550e8400-e29b-41d4-a716-446655440000',
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440006',
          name: 'Maria Santos',
          gameSessionId: '550e8400-e29b-41d4-a716-446655440000',
        },
      ],
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Sessão não encontrada',
  })
  @Get(':id/players')
  async getSessionPlayers(@Param('id') sessionId: string) {
    const session = await this.gameSessionService.getSessionWithQuestions(
      parseInt(sessionId),
    );
    return session?.players || [];
  }

  @ApiOperation({
    summary: 'Buscar placar da sessão',
    description:
      'Retorna o placar atual da sessão com a pontuação de todos os jogadores, ordenado por score decrescente.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da sessão de jogo',
    example: '1',
  })
  @ApiResponse({
    status: 200,
    description: 'Placar retornado com sucesso',
    schema: {
      example: [
        {
          playerId: '550e8400-e29b-41d4-a716-446655440005',
          playerName: 'João Silva',
          correctAnswers: 8,
          score: 8,
        },
        {
          playerId: '550e8400-e29b-41d4-a716-446655440006',
          playerName: 'Maria Santos',
          correctAnswers: 6,
          score: 6,
        },
      ],
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Sessão não encontrada',
  })
  @Get(':id/scores')
  async getSessionScores(@Param('id') sessionId: string) {
    return this.gameSessionService.getSessionScores(parseInt(sessionId));
  }

  @ApiOperation({
    summary: 'Finalizar sessão de jogo',
    description:
      'Marca a sessão de jogo como finalizada, definindo a data/hora de término. Após finalizada, novos jogadores não poderão se conectar.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID da sessão de jogo',
    example: '1',
  })
  @ApiResponse({
    status: 200,
    description: 'Sessão finalizada com sucesso',
    schema: {
      example: {
        id: 1,
        quizId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'FINISHED',
        startedAt: '2023-08-20T16:00:00.000Z',
        endedAt: '2023-08-20T16:30:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Sessão não encontrada',
  })
  @Put(':id/finish')
  async finishSession(@Param('id') sessionId: string) {
    return this.gameSessionService.finishSession(parseInt(sessionId));
  }
}
