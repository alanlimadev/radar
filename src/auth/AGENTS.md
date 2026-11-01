# AGENTS.md — módulo auth

Responsável por registro de hosts, login e validação de JWT.

## Fluxo

`POST /auth/register` → cria host no banco, retorna `access_token` + dados do host.  
`POST /auth/login` → valida credenciais, retorna `access_token` + dados do host.

Token JWT expira em 24h. Payload: `{ sub: hostId, username }`.

## Credenciais

- Cadastro (`POST /auth/register`): `name`, `username`, `password`.
- Login (`POST /auth/login`): `username`, `password`.
- Não existe mais e-mail no modelo nem no fluxo.
- `username` é único, normalizado no backend com `trim()` + `toLowerCase()` e validado por `USERNAME_REGEX` (`^[a-z0-9._-]{3,20}$`).
- Username duplicado retorna `409 Conflict` com a mensagem "Nome de usuário já está em uso".
- Credenciais inválidas retornam `401 Unauthorized` com "Usuário ou senha inválidos".

## Protegendo rotas

Adicione `@UseGuards(JwtAuthGuard)` no controller. Após o guard, `req.user` contém `{ id, name, username }` do host autenticado — vem de `JwtStrategy.validate`, que chama `AuthService.validateUser`.

```ts
@UseGuards(JwtAuthGuard)
@Get('me')
getMe(@Request() req) {
  return req.user; // { id, name, username }
}
```

## Detalhes internos

- `JwtStrategy` extrai o token do header `Authorization: Bearer <token>`.
- `AuthService.validateUser` busca o host via `prisma.host.findUnique`. Se não existir, lança `UnauthorizedException`.
- Senhas são armazenadas como hash bcrypt (salt rounds = 10). Nunca retornar `passwordHash` nas respostas.
