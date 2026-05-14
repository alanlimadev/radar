# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Radar** is a NestJS backend for real-time multiplayer quiz sessions (Kahoot-style), designed for local network (WLAN) operation without internet connectivity. It combines a REST API with a Socket.IO WebSocket gateway on the same port (3333).

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

## Architecture

### Module Structure

Each domain follows the NestJS pattern: `*.module.ts` → `*.controller.ts` → `*.service.ts` → optional `*.repository.ts`, with DTOs in `dtos.ts`. Each module has its own `CLAUDE.md` with business logic details.

- **`prisma/`** — Shared `PrismaService` singleton. See [`src/prisma/CLAUDE.md`](src/prisma/CLAUDE.md).
- **`auth/`** — JWT registration/login. `JwtAuthGuard` + `req.user`. See [`src/auth/CLAUDE.md`](src/auth/CLAUDE.md).
- **`user/`** — Host profile management (routes not yet implemented). See [`src/user/CLAUDE.md`](src/user/CLAUDE.md).
- **`quiz/`** — Quiz/question/alternative CRUD with ownership rules. See [`src/quiz/CLAUDE.md`](src/quiz/CLAUDE.md).
- **`game-session/`** — Real-time game engine (REST + Socket.IO gateway). See [`src/game-session/CLAUDE.md`](src/game-session/CLAUDE.md).

### Data Model

```
Host → Quiz → Question → Alternative
Host → GameSession → Player → Answer
       Quiz ↗
```

Swagger UI: `http://localhost:3333/swagger`

## Environment Variables

Required in `.env`:

```
POSTGRES_DB=radardb
POSTGRES_USER=admin
POSTGRES_PASSWORD=<password>
DATABASE_URL=postgresql://admin:<password>@postgresql:5432/radardb?schema=public
PORT=3333
NODE_ENV=production
JWT_SECRET=<long-random-string>
```

When running locally without Docker, change `@postgresql:` to `@localhost:` in `DATABASE_URL`.

## Commit Convention

Conventional Commits in English. **No emojis in commit messages or PR titles.**

Format: `<type>(<scope>): <imperative description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

Examples:
- `feat(quiz): add support for multiple-choice questions`
- `fix(game-session): resolve race condition in player joining`
- `chore(deps): bump prisma client to latest major version`
