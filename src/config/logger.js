import pino from "pino";

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.token",
  "req.body.githubAccessToken",
  "req.body.apiKey",
  "authorization",
  "password",
  "token",
  "apiKey",
  "githubAccessToken",
];

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: {
    environment: process.env.NODE_ENV || "development",
    service: "forge-atrifex-backend",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: "message",
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
  },
});

export default logger;
