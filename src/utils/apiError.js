import { fromStatusCode } from "./errors.js";

class ApiError extends Error {
  constructor(statusCode, message) {
    const error = fromStatusCode(statusCode, message);
    super(error.message);
    this.name = error.name;
    this.statusCode = error.statusCode;
    this.code = error.code;
    this.errors = error.errors;
  }
}

export default ApiError;
