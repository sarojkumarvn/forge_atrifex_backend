import logger from "../config/logger.js";
import prisma from "../config/prisma.js";

const defaultShutdownTimeoutMs = 10000;

export const createGracefulShutdown = ({
  server,
  timeoutMs = defaultShutdownTimeoutMs,
  exit = process.exit,
  disconnect = () => prisma.$disconnect(),
  log = logger,
} = {}) => {
  let shuttingDown = false;

  return async (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    log.info({ signal }, "Shutdown signal received");

    const forceExitTimer = setTimeout(() => {
      log.error({ signal, timeoutMs }, "Graceful shutdown timed out");
      exit(1);
    }, timeoutMs);
    forceExitTimer.unref?.();

    try {
      // Stop accepting new HTTP connections before closing shared dependencies.
      await new Promise((resolve, reject) => {
        if (!server?.close) return resolve();
        return server.close((error) => (error ? reject(error) : resolve()));
      });

      // Prisma is closed after the HTTP server drains active requests.
      await disconnect();
      log.info({ signal }, "Graceful shutdown completed");
      log.flush?.();
      clearTimeout(forceExitTimer);
      exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      log.error({ signal, error }, "Graceful shutdown failed");
      log.flush?.();
      exit(1);
    }
  };
};

export const registerGracefulShutdown = (shutdown) => {
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
};
