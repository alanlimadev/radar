import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, normalizeUsername } from './dtos';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(data: RegisterDto) {
    const username = normalizeUsername(data.username) as string;

    const existingUser = await this.prisma.host.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new ConflictException('Nome de usuário já está em uso');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    let user: { id: string; username: string };
    try {
      user = await this.prisma.host.create({
        data: {
          // O host não possui mais um nome de exibição separado: o username
          // é usado em toda a aplicação. A coluna `name` é mantida por
          // compatibilidade com o schema e recebe o próprio username.
          name: username,
          username,
          passwordHash,
        },
        select: {
          id: true,
          username: true,
        },
      });
    } catch (error) {
      // Corrida entre dois cadastros com o mesmo username.
      if ((error as { code?: string })?.code === 'P2002') {
        throw new ConflictException('Nome de usuário já está em uso');
      }
      throw error;
    }

    const payload = { sub: user.id, username: user.username };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user,
    };
  }

  async login(data: LoginDto) {
    const username = normalizeUsername(data.username) as string;

    const user = await this.prisma.host.findUnique({
      where: { username },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    const isPasswordValid = await bcrypt.compare(
      data.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Usuário ou senha inválidos');
    }

    const payload = { sub: user.id, username: user.username };
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.host.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
      },
    });

    return user;
  }
}
