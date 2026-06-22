import { z } from "zod";
import { projectIdParamSchema, trimmedString, uuidSchema } from "./common.validator.js";

const githubOwnerSchema = trimmedString("repositoryOwner", { min: 1, max: 39 }).regex(
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
  "repositoryOwner must be a valid GitHub owner",
);

const githubRepositoryNameSchema = trimmedString("repositoryName", { min: 1, max: 100 }).regex(
  /^[A-Za-z0-9._-]+$/,
  "repositoryName must be a valid GitHub repository name",
);

export const githubCallbackSchema = {
  query: z.object({
    code: z.string().trim().min(1, "code is required"),
    state: z.string().trim().min(1, "state is required"),
  }),
};

export const connectRepositorySchema = {
  body: z.object({
    projectId: uuidSchema,
    repositoryOwner: githubOwnerSchema,
    repositoryName: githubRepositoryNameSchema,
  }),
};

export const githubProjectSchema = {
  params: projectIdParamSchema,
};
