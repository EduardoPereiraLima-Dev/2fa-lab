-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailOtpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmailOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailOtp_userId_idx" ON "EmailOtp"("userId");

-- CreateIndex
CREATE INDEX "EmailOtp_expiresAt_idx" ON "EmailOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailOtp_userId_usedAt_idx" ON "EmailOtp"("userId", "usedAt");

-- AddForeignKey
ALTER TABLE "EmailOtp" ADD CONSTRAINT "EmailOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;