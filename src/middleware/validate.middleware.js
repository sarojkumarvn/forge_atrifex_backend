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

    // Parsed values are assigned back so controllers receive trimmed and coerced input.
    req.body = body.value;
    req.params = params.value;
    req.query = query.value;

    return next();
  } catch (error) {
    return next(error);
  }
};

export default validate;
