-- AlterTable
ALTER TABLE "User" ADD COLUMN "githubAccessToken" TEXT;
ALTER TABLE "User" ADD COLUMN "githubTokenScope" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "githubRepositoryId" TEXT;
ALTER TABLE "Project" ADD COLUMN "githubRepositoryOwner" TEXT;
ALTER TABLE "Project" ADD COLUMN "githubRepositoryName" TEXT;
ALTER TABLE "Project" ADD COLUMN "githubDefaultBranch" TEXT;

-- CreateIndex
CREATE INDEX "Project_githubRepositoryOwner_githubRepositoryName_idx" ON "Project"("githubRepositoryOwner", "githubRepositoryName");
