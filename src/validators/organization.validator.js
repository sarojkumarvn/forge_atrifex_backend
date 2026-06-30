import { z } from "zod";
import {
  atLeastOneField,
  emailSchema,
  optionalTrimmedString,
  paginationQuerySchema,
  searchQuerySchema,
  userRoleSchema,
  uuidSchema,
} from "./common.validator.js";

const organizationSortFields = z.enum(["fullName", "email", "role", "status", "createdAt"]);
const sortOrderSchema = z.enum(["asc", "desc"]);
const memberStatusSchema = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]);

export const organizationUpdateSchema = {
  body: atLeastOneField(
    z.object({
      name: optionalTrimmedString("name", { max: 120 }),
      logo: z.string().trim().url("logo must be a valid URL").max(2048).optional(),
      description: optionalTrimmedString("description", { max: 1000 }),
      website: z.string().trim().url("website must be a valid URL").max(2048).optional(),
      timezone: optionalTrimmedString("timezone", { max: 80 }),
      companySize: optionalTrimmedString("companySize", { max: 80 }),
    }),
    "At least one organization field is required",
  ),
};

export const organizationSettingsSchema = {
  body: atLeastOneField(
    z.object({
      allowPublicInvites: z.boolean().optional(),
      requireAdminApproval: z.boolean().optional(),
      defaultMemberRole: userRoleSchema.optional(),
      aiEnabled: z.boolean().optional(),
      githubIntegrationEnabled: z.boolean().optional(),
      notificationsEnabled: z.boolean().optional(),
    }),
    "At least one organization setting is required",
  ),
};

export const organizationMembersQuerySchema = {
  query: paginationQuerySchema.merge(searchQuerySchema).extend({
    role: userRoleSchema.optional(),
    status: memberStatusSchema.optional(),
    teamId: uuidSchema.optional(),
    sortBy: organizationSortFields.optional(),
    sortOrder: sortOrderSchema.optional(),
  }),
};

export const organizationMemberParamSchema = {
  params: z.object({
    id: uuidSchema,
  }),
};

export const organizationMemberStatusSchema = {
  params: z.object({
    id: uuidSchema,
  }),
  body: z.object({
    status: memberStatusSchema,
  }),
};

export const organizationActivityQuerySchema = {
  query: paginationQuerySchema.merge(searchQuerySchema).extend({
    action: z.string().trim().max(120).optional(),
    entityType: z
      .enum([
        "ORGANIZATION",
        "USER",
        "TEAM",
        "TEAM_MEMBERSHIP",
        "PROJECT",
        "TASK",
        "NOTIFICATION",
        "REPORT",
        "GITHUB_REPOSITORY",
        "AI_INSIGHT",
      ])
      .optional(),
  }),
};

export const createInviteSchema = {
  body: z.object({
    invitedEmail: emailSchema,
    role: userRoleSchema,
  }),
};

export const revokeInviteSchema = {
  params: z.object({
    id: uuidSchema,
  }),
};

export const transferOwnershipSchema = {
  body: z.object({
    nextOwnerId: uuidSchema,
  }),
};
