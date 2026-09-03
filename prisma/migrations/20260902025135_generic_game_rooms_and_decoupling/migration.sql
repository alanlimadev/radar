/*
  Warnings:

  - You are about to drop the `answers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `game_sessions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `players` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "alternatives" DROP CONSTRAINT "alternatives_questionId_fkey";

-- DropForeignKey
ALTER TABLE "answers" DROP CONSTRAINT "answers_alternativeId_fkey";

-- DropForeignKey
ALTER TABLE "answers" DROP CONSTRAINT "answers_playerId_fkey";

-- DropForeignKey
ALTER TABLE "answers" DROP CONSTRAINT "answers_questionId_fkey";

-- DropForeignKey
ALTER TABLE "game_sessions" DROP CONSTRAINT "game_sessions_hostId_fkey";

-- DropForeignKey
ALTER TABLE "game_sessions" DROP CONSTRAINT "game_sessions_quizId_fkey";

-- DropForeignKey
ALTER TABLE "players" DROP CONSTRAINT "players_gameSessionId_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_quizId_fkey";

-- DropTable
DROP TABLE "answers";

-- DropTable
DROP TABLE "game_sessions";

-- DropTable
DROP TABLE "players";

-- DropEnum
DROP TYPE "GameSessionStatus";

-- CreateTable
CREATE TABLE "game_rooms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "gameType" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOBBY',
    "config" JSONB NOT NULL DEFAULT '{}',
    "results" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "game_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_players" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_rooms_code_key" ON "game_rooms"("code");

-- AddForeignKey
ALTER TABLE "game_rooms" ADD CONSTRAINT "game_rooms_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "hosts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "game_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alternatives" ADD CONSTRAINT "alternatives_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
