import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserService {
  constructor(private readonly repo: UserRepository) {}

  async createUser(data: any) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const { password, ...rest } = data;
    return this.repo.user.create({ data: { ...rest, passwordHash } });
  }
}
