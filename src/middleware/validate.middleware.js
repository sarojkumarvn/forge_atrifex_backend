import { ZodError } from "zod";
import { ValidationError } from "../utils/errors.js";

const formatPath = (issue) => issue.path.join(".");

const formatZodErrors = (error, segment) =>
  error.issues.map((issue) => ({
    field: [segment, formatPath(issue)].filter(Boolean).join("."),
    message: issue.message,
  }));

const parseSegment = (schema, value, segment) => {
  if (!schema) {
    return { value, errors: [] };
  }

  try {
    return { value: schema.parse(value), errors: [] };
  } catch (error) {
    if (error instanceof ZodError) {
      return { value, errors: formatZodErrors(error, segment) };
    }

    throw error;
  }
};

const validate = (schema) => (req, res, next) => {
  try {
    const body = parseSegment(schema.body, req.body, "body");
    const params = parseSegment(schema.params, req.params, "params");
    const query = parseSegment(schema.query, req.query, "query");
    const errors = [...body.errors, ...params.errors, ...query.errors];

    if (errors.length > 0) {
      throw new ValidationError("Validation failed", errors);
    }

    // Parsed values are assigned back only for declared schemas so Express getter-backed fields are not overwritten.
    if (schema.body) req.body = body.value;
    if (schema.params) req.params = params.value;
    if (schema.query) {
      Object.defineProperty(req, "query", {
        value: query.value,
        writable: true,
        configurable: true,
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

export default validate;
