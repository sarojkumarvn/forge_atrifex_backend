import logger from "../config/logger.js";
import { getRequestLoggerMeta } from "./requestContext.js";

const normalizeError = (error) => ({
  name: error?.name || "Error",
  message: error?.message || "Unknown error",
  code: error?.code,
  statusCode: error?.statusCode,
  stack: process.env.NODE_ENV === "production" ? undefined : error?.stack,
});

export const captureError = (error, context = {}) => {
  const metadata = {
    ...getRequestLoggerMeta(),
    ...context,
    error: normalizeError(error),
  };

  logger.error(metadata, "Application error captured");

  return metadata;
};

export default {
  captureError,
};
