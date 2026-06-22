export class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_SERVER_ERROR", errors = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", errors = []) {
    super(message, 400, "VALIDATION_ERROR", errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later.") {
    super(message, 429, "RATE_LIMITED");
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Internal server error") {
    super(message, 500, "INTERNAL_SERVER_ERROR");
  }
}

export const fromStatusCode = (statusCode, message) => {
  if (statusCode === 400) return new ValidationError(message, []);
  if (statusCode === 401) return new UnauthorizedError(message);
  if (statusCode === 403) return new ForbiddenError(message);
  if (statusCode === 404) return new NotFoundError(message);
  if (statusCode === 409) return new ConflictError(message);
  if (statusCode === 429) return new RateLimitError(message);
  return new AppError(message || "Internal server error", statusCode || 500);
};
