import { projectIdParamSchema, teamIdParamSchema } from "./common.validator.js";

export const aiProjectSchema = {
  params: projectIdParamSchema,
};

export const aiTeamSchema = {
  params: teamIdParamSchema,
};

export const executiveSummarySchema = {
  body: undefined,
};
