import { z } from "zod";
import { projectIdParamSchema, teamIdParamSchema, uuidSchema } from "./common.validator.js";

export const aiProjectSchema = {
  params: projectIdParamSchema,
};

export const aiTeamSchema = {
  params: teamIdParamSchema,
};

export const executiveSummarySchema = {
  body: undefined,
};

export const aiInsightSchema = {
  params: z.object({
    insightId: uuidSchema,
  }),
};
