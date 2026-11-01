# RADAR 📡

**Framework para Aplicações e Jogos Multiusuário de Baixa Latência em Redes Locais (WLAN)**

O **RADAR** é um framework de backend modular desenvolvido sobre o ecossistema **NestJS**, projetado especificamente para orquestrar sessões multiusuário em tempo real em ambientes com infraestrutura de rede limitada ou **sem qualquer conectividade com a internet** (WLAN / redes ad-hoc / roteadores locais).

Este projeto é desenvolvido no âmbito de um Trabalho de Conclusão de Curso (TCC) em conjunto com a aplicação frontend [`qonect`](../qonect), uma prova de conceito (PoC) que implementa um jogo interativo estilo Kahoot operando 100% offline.

---

## 🎯 Proposta e Diferenciais

- 📴 **Operação 100% Offline (Zero Internet Dependency):** O servidor e os clientes se comunicam exclusivamente via rede local através de um ponto de acesso Wi-Fi, dispensando conexão externa ou serviços em nuvem.
- 🧩 **Arquitetura Desacoplada e Extensível:** O motor principal (`core`) não possui regras de negócios específicas de nenhum jogo. Qualquer aplicação multiplayer (quiz, tabuleiro, votação, jogos de cartas) pode ser conectada implementando a interface `IGameDefinition`.
- ⚡ **Baixa Latência em Tempo Real:** Comunicação bidirecional orientada a eventos via **Socket.IO** e REST API integradas no mesmo serviço (porta 3333).
- 🔒 **Filtragem de Estado Segura (Anti-Cheat):** O framework projeta o estado da sala de forma segregada (`getClientState`), impedindo que respostas corretas ou dados privilegiados cheguem aos jogadores antes da hora.
- 🔢 **Sistema de Salas com PIN de 6 Dígitos:** Geração rápida de códigos amigáveis para descoberta e conexão facilitada de dispositivos móveis.
- 🔄 **Tolerância a Falhas e Reconexão:** Recuperação transparente de estado caso um jogador oscile a conexão Wi-Fi.
- 🔀 **Camada de Compatibilidade Dupla:** Suporta tanto o **Protocolo Universal RADAR** (`radar:*`) para novos jogos quanto o protocolo legado do Quiz PoC.

---

## 🏗️ Arquitetura do Sistema

```
                 +-----------------------------------+
                 |        Dispositivos / Web App     |
                 |      (Host / Painel & Players)    |
                 +-----------------+-----------------+
                                   |  WLAN (Sem Internet)
                     HTTP / REST   |  WebSocket (Socket.IO)
                                   v
+-------------------------------------------------------------------------+
| RADAR FRAMEWORK (NestJS)                                                |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | RADAR CORE (Motor Genérico)                                       |  |
|  |  - RoomManagerService      (Salas em memória, PINs, reconexão)    |  |
|  |  - GameRegistryService     (Registro dinâmico de jogos)           |  |
|  |  - RadarGateway            (Socket.IO - eventos universais e leg) |  |
|  |  - RoomController          (Endpoints REST /rooms)                |  |
|  +-----------------------------------+-------------------------------+  |
|                                      | IGameDefinition                  |
|                                      v                                  |
|  +-------------------------------------------------------------------+  |
|  | MÓDULOS DE APLICAÇÃO / JOGOS                                      |  |
|  |  - Quiz Module (PoC Kahoot) -> QuizGameDefinition                 |  |
|  |  - Outros Jogos Customizados                                      |  |
|  +-----------------------------------+-------------------------------+  |
|                                      |                                  |
|  +-----------------------------------+-------------------------------+  |
|  | INFRAESTRUTURA & SUPORTE                                          |  | 
|  |  - AuthModule (JWT para Hosts)    - PrismaService (SQLite)        |  | 
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

### Estrutura de Pastas

```
src/
├── app.module.ts              # Agregador principal de módulos
├── main.ts                    # Bootstrap da aplicação, CORS, Swagger e Pipes
├── auth/                      # Autenticação JWT para Hosts/Professores
├── user/                      # Perfil e dados dos hosts
├── prisma/                    # Conexão e repositório global do Prisma ORM
├── core/                      # MOTOR GENÉRICO DO RADAR (Isolado de jogos)
│   ├── controllers/           # RoomController (REST /rooms) e DTOs
│   ├── gateways/              # RadarGateway (WebSocket Socket.IO) e filtros
│   ├── interfaces/            # IGameDefinition, Room, Player, GameAction
│   ├── network/               # Utilitários de rede e gerador de PINs
│   ├── services/              # RoomManagerService e GameRegistryService
│   └── radar.module.ts        # Módulo central exportado
└── quiz/                      # PROVA DE CONCEITO: QUIZ KAHOOT
    ├── quiz.controller.ts     # CRUD de quizzes, questões e alternativas
    ├── quiz.service.ts        # Regras de negócio de conteúdo de quiz
    ├── quiz.repository.ts     # Acesso ao banco para perguntas e alternativas
    ├── quiz-game.definition.ts# Implementação da IGameDefinition para o Quiz
    └── quiz.module.ts         # Registro do jogo no GameRegistry durante init
