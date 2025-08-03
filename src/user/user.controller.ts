import { Controller } from '@nestjs/common';
import { UserService } from './user.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // Rotas de usuário podem ser adicionadas aqui no futuro
  // Por exemplo: perfil do usuário, atualização de dados, etc.
}
