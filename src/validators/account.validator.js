import { z } from "zod";
import { atLeastOneField, optionalTrimmedString, passwordSchema, trimmedString } from "./common.validator.js";

export const accountProfileUpdateSchema = {
  body: atLeastOneField(
    z.object({
      fullName: trimmedString("fullName", { min: 2, max: 100 }).optional(),
      avatar: z.string().trim().url("avatar must be a valid URL").max(2048).optional(),
      phone: optionalTrimmedString("phone", { max: 40 }),
      location: optionalTrimmedString("location", { max: 120 }),
      githubUsername: z.string().trim().min(1).max(39).optional(),
    }),
    "At least one account field is required",
  ),
};

export const accountPasswordChangeSchema = {
  body: z.object({
    currentPassword: z.string().min(1, "currentPassword is required").max(128),
    newPassword: passwordSchema,
  }),
};
