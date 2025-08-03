import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(private readonly repo: UserRepository) {}

  // Métodos de usuário podem ser adicionados aqui no futuro
  // Por exemplo: buscar perfil, atualizar dados, etc.
}
