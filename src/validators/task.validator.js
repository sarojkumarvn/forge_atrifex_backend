import { z } from "zod";
import {
  atLeastOneField,
  idParamSchema,
  nullableTrimmedString,
  optionalDateSchema,
  paginationQuerySchema,
  percentSchema,
  searchQuerySchema,
  taskPrioritySchema,
  taskStatusSchema,
  trimmedString,
  uuidSchema,
} from "./common.validator.js";

export const taskListSchema = {
  query: paginationQuerySchema.merge(searchQuerySchema).extend({
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    projectId: uuidSchema.optional(),
    teamId: uuidSchema.optional(),
    assigneeId: uuidSchema.optional(),
  }),
};

export const taskIdSchema = {
  params: idParamSchema,
};

export const createTaskSchema = {
  body: z.object({
    title: trimmedString("title", { min: 1, max: 180 }),
    description: nullableTrimmedString("description", { max: 4000 }),
    projectId: uuidSchema,
    assigneeId: uuidSchema,
    priority: taskPrioritySchema.optional(),
    deadline: optionalDateSchema,
  }),
};

export const updateTaskSchema = {
  params: idParamSchema,
  body: atLeastOneField(
    z.object({
      title: trimmedString("title", { min: 1, max: 180 }).optional(),
      description: nullableTrimmedString("description", { max: 4000 }),
      priority: taskPrioritySchema.optional(),
      deadline: optionalDateSchema,
      status: taskStatusSchema.optional(),
      progress: percentSchema("progress").optional(),
    }),
    "At least one task field is required",
  ),
};

export const updateTaskStatusSchema = {
  params: idParamSchema,
  body: z.object({
    status: taskStatusSchema,
  }),
};

export const updateTaskProgressSchema = {
  params: idParamSchema,
  body: z.object({
    progress: percentSchema("progress"),
  }),
};

export const reassignTaskSchema = {
  params: idParamSchema,
  body: z.object({
    assigneeId: uuidSchema,
  }),
};
