import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import logger from "./logger.js";
import metrics from "../utils/metrics.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });

if (!globalForPrisma.prismaQueryMonitoringInitialized) {
  prisma.$on("query", (event) => {
    metrics.recordDatabaseQuery({ durationMs: event.duration });

    if (event.duration > 500) {
      logger.warn(
        {
          durationMs: event.duration,
          target: event.target,
        },
        "Slow Prisma query detected",
      );
    }
  });

  prisma.$on("error", (event) => {
    logger.error({ target: event.target, message: event.message }, "Prisma error event");
  });

  prisma.$on("warn", (event) => {
    logger.warn({ target: event.target, message: event.message }, "Prisma warning event");
  });

  // Register query listeners once when Prisma is reused during development and tests.
  globalForPrisma.prismaQueryMonitoringInitialized = true;
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
