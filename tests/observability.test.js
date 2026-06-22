import { jest } from "@jest/globals";

const queryRawMock = jest.fn();

jest.unstable_mockModule("../src/config/prisma.js", () => ({
  default: {
    $queryRaw: queryRawMock,
    $disconnect: jest.fn(),
  },
}));

describe("observability", () => {
  beforeEach(() => {
    queryRawMock.mockReset();
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.AI_MODEL = "test-model";
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
    process.env.GITHUB_CALLBACK_URL = "http://localhost/github/callback";
  });

  test("health endpoints report liveness and readiness", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
    const { getLiveness, getReadiness } = await import("../src/services/health.service.js");

    expect(getLiveness()).toEqual({
      success: true,
      status: "UP",
    });

    const readiness = await getReadiness();
    expect(readiness.httpStatus).toBe(200);
    expect(readiness.body).toEqual({
      success: true,
      status: "READY",
      checks: {
        database: "UP",
        ai: "UP",
        github: "UP",
      },
    });
  });

  test("readiness reports not ready when database check fails", async () => {
    queryRawMock.mockRejectedValue(new Error("database unavailable"));
    const { getReadiness } = await import("../src/services/health.service.js");

    const readiness = await getReadiness();

    expect(readiness.httpStatus).toBe(503);
    expect(readiness.body.success).toBe(false);
    expect(readiness.body.status).toBe("NOT_READY");
    expect(readiness.body.checks.database).toBe("DOWN");
  });

  test("request id middleware sets request context and response header", async () => {
    const { default: requestIdMiddleware } = await import("../src/middleware/requestId.middleware.js");
    const { getRequestId } = await import("../src/utils/requestContext.js");
    const req = {
      get: jest.fn(() => "test-request-id"),
    };
    const res = {
      setHeader: jest.fn(),
    };

    await new Promise((resolve) => {
      requestIdMiddleware(req, res, () => {
        expect(req.requestId).toBe("test-request-id");
        expect(getRequestId()).toBe("test-request-id");
        resolve();
      });
    });

    expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", "test-request-id");
  });

  test("logger initializes with standard logging methods", async () => {
    const { default: logger } = await import("../src/config/logger.js");

    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  test("graceful shutdown closes server and disconnects dependencies", async () => {
    const close = jest.fn((callback) => callback());
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const exit = jest.fn();
    const log = {
      info: jest.fn(),
      error: jest.fn(),
      flush: jest.fn(),
    };
    const { createGracefulShutdown } = await import("../src/utils/gracefulShutdown.js");

    const shutdown = createGracefulShutdown({
      server: { close },
      disconnect,
      exit,
      log,
      timeoutMs: 100,
    });

    await shutdown("SIGTERM");

    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
