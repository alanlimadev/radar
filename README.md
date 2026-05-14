# RADAR: Framework para Aplicações Multiusuário de Baixa Latência
O Radar é um framework de backend projetado para orquestrar dispositivos móveis em redes locais (WLAN) em ambientes com infraestrutura de rede limitada ou sem conectividade com a internet. Desenvolvido sobre o ecossistema NestJS, ele abstrai a complexidade de protocolos de rede e gerenciamento de estado, permitindo a criação de experiências colaborativas robustas e sincronizadas em tempo real.

## Como rodar o projeto

```bash
git clone https://github.com/alanlimadev/radar-tcc.git
```

```bash
cd radar-tcc
```

```bash
# Crie um arquivo .env na raiz do projeto com as variáveis abaixo:
POSTGRES_DB="radardb"
POSTGRES_USER="admin"
POSTGRES_PASSWORD="12345678"

DATABASE_URL="postgresql://admin:12345678@postgresql:5432/radardb?schema=public"
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
