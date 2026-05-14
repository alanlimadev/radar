# Backend Kahoot Offline

## Como rodar o projeto

```bash
git clone https://github.com/alanlimadev/radar-tcc.git
```

```bash
cd radar-tcc
```

```bash
# Crie um arquivo .env na raiz do projeto com as variáveis abaixo:
POSTGRES_DB= "kahootdb"
POSTGRES_USER="admin"
POSTGRES_PASSWORD="12345678"

DATABASE_URL="postgresql://admin:12345678@postgresql:5432/kahootdb?schema=public"
PORT=3333
NODE_ENV=production

JWT_SECRET="sfbslmvefyiBDHLDIjlfoefwmkjkejrgofsfsjfsfnsjfgnusfjownfjbjkfnsjfwu3hifnjcbxbcnxcvmmwmfsvskvjnfuyqgyqdfhUDSHFYWYVVBI"
```

```bash
# Suba os containers (API + Banco de Dados):
docker compose up --build -d
```

## Documentação

[http://localhost:3333/swagger](http://localhost:3333/swagger)

## Comandos úteis

```bash
# Parar os containers:
docker compose down
```

```bash
# Ver logs em tempo real:
docker compose logs -f
```

```bash
# Recriar os containers:
docker compose up --build -d
```
