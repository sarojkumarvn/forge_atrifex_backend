import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  generateDailyStandup,
  generateExecutiveSummary,
  generateProjectAnalysis,
  generateProjectHealth,
  generateRiskAnalysis,
  generateRiskPrediction,
  generateSprintPlan,
  generateTaskAssignment,
  generateTaskSuggestions,
  generateTeamAnalysis,
  generateTeamCoaching,
  generateWeeklyReport,
  updateAIRecommendationStatus,
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

export const projectHealth = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Project health generated successfully",
    await generateProjectHealth(req.user, req.params.projectId),
  );
});

export const taskAssignment = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Task assignment recommendation generated successfully",
    await generateTaskAssignment(req.user, req.params.projectId),
  );
});

export const sprintPlan = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Sprint plan generated successfully",
    await generateSprintPlan(req.user, req.params.projectId),
  );
});

export const dailyStandup = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Daily standup generated successfully",
    await generateDailyStandup(req.user, req.params.teamId),
  );
});

export const weeklyReport = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Weekly report generated successfully",
    await generateWeeklyReport(req.user, req.params.projectId),
  );
});

export const teamCoaching = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Team coaching generated successfully",
    await generateTeamCoaching(req.user, req.params.teamId),
  );
});

export const riskPrediction = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Risk prediction generated successfully",
    await generateRiskPrediction(req.user, req.params.projectId),
  );
});

export const acceptRecommendation = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "AI recommendation accepted successfully",
    await updateAIRecommendationStatus({ user: req.user, insightId: req.params.insightId, status: "ACCEPTED" }),
  );
});

export const rejectRecommendation = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "AI recommendation rejected successfully",
    await updateAIRecommendationStatus({ user: req.user, insightId: req.params.insightId, status: "REJECTED" }),
  );
});
