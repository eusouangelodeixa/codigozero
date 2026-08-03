-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "feedbackEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "komunikaWebhookSecret" TEXT;

-- CreateTable
CREATE TABLE "FeedbackSurvey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "anchorTxnId" TEXT,
    "anchorAt" TIMESTAMP(3) NOT NULL,
    "channel" TEXT,
    "feedbackStatus" TEXT NOT NULL DEFAULT 'scheduled',
    "feedbackDueAt" TIMESTAMP(3) NOT NULL,
    "feedbackStartedAt" TIMESTAMP(3),
    "feedbackCompletedAt" TIMESTAMP(3),
    "currentQuestion" INTEGER NOT NULL DEFAULT 0,
    "unansweredStreak" INTEGER NOT NULL DEFAULT 0,
    "nextActionAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "suggestionStatus" TEXT NOT NULL DEFAULT 'scheduled',
    "suggestionDueAt" TIMESTAMP(3) NOT NULL,
    "suggestionSentAt" TIMESTAMP(3),
    "suggestionWindowEndsAt" TIMESTAMP(3),
    "thankYouSentAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "whatsappMessageId" TEXT,
    "optionText" TEXT,
    "score" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "FeedbackResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackSuggestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "whatsappMessageId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackSurvey_userId_key" ON "FeedbackSurvey"("userId");

-- CreateIndex
CREATE INDEX "FeedbackSurvey_feedbackStatus_feedbackDueAt_idx" ON "FeedbackSurvey"("feedbackStatus", "feedbackDueAt");

-- CreateIndex
CREATE INDEX "FeedbackSurvey_suggestionStatus_suggestionDueAt_idx" ON "FeedbackSurvey"("suggestionStatus", "suggestionDueAt");

-- CreateIndex
CREATE INDEX "FeedbackSurvey_feedbackStatus_nextActionAt_idx" ON "FeedbackSurvey"("feedbackStatus", "nextActionAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackResponse_whatsappMessageId_key" ON "FeedbackResponse"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "FeedbackResponse_questionKey_score_idx" ON "FeedbackResponse"("questionKey", "score");

-- CreateIndex
CREATE INDEX "FeedbackResponse_answeredAt_idx" ON "FeedbackResponse"("answeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackResponse_surveyId_questionKey_key" ON "FeedbackResponse"("surveyId", "questionKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackSuggestion_whatsappMessageId_key" ON "FeedbackSuggestion"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "FeedbackSuggestion_isRead_createdAt_idx" ON "FeedbackSuggestion"("isRead", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackSuggestion_surveyId_idx" ON "FeedbackSuggestion"("surveyId");

-- AddForeignKey
ALTER TABLE "FeedbackSurvey" ADD CONSTRAINT "FeedbackSurvey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "FeedbackSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackSuggestion" ADD CONSTRAINT "FeedbackSuggestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "FeedbackSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

