# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI coding assistants when working with code in this repository.

> 📘 **Full AI Agent Guidelines:** See [`AGENT.md`](AGENT.md) for detailed architectural boundaries, invariant rules, and WebSocket contracts.

---

## Project Overview

**RADAR** is a modular NestJS framework for building low-latency, real-time multiplayer applications and games designed to run over local wireless networks (WLAN) without internet connectivity.

It combines a REST API with a Socket.IO WebSocket gateway on the same port (3333).

---

## Commands

```bash
# Development
npm run start:dev        # Hot-reload dev server
npm run build            # Compile TypeScript

# Production (Docker)
docker compose up --build -d   # Build and start API + PostgreSQL
docker compose down            # Stop containers
docker compose logs -f         # Follow logs

# Testing
npm test                 # Run unit tests
npm run test:e2e         # End-to-end tests
npm run test:cov         # Coverage report
jest path/to/file.spec.ts  # Run a single test file

# Code quality
npm run lint             # ESLint (auto-fix)
npm run format           # Prettier format

# Database (Prisma)
npx prisma migrate dev --name <name>  # Create and apply a new migration
npx prisma migrate deploy             # Apply pending migrations (used in production)
npx prisma generate                   # Regenerate Prisma client after schema changes
npx prisma studio                     # Open database browser
```

---

## Architecture

### Module Structure

The project decouples the core framework engine (`src/core/`) from game-specific logic (`src/quiz/`):

- **`core/`** — Generic multiplayer framework engine:
  - `RoomManagerService`: In-memory room state, 6-digit PINs, reconnect handling, database persistence.
  - `GameRegistryService`: Registry of games implementing `IGameDefinition`.
  - `RadarGateway`: Socket.IO gateway supporting both universal `radar:*` events and legacy compatibility events.
  - `RoomController`: REST endpoints under `/rooms`.
- **`quiz/`** — Kahoot-style quiz proof of concept:
  - `QuizGameDefinition`: Implements `IGameDefinition` for quizzes.
  - `QuizController`, `QuizService`, `QuizRepository`: CRUD for quizzes, questions, and alternatives. See [`src/quiz/CLAUDE.md`](src/quiz/CLAUDE.md).
- **`prisma/`** — Shared `PrismaService` singleton. See [`src/prisma/CLAUDE.md`](src/prisma/CLAUDE.md).
- **`auth/`** — JWT registration/login for hosts. `JwtAuthGuard` + `req.user`. See [`src/auth/CLAUDE.md`](src/auth/CLAUDE.md).
- **`user/`** — Host profile management. See [`src/user/CLAUDE.md`](src/user/CLAUDE.md).

> ⚠️ Note: `game-session/` was the legacy monolithic module and has been completely replaced by `core/`.

### Data Model

```
Host ──┬──> Quiz ──> Question ──> Alternative
       │
       └──> GameRoom (code, gameType, config, status) ──> RoomPlayer (score, metadata)
```

Swagger UI: `http://localhost:3333/swagger`

---

## Environment Variables

Required in `.env`:

```env
POSTGRES_DB=radardb
POSTGRES_USER=admin
POSTGRES_PASSWORD=<password>
DATABASE_URL=postgresql://admin:<password>@localhost:5432/radardb?schema=public
PORT=3333
NODE_ENV=development
JWT_SECRET=<long-random-string>
```

When running in Docker Compose, change `@localhost:` to `@postgresql:` in `DATABASE_URL`.

---

## Commit Convention

Conventional Commits in English. **No emojis in commit messages or PR titles.**

Format: `<type>(<scope>): <imperative description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

Examples:
- `feat(core): support custom room config options`
- `fix(quiz): cascade delete question alternatives`
- `docs(readme): add protocol documentation`
