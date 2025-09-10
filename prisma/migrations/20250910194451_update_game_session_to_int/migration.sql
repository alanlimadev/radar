/*
  Warnings:

  - The primary key for the `game_sessions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `game_sessions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `gameSessionId` on the `players` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "players" DROP CONSTRAINT "players_gameSessionId_fkey";

-- AlterTable
ALTER TABLE "game_sessions" DROP CONSTRAINT "game_sessions_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "players" DROP COLUMN "gameSessionId",
ADD COLUMN     "gameSessionId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_gameSessionId_fkey" FOREIGN KEY ("gameSessionId") REFERENCES "game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
