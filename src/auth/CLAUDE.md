# CLAUDE.md — módulo auth

Responsável por registro de hosts, login e validação de JWT.

## Fluxo

`POST /auth/register` → cria host no banco, retorna `access_token` + dados do host.  
`POST /auth/login` → valida credenciais, retorna `access_token` + dados do host.

Token JWT expira em 24h. Payload: `{ sub: hostId, email }`.

## Protegendo rotas

Adicione `@UseGuards(JwtAuthGuard)` no controller. Após o guard, `req.user` contém `{ id, name, email }` do host autenticado — vem de `JwtStrategy.validate`, que chama `AuthService.validateUser`.

```ts
@UseGuards(JwtAuthGuard)
@Get('me')
getMe(@Request() req) {
  return req.user; // { id, name, email }
}
```

## Detalhes internos

- `JwtStrategy` extrai o token do header `Authorization: Bearer <token>`.
- `AuthService.validateUser` busca o host via `prisma.host.findUnique`. Se não existir, lança `UnauthorizedException`.
- Senhas são armazenadas como hash bcrypt (salt rounds = 10). Nunca retornar `passwordHash` nas respostas.
