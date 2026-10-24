import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

describe('AuthService — login por username', () => {
  let prisma: any;
  let jwt: any;
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      host: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-jwt') };
    service = new AuthService(prisma, jwt);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('normaliza o username para minúsculo e sem espaços', async () => {
      prisma.host.findUnique.mockResolvedValue(null);
      prisma.host.create.mockResolvedValue({
        id: 'host-1',
        name: 'Alan Lima',
        username: 'alan.lima',
      });

      const result = await service.register({
        name: ' Alan Lima ',
        username: '  Alan.Lima  ',
        password: 'senha123',
      });

      expect(prisma.host.findUnique).toHaveBeenCalledWith({
        where: { username: 'alan.lima' },
      });
      expect(prisma.host.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Alan Lima',
            username: 'alan.lima',
          }),
        }),
      );
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'host-1',
        username: 'alan.lima',
      });
      expect(result.user).toEqual({
        id: 'host-1',
        name: 'Alan Lima',
        username: 'alan.lima',
      });
      expect(result.user).not.toHaveProperty('email');
    });

    it('retorna 409 quando o username já está em uso', async () => {
      prisma.host.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          name: 'Alan',
          username: 'alan',
          password: 'senha123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('converte corrida de unicidade (P2002) em 409', async () => {
      prisma.host.findUnique.mockResolvedValue(null);
      prisma.host.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.register({
          name: 'Alan',
          username: 'alan',
          password: 'senha123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('busca pelo username normalizado e retorna o usuário sem e-mail', async () => {
      prisma.host.findUnique.mockResolvedValue({
        id: 'host-1',
        name: 'Alan',
        username: 'alan',
        passwordHash: 'hashed-password',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        username: ' ALAN ',
        password: 'senha123',
      });

      expect(prisma.host.findUnique).toHaveBeenCalledWith({
        where: { username: 'alan' },
      });
      expect(result.access_token).toBe('signed-jwt');
      expect(result.user).toEqual({
        id: 'host-1',
        name: 'Alan',
        username: 'alan',
      });
    });

    it('rejeita usuário inexistente com 401', async () => {
      prisma.host.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ username: 'ninguem', password: 'senha123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita senha incorreta com 401', async () => {
      prisma.host.findUnique.mockResolvedValue({
        id: 'host-1',
        name: 'Alan',
        username: 'alan',
        passwordHash: 'hashed-password',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ username: 'alan', password: 'errada' }),
      ).rejects.toThrow('Usuário ou senha inválidos');
    });
  });

  it('validateUser retorna id, name e username', async () => {
    prisma.host.findUnique.mockResolvedValue({
      id: 'host-1',
      name: 'Alan',
      username: 'alan',
    });

    await service.validateUser('host-1');

    expect(prisma.host.findUnique).toHaveBeenCalledWith({
      where: { id: 'host-1' },
      select: { id: true, name: true, username: true },
    });
  });
});