```

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- **Node.js**: v20 ou superior
- **Docker** e **Docker Compose** (recomendado para subir backend + frontend sem buildar executável)
- Gerenciador de pacotes **npm**

---

### 1. Configuração de Variáveis de Ambiente

Crie um arquivo `.env` na raiz do diretório `radar/`:

```env
DATABASE_URL="file:./radar.db"
PORT=3333
NODE_ENV=development
JWT_SECRET=substitua_por_uma_chave_secreta_longa_e_segura_para_geracao_jwt
```

O banco de dados é **SQLite** (arquivo `radar.db` na pasta `prisma/`), não sendo necessário instalar ou rodar um PostgreSQL separado.

---

### 2. Execução com Docker (Recomendado)

Sobe o backend (API) e o frontend (Web) com hot-reload, sem necessidade de buildar um executável:

```bash
# Iniciar os serviços em segundo plano:
docker compose up --build -d

# Visualizar logs em tempo real:
docker compose logs -f

# Parar todos os serviços:
docker compose down
```

Serviços disponíveis:

| Serviço | Porta | Descrição |
|---|---|---|
| `api` (backend) | `3333` | API REST + WebSocket (Socket.IO) |
| `web` (frontend) | `5173` | Vite dev server (React) |

Acesse o frontend em **http://localhost:5173** e a documentação Swagger do backend em **http://localhost:3333/swagger**.

O banco SQLite persiste no volume Docker `radar-data`, então os dados não são perdidos ao reiniciar os containers.

---

### 3. Execução em Modo de Desenvolvimento Local

Se preferir rodar a aplicação no Node.js local (sem Docker):

```bash
# 1. Instalar as dependências do backend:
npm install

# 2. Aplicar as migrations do Prisma (SQLite):
npx prisma migrate dev

# 3. Iniciar o servidor com hot-reload:
npm run start:dev
```

Em outro terminal, para o frontend (`qonect/`):

```bash
npm install
npm run dev
```

O backend estará disponível em `http://localhost:3333` (ou no IP local da sua máquina na rede WLAN, ex: `http://192.168.1.100:3333`) e o frontend em `http://localhost:5173`.

---

## 📖 Documentação da API (REST & Swagger)

Com o servidor em execução, acesse a documentação Swagger interativa:

