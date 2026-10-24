import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  BadRequestException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { QuizService } from './quiz.service';
import { ApiTags, ApiBody, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request as ExpressRequest } from 'express';
import {
  CreateQuizDto,
  UpdateQuizDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  CreateAlternativeDto,
  UpdateAlternativeDto,
} from './dtos';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    id: string;
    name: string;
    username: string;
  };
}

function validateAlternatives(alternatives: CreateAlternativeDto[]) {
  if (!Array.isArray(alternatives) || alternatives.length !== 4) {
    throw new BadRequestException(
      'Cada pergunta deve ter exatamente 4 alternativas.',
    );
  }
  const correctCount = alternatives.filter((a) => a.isCorrect).length;
  if (correctCount !== 1) {
    throw new BadRequestException(
      'Exatamente uma alternativa deve ser correta.',
    );
  }
}

@ApiTags('quizzes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quizzes')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Post()
  @ApiBody({ type: CreateQuizDto })
  @ApiResponse({ status: 201, description: 'Quiz criado com sucesso.' })
  createQuiz(
    @Body() data: CreateQuizDto,
    @Request() req: AuthenticatedRequest,
  ) {
    if (data.questions) {
      data.questions.forEach((q) => {
        validateAlternatives(q.alternatives);
      });
    }
    return this.quizService.createQuiz({
      ...data,
      createdBy: req.user.id,
    });
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Lista os quizzes do usuário.' })
  findAllQuizzes(@Request() req: AuthenticatedRequest) {
    return this.quizService.findAllQuizzes(req.user.id);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Retorna um quiz pelo ID.' })
  @ApiResponse({ status: 403, description: 'Quiz de outro usuário.' })
  findQuizById(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.quizService.findQuizByIdForUser(id, req.user.id);
  }

  @Put(':id')
  @ApiBody({ type: UpdateQuizDto })
  @ApiResponse({ status: 200, description: 'Quiz atualizado com sucesso.' })
  updateQuiz(
    @Param('id') id: string,
    @Body() data: UpdateQuizDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.quizService.updateQuiz(id, data, req.user.id);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Quiz deletado com sucesso.' })
  deleteQuiz(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.quizService.deleteQuiz(id, req.user.id);
  }

  @Post(':quizId/questions')
  @ApiBody({ type: CreateQuestionDto })
  @ApiResponse({ status: 201, description: 'Pergunta adicionada ao quiz.' })
  async addQuestion(
    @Param('quizId') quizId: string,
    @Body() data: CreateQuestionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    validateAlternatives(data.alternatives);
    return this.quizService.addQuestion(quizId, data, req.user.id);
  }

  @Put('questions/:questionId')
  @ApiBody({ type: UpdateQuestionDto })
  @ApiResponse({ status: 200, description: 'Pergunta atualizada.' })
  async updateQuestion(
    @Param('questionId') questionId: string,
    @Body() data: UpdateQuestionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    if (data.alternatives) {
      validateAlternatives(data.alternatives);
    }
    return this.quizService.updateQuestion(questionId, data, req.user.id);
  }

  @Delete('questions/:questionId')
  @ApiResponse({ status: 200, description: 'Pergunta deletada.' })
  deleteQuestion(
    @Param('questionId') questionId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.quizService.deleteQuestion(questionId, req.user.id);
  }

  @Post('questions/:questionId/alternatives')
  @ApiBody({ type: CreateAlternativeDto })
  @ApiResponse({
    status: 201,
    description: 'Alternativa adicionada à pergunta.',
  })
  async addAlternative(
    @Param('questionId') questionId: string,
    @Body() data: CreateAlternativeDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const alternatives = await this.quizService.getAlternativesByQuestion(
      questionId,
      req.user.id,
    );
    if (alternatives.length >= 4) {
      throw new BadRequestException(
        'Cada pergunta deve ter exatamente 4 alternativas.',
      );
    }
    const correctCount =
      alternatives.filter((a) => a.isCorrect).length + (data.isCorrect ? 1 : 0);
    if (correctCount > 1) {
      throw new BadRequestException(
        'Exatamente uma alternativa deve ser correta.',
      );
    }
    if (alternatives.length === 3 && !data.isCorrect && correctCount !== 1) {
      throw new BadRequestException(
        'Exatamente uma alternativa deve ser correta.',
      );
    }
    return this.quizService.addAlternative(questionId, data, req.user.id);
  }

  @Put('alternatives/:alternativeId')
  @ApiBody({ type: UpdateAlternativeDto })
  @ApiResponse({ status: 200, description: 'Alternativa atualizada.' })
  async updateAlternative(
    @Param('alternativeId') alternativeId: string,
    @Body() data: UpdateAlternativeDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const alternative = await this.quizService.getAlternativeById(
      alternativeId,
      req.user.id,
    );
    const { questionId } = alternative;
    const alternatives = await this.quizService.getAlternativesByQuestion(
      questionId,
      req.user.id,
    );
    let correctCount = alternatives.filter((a) => a.isCorrect).length;
    const current = alternatives.find((a) => a.id === alternativeId);
    if (current && current.isCorrect !== data.isCorrect) {
      correctCount += data.isCorrect ? 1 : -1;
    }
    if (correctCount !== 1) {
      throw new BadRequestException(
        'Exatamente uma alternativa deve ser correta.',
      );
    }
    return this.quizService.updateAlternative(alternativeId, data, req.user.id);
  }

  @Delete('alternatives/:alternativeId')
  @ApiResponse({ status: 200, description: 'Alternativa deletada.' })
  async deleteAlternative(
    @Param('alternativeId') alternativeId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const alternative = await this.quizService.getAlternativeById(
      alternativeId,
      req.user.id,
    );
    const { questionId } = alternative;
    const alternatives = await this.quizService.getAlternativesByQuestion(
      questionId,
      req.user.id,
    );
    if (alternatives.length <= 4) {
      throw new BadRequestException(
        'Cada pergunta deve ter exatamente 4 alternativas.',
      );
    }
    return this.quizService.deleteAlternative(alternativeId, req.user.id);
  }
}
