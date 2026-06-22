import { z } from "zod";
import {
  atLeastOneField,
  idParamSchema,
  nullableTrimmedString,
  paginationQuerySchema,
  searchQuerySchema,
  trimmedString,
  uuidSchema,
} from "./common.validator.js";

const memberIdsSchema = z.array(uuidSchema).max(100);

export const teamListSchema = {
  query: paginationQuerySchema.merge(searchQuerySchema),
};

export const teamIdSchema = {
  params: idParamSchema,
};

export const removeTeamMemberSchema = {
  params: idParamSchema.extend({
    userId: uuidSchema,
  }),
};

export const createTeamSchema = {
  body: z.object({
    name: trimmedString("name", { min: 1, max: 120 }),
    description: nullableTrimmedString("description", { max: 1000 }),
    leadId: uuidSchema,
    memberIds: memberIdsSchema.optional(),
  }),
};

export const updateTeamSchema = {
  params: idParamSchema,
  body: atLeastOneField(
    z.object({
      name: trimmedString("name", { min: 1, max: 120 }).optional(),
      description: nullableTrimmedString("description", { max: 1000 }),
      leadId: uuidSchema.optional(),
    }),
    "At least one team field is required",
  ),
};

export const addTeamMembersSchema = {
  params: idParamSchema,
  body: z.object({
    memberIds: memberIdsSchema.min(1, "memberIds must include at least one user"),
  }),
};
