-- CreateEnum
CREATE TYPE "OrganizationInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "nameNormalized" TEXT;
ALTER TABLE "Organization" ADD COLUMN "ownerId" UUID;

-- Backfill normalized names for existing rows.
UPDATE "Organization" SET "nameNormalized" = lower("name") WHERE "nameNormalized" IS NULL;

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "nameNormalized" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_nameNormalized_key" ON "Organization"("nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_ownerId_key" ON "Organization"("ownerId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "OrganizationInvite" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "inviteTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" UUID NOT NULL,
    "status" "OrganizationInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvite_inviteTokenHash_key" ON "OrganizationInvite"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "OrganizationInvite_organizationId_idx" ON "OrganizationInvite"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationInvite_invitedEmail_idx" ON "OrganizationInvite"("invitedEmail");

-- CreateIndex
CREATE INDEX "OrganizationInvite_status_idx" ON "OrganizationInvite"("status");

-- CreateIndex
CREATE INDEX "OrganizationInvite_expiresAt_idx" ON "OrganizationInvite"("expiresAt");

-- AddForeignKey
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
