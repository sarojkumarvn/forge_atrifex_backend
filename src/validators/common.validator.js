import { z } from "zod";

export const uuidSchema = z.string().trim().uuid("Invalid UUID");

export const emailSchema = z.string().trim().toLowerCase().email("Invalid email address").max(254);

export const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(128);

export const trimmedString = (fieldName, { min = 1, max = 255 } = {}) =>
  z
    .string({ error: `${fieldName} is required` })
    .trim()
    .min(min, `${fieldName} must be at least ${min} characters`)
    .max(max, `${fieldName} must be at most ${max} characters`);

export const optionalTrimmedString = (fieldName, { max = 1000 } = {}) =>
  z
    .string()
    .trim()
    .max(max, `${fieldName} must be at most ${max} characters`)
    .optional();

export const nullableTrimmedString = (fieldName, { max = 1000 } = {}) =>
  z
    .string()
    .trim()
    .max(max, `${fieldName} must be at most ${max} characters`)
    .optional()
    .transform((value) => (value === "" ? null : value));

export const dateSchema = z
  .string()
  .trim()
  .min(1, "Date is required")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Date must be valid");

export const optionalDateSchema = dateSchema.optional();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const searchQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
});

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const projectIdParamSchema = z.object({
  projectId: uuidSchema,
});

export const teamIdParamSchema = z.object({
  teamId: uuidSchema,
});

export const memberIdParamSchema = z.object({
  memberId: uuidSchema,
});

export const userRoleSchema = z.enum(["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"]);

export const projectStatusSchema = z.enum(["PLANNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]);

export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED", "CANCELLED"]);

export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const percentSchema = (fieldName) =>
  z.coerce.number().int(`${fieldName} must be an integer`).min(0).max(100);

export const atLeastOneField = (schema, message = "At least one field is required") =>
  schema.refine((value) => Object.values(value).some((field) => field !== undefined), {
    message,
    path: ["body"],
  });