👉 **[http://localhost:3333/swagger](http://localhost:3333/swagger)**

### Principais Endpoints REST

#### Autenticação (`/auth`)
- `POST /auth/register` — Cadastro de novos Hosts/Professores com `name`, `username` e `password`.
- `POST /auth/login` — Autenticação por `username` e `password`, retornando o Bearer Token JWT.
- `username` é único, sempre minúsculo (3 a 20 caracteres: `a-z`, `0-9`, `.`, `_`, `-`) e não há e-mail no cadastro/login.

#### Salas do RADAR (`/rooms`)
- `GET /rooms/games` — Lista todos os tipos de jogos registrados no motor.
- `POST /rooms` — *(Requer JWT)* Cria uma nova sala com PIN de 6 dígitos para determinado `gameType`.
- `GET /rooms/:code` — Busca os dados e o status de uma sala pelo PIN ou ID.
- `GET /rooms/:code/players` — Lista jogadores presentes na sala.
- `GET /rooms/:code/scores` — Retorna os resultados/placar final da sessão.
- `PUT /rooms/:code/finish` — *(Requer JWT)* Encerra a sala de jogo.

#### Quizzes (`/quizzes`)
- `POST /quizzes` — *(Requer JWT)* Criação de quiz com questões e alternativas.
- `GET /quizzes` — Lista apenas os quizzes do professor logado.
- `GET /quizzes/:id` — Detalha um quiz e suas questões (somente autor; 403 para os demais).
- `PUT /quizzes/:id` — Atualiza título/descrição do quiz (somente autor).
- `DELETE /quizzes/:id` — Deleta o quiz (somente autor; bloqueado se houver histórico).
- `POST /quizzes/:quizId/questions` — Adiciona pergunta a um quiz existente (somente autor).
- `POST /quizzes/questions/:questionId/alternatives` — Adiciona alternativa (somente autor).

---

## 🔌 Protocolo WebSocket (Socket.IO)

O gateway atende na mesma porta HTTP (`ws://localhost:3333`).

### 1. Protocolo Universal RADAR (`radar:*`)

Recomendado para novos jogos ou aplicações construídas sobre o framework:

#### Eventos emitidos pelo Cliente:
| Evento | Payload | Descrição |
|---|---|---|
| `radar:joinAsHost` | `{ roomCode: string }` | Host conecta à sala via PIN. |
| `radar:joinRoom` | `{ roomCode: string, playerName: string, metadata?: any }` | Jogador ingressa na sala. |
| `radar:dispatchAction` | `{ type: string, payload?: any, roomCode?: string }` | Envia comando/ação ao jogo (reducer). |
| `radar:leaveRoom` | _(nenhum)_ | Sai voluntariamente da sala. |

#### Eventos recebidos do Servidor:
| Evento | Payload | Descrição |
|---|---|---|
| `radar:roomJoined` | `{ isHost, room, state, players, isReconnection }` | Confirmação de entrada com snapshot inicial. |
| `radar:playerJoined` | `{ player, totalPlayers }` | Notificação de novo participante para quem já está na sala. |
| `radar:playerLeft` | `{ playerId, playerName }` | Notificação de desconexão de um jogador. |
| `radar:stateUpdated` | `{ state, status }` | Estado atualizado e filtrado para o papel do cliente. |
| `radar:customEvent` | `{ event, payload }` | Eventos específicos gerados pelo reducer do jogo. |
| `radar:gameEnded` | `{ results }` | Fim de jogo e ranking consolidado. |
| `radar:error` | `{ message }` | Mensagem de erro operacional ou de validação. |

---

### 2. Protocolo Legado (PoC Kahoot)

Mantido integralmente para retrocompatibilidade com o frontend `qonect`:

| Evento Cliente | Origem | Ação Correspondente no RADAR |
|---|---|---|
| `joinAsHost` | Host | Vincula o socket como host da sessão |
| `joinSession` | Player | Registra o jogador na sala |
| `startQuiz` | Host | Dispara ação `START_GAME` |
| `nextQuestion` | Host | Dispara ação `NEXT_QUESTION` |
| `submitAnswer` | Player | Dispara ação `SUBMIT_ANSWER` |
| `getScores` | Ambos | Retorna ranking atualizado |

---

## 🧩 Como Criar um Novo Jogo no RADAR

Para adicionar uma nova modalidade de jogo sem modificar o motor principal:

1. **Crie uma classe implementando `IGameDefinition`:**

```typescript
import { Injectable } from '@nestjs/common';
import { IGameDefinition, GameContext, ActionContext } from '../core/interfaces/game-definition.interface';
import { GameAction, ActionResult } from '../core/interfaces/game-action.interface';

@Injectable()
export class MeuJogoDefinition implements IGameDefinition<MeuEstado, MinhaConfig> {
  readonly gameType = 'meu-jogo';
  readonly name = 'Meu Jogo Customizado';
  readonly version = '1.0.0';

  async init(config: MinhaConfig, context: GameContext): Promise<MeuEstado> {
    return { status: 'LOBBY', dados: [] };
  }

  onAction(state: MeuEstado, action: GameAction, context: ActionContext): ActionResult<MeuEstado> {
    // Reducer puro: atualiza o estado com base na ação recebida
    return { newState: { ...state } };
  }

  getClientState(state: MeuEstado, forPlayer?: Player, isHost?: boolean) {
    // Oculte dados privados caso não seja o host
    return state;
  }

  isFinished(state: MeuEstado): boolean {
    return state.status === 'FINISHED';
  }

  getFinalResults(state: MeuEstado) {
    return { vencedor: 'Jogador 1' };
  }
}
```

2. **Registre no `GameRegistryService` no ciclo de vida do seu módulo:**

```typescript
@Module({
  providers: [MeuJogoDefinition],
})
export class MeuJogoModule implements OnModuleInit {
  constructor(
    private readonly registry: GameRegistryService,
    private readonly gameDef: MeuJogoDefinition,
  ) {}

  onModuleInit() {
    this.registry.register(this.gameDef);
  }
}
```

---

## 🧪 Testes e Qualidade de Código

```bash
# Executar a suíte de testes unitários:
npm test

# Executar testes em modo watch:
npm run test:watch

# Cobertura de testes:
npm run test:cov

# Verificação de linter e formatação:
npm run lint
npm run format
```

---

## 📝 Convenção de Commits

O projeto segue rigorosamente o padrão **Conventional Commits** em inglês.

> ⚠️ **Regra Fundamental:** **NÃO use emojis** nas mensagens de commit nem nos títulos de Pull Requests.

**Formato:** `<tipo>(<escopo>): <descrição no imperativo>`

- `feat`: Nova funcionalidade (ex: `feat(core): add player reconnection support`)
- `fix`: Correção de bug (ex: `fix(quiz): prevent duplicate answer submission`)
- `docs`: Documentação (ex: `docs(readme): update architecture guide`)
- `refactor`: Refatoração sem alteração de comportamento externo
- `test`: Testes automatizados
- `chore`: Atualizações de dependências, build ou configurações
