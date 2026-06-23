import dotenv from "dotenv";

dotenv.config();

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is required for tests. Refusing to run automated tests against DATABASE_URL.",
  );
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || "test-groq-key";
process.env.AI_MODEL = process.env.AI_MODEL || "test-model";
process.env.AI_PROVIDER = process.env.AI_PROVIDER || "groq";
process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "test-github-client";
process.env.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "test-github-secret";
process.env.GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || "http://localhost/github/callback";
process.env.GITHUB_TOKEN_ENCRYPTION_KEY =
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY || "test-github-token-encryption-key";
process.env.GITHUB_API_URL = process.env.GITHUB_API_URL || "https://api.github.test";

const { default: prisma } = await import("../../src/config/prisma.js");

export const resetDatabase = async () => {
  // Reset the full test schema in one statement so FK ordering does not leak rows between suites.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "ActivityLog",
      "Notification",
      "Task",
      "Project",
      "TeamMembership",
      "Team",
      "User",
      "Organization"
    RESTART IDENTITY CASCADE
  `);
};

export const disconnectDatabase = async () => {
  await prisma.$disconnect();
};

export default prisma;
