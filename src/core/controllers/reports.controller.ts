import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RoomRepository } from '../persistence/room.repository';
import { ListReportsQueryDto } from './dtos';

@ApiTags('RADAR Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly roomRepository: RoomRepository) {}

  @ApiOperation({
    summary: 'Listar relatórios de sessão do professor logado',
    description:
      'Retorna apenas sessões encerradas que geraram relatório, mais recentes primeiro.',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de relatórios' })
  @Get()
  async listReports(
    @Query() query: ListReportsQueryDto,
    @Request() req: any,
  ) {
    return this.roomRepository.listReports(req.user.id, {
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
      quizId: query.quizId,
    });
  }

  @ApiOperation({ summary: 'Obter o snapshot completo de um relatório' })
  @ApiParam({ name: 'id', description: 'ID da sala/relatório' })
  @ApiResponse({ status: 200, description: 'Snapshot do relatório' })
  @ApiResponse({ status: 404, description: 'Relatório inexistente ou de outro dono' })
  @Get(':id')
  async getReport(@Param('id') id: string, @Request() req: any) {
    const report = await this.roomRepository.findReport(id, req.user.id);
    if (!report) {
      throw new NotFoundException('Relatório não encontrado.');
    }
    return report.results;
  }

  @ApiOperation({ summary: 'Excluir um relatório do professor logado' })
  @ApiParam({ name: 'id', description: 'ID da sala/relatório' })
  @ApiResponse({ status: 204, description: 'Relatório removido' })
  @ApiResponse({ status: 404, description: 'Relatório inexistente ou de outro dono' })
  @Delete(':id')
  @HttpCode(204)
  async deleteReport(@Param('id') id: string, @Request() req: any) {
    const removed = await this.roomRepository.deleteReport(id, req.user.id);
    if (removed === 0) {
      throw new NotFoundException('Relatório não encontrado.');
    }
  }
}
