import { z } from "zod";
import { emailSchema, userRoleSchema, uuidSchema } from "./common.validator.js";

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
