-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "supportEndHour" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN     "supportHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "supportNotifyName" TEXT,
ADD COLUMN     "supportNotifyPhone" TEXT,
ADD COLUMN     "supportRearmHours" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "supportStartHour" INTEGER NOT NULL DEFAULT 8;
