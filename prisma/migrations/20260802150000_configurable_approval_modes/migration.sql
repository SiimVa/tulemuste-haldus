-- AlterTable
ALTER TABLE "Competition"
ADD COLUMN "registrationApprovalMode" TEXT NOT NULL DEFAULT 'AUTOMATIC',
ADD COLUMN "mandateApprovalMode" TEXT NOT NULL DEFAULT 'MANUAL';
