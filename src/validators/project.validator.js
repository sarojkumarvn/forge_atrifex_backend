import { z } from "zod";
import {
  atLeastOneField,
  idParamSchema,
  optionalDateSchema,
  paginationQuerySchema,
  percentSchema,
  projectStatusSchema,
  searchQuerySchema,
  teamIdParamSchema,
  trimmedString,
  uuidSchema,
} from "./common.validator.js";

const repositoryUrlSchema = z
  .string()
  .trim()
  .url("repositoryUrl must be a valid URL")
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "repositoryUrl must use HTTP or HTTPS")
  .optional()
  .or(z.literal("").transform(() => null));

export const projectListSchema = {
  query: paginationQuerySchema.merge(searchQuerySchema).extend({
    status: projectStatusSchema.optional(),
    teamId: uuidSchema.optional(),
  }),
};

export const projectIdSchema = {
  params: idParamSchema,
};

export const teamProjectsSchema = {
  params: teamIdParamSchema,
  query: paginationQuerySchema,
};

export const createProjectSchema = {
  body: z.object({
    title: trimmedString("title", { min: 1, max: 160 }),
    description: trimmedString("description", { min: 1, max: 5000 }),
    repositoryUrl: repositoryUrlSchema,
    deadline: optionalDateSchema,
    teamId: uuidSchema.optional(),
  }),
};

export const updateProjectSchema = {
  params: idParamSchema,
  body: atLeastOneField(
    z.object({
      title: trimmedString("title", { min: 1, max: 160 }).optional(),
      description: trimmedString("description", { min: 1, max: 5000 }).optional(),
      repositoryUrl: repositoryUrlSchema,
      deadline: optionalDateSchema,
      status: projectStatusSchema.optional(),
      progress: percentSchema("progress").optional(),
      healthScore: percentSchema("healthScore").optional(),
    }),
    "At least one project field is required",
  ),
};

export const assignTeamToProjectSchema = {
  params: idParamSchema,
  body: z.object({
    teamId: uuidSchema,
    deadline: optionalDateSchema,
  }),
};
