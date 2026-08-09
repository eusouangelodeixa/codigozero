-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "accessType" TEXT NOT NULL DEFAULT 'subscription',
ADD COLUMN     "productPid" TEXT,
ADD COLUMN     "webhookToken" TEXT;

-- AlterTable
ALTER TABLE "Module" ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CourseAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "expiresAt" TIMESTAMP(3),
    "orderId" TEXT,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseAccess_userId_idx" ON "CourseAccess"("userId");

-- CreateIndex
CREATE INDEX "CourseAccess_courseId_idx" ON "CourseAccess"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAccess_userId_courseId_key" ON "CourseAccess"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_webhookToken_key" ON "Course"("webhookToken");

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAccess" ADD CONSTRAINT "CourseAccess_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

