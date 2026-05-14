/*
  Warnings:

  - Added the required column `order` to the `questions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "order" INTEGER NOT NULL;
