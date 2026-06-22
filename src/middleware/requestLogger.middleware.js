import pinoHttp from "pino-http";
import logger from "../config/logger.js";
import metrics from "../utils/metrics.js";

const requestLogger = pinoHttp({
  logger,
  autoLogging: process.env.ENABLE_REQUEST_LOGGING !== "false",
  genReqId: (req) => req.requestId,
  customProps: (req) => ({
    requestId: req.requestId,
  }),
  customLogLevel: (req, res, error) => {
    if (error || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        path: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});

export const requestMetricsMiddleware = (req, res, next) => {
  const start = performance.now();

  res.on("finish", () => {
    const durationMs = Math.round(performance.now() - start);
    metrics.recordRequest({ method: req.method, path: req.path, statusCode: res.statusCode, durationMs });

    if (durationMs > 1000) {
      logger.warn(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
        },
        "Slow request detected",
      );
    }
  });

  return next();
};

export default requestLogger;
