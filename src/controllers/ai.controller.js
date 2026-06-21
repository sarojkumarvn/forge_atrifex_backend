import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  generateExecutiveSummary,
  generateProjectAnalysis,
  generateRiskAnalysis,
  generateTaskSuggestions,
  generateTeamAnalysis,
} from "../services/ai.service.js";

export const projectAnalysis = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Project analysis generated successfully",
    await generateProjectAnalysis(req.user, req.params.projectId),
  );
});

export const riskAnalysis = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Risk analysis generated successfully",
    await generateRiskAnalysis(req.user, req.params.projectId),
  );
});

export const teamAnalysis = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Team analysis generated successfully",
    await generateTeamAnalysis(req.user, req.params.teamId),
  );
});

export const taskSuggestions = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Task suggestions generated successfully",
    await generateTaskSuggestions(req.user, req.params.projectId),
  );
});

export const executiveSummary = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Executive summary generated successfully",
    await generateExecutiveSummary(req.user),
  );
});
