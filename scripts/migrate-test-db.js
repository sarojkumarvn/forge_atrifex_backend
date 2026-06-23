import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL is required to migrate the test database.");
  process.exit(1);
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
