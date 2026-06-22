import { z } from "zod";
import {
  memberIdParamSchema,
  optionalDateSchema,
  projectIdParamSchema,
  projectStatusSchema,
  taskStatusSchema,
  teamIdParamSchema,
  uuidSchema,
} from "./common.validator.js";

const reportStatusSchema = z.union([projectStatusSchema, taskStatusSchema]);

export const reportQuerySchema = z
  .object({
    dateFrom: optionalDateSchema,
    dateTo: optionalDateSchema,
    projectId: uuidSchema.optional(),
    teamId: uuidSchema.optional(),
    memberId: uuidSchema.optional(),
    status: reportStatusSchema.optional(),
  })
  .refine((query) => !query.dateFrom || !query.dateTo || new Date(query.dateFrom) <= new Date(query.dateTo), {
    message: "dateFrom must be before dateTo",
    path: ["dateFrom"],
  });

export const projectReportSchema = {
  params: projectIdParamSchema,
  query: reportQuerySchema,
};

export const teamReportSchema = {
  params: teamIdParamSchema,
  query: reportQuerySchema,
};

export const memberReportSchema = {
  params: memberIdParamSchema,
  query: reportQuerySchema,
};

export const reportFiltersSchema = {
  query: reportQuerySchema,
};
