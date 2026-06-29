import { z } from "zod";
import { emailSchema, passwordSchema, trimmedString, userRoleSchema } from "./common.validator.js";

export const registerSchema = {
  body: z.object({
    fullName: trimmedString("fullName", { min: 2, max: 100 }),
    email: emailSchema,
    password: passwordSchema,
    organizationName: trimmedString("organizationName", { min: 2, max: 120 }).optional(),
    inviteToken: z.string().trim().min(1).optional(),
    role: userRoleSchema.optional(),
    githubUsername: z.string().trim().max(39).optional(),
    phone: z.string().trim().max(40).optional(),
    location: z.string().trim().max(120).optional(),
  }),
};

export const loginSchema = {
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, "password is required").max(128),
  }),
};

export const acceptInviteSchema = {
  body: z.object({
    inviteToken: z.string().trim().min(1, "inviteToken is required"),
    email: emailSchema,
    password: passwordSchema,
    fullName: trimmedString("fullName", { min: 2, max: 100 }),
    githubUsername: z.string().trim().max(39).optional(),
    phone: z.string().trim().max(40).optional(),
    location: z.string().trim().max(120).optional(),
  }),
};
