import prisma from "../config/prisma.js";
import logger from "../config/logger.js";
import metrics from "../utils/metrics.js";

const up = "UP";
const down = "DOWN";

const checkDatabase = async () => {
  const start = performance.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const durationMs = Math.round(performance.now() - start);
    metrics.recordDatabaseQuery({ durationMs });
    return { status: up, durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    metrics.recordDatabaseQuery({ durationMs, failed: true });
    logger.warn({ error: { message: error.message }, durationMs }, "Database readiness check failed");
    return { status: down, durationMs };
  }
};

const checkAiConfig = () => {
  const configured = Boolean(process.env.GROQ_API_KEY && process.env.AI_MODEL);
  return { status: configured ? up : down };
};

const checkGithubConfig = () => {
  const configured = Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && process.env.GITHUB_CALLBACK_URL,
  );
  return { status: configured ? up : down };
};

export const getLiveness = () => ({
  success: true,
  status: up,
});

export const getReadiness = async () => {
  const database = await checkDatabase();
  const ai = checkAiConfig();
  const github = checkGithubConfig();
  const checks = {
    database: database.status,
    ai: ai.status,
    github: github.status,
  };
  const ready = Object.values(checks).every((status) => status === up);

  return {
    httpStatus: ready ? 200 : 503,
    body: {
      success: ready,
      status: ready ? "READY" : "NOT_READY",
      checks,
    },
  };
};
