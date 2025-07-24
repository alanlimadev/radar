# Backend Kahoot Offline

## Como rodar localmente

```bash
git clone https://github.com/alanlimadev/kahoot-offline.git
```

```bash
cd kahoot-offline
```

```bash
npm i
```

```bash
npx prisma migrate dev
```

```bash
npm run start:dev
```

## Documentação

http://localhost:3333/swagger

## Variáveis de Ambiente

Para rodar esse projeto, você vai precisar adicionar as seguintes variáveis de ambiente no seu .env

`DATABASE_URL="postgresql://admin:12345678@localhost:5432/kahootdb?schema=public"`
