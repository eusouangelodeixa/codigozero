-- AlterTable: User gains Close Friends membership fields
ALTER TABLE "User" ADD COLUMN "closeFriends" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "closeFriendsUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "closeFriendsPurchaseCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Transaction gains order bump audit fields
ALTER TABLE "Transaction" ADD COLUMN "orderBumpPid" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "orderBumpAmount" DOUBLE PRECISION;
ALTER TABLE "Transaction" ADD COLUMN "isCloseFriends" BOOLEAN NOT NULL DEFAULT false;
