import { AppError } from "../utils/errors.js";

const prismaErrorStatus = {
  P2002: 409,
  P2025: 404,
};

const formatErrors = (error) => {
  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return error.errors;
  }

  return undefined;
};

const errorMiddleware = (error, req, res, next) => {
  const statusCode = error.statusCode || prismaErrorStatus[error.code] || 500;
  const isProduction = process.env.NODE_ENV === "production";
  const isOperational = error instanceof AppError || statusCode < 500;
  const message = isOperational || !isProduction ? error.message : "Internal server error";

  if (!isProduction) {
    console.error(error);
  }

  const response = {
    success: false,
    message: message || "Internal server error",
  };

  const errors = formatErrors(error);
  if (errors) {
    response.errors = errors;
  }

  if (!isProduction && error.stack) {
    response.stack = error.stack;
  }

  return res.status(statusCode).json(response);
};

export default errorMiddleware;
