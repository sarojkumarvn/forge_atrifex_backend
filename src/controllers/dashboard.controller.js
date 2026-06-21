import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  getAdminContributionAnalytics,
  getAdminDeliveryHealth,
  getAdminSummary,
  getMemberActivity,
  getMemberPerformance,
  getMemberSummary,
  getTeamLeadAnalytics,
  getTeamLeadIssues,
  getTeamLeadSummary,
} from "../services/dashboard.service.js";

export const adminDashboardSummary = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Admin dashboard summary retrieved successfully", await getAdminSummary(req.user));
});

export const adminDeliveryHealth = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Delivery health retrieved successfully", await getAdminDeliveryHealth(req.user));
});

export const adminContributionAnalytics = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Contribution analytics retrieved successfully",
    await getAdminContributionAnalytics(req.user),
  );
});

export const teamLeadDashboardSummary = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Team lead dashboard summary retrieved successfully",
    await getTeamLeadSummary(req.user),
  );
});

export const teamLeadAnalytics = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Team analytics retrieved successfully", await getTeamLeadAnalytics(req.user));
});

export const teamLeadIssues = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Team issues retrieved successfully", await getTeamLeadIssues(req.user));
});

export const memberDashboardSummary = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Member dashboard summary retrieved successfully", await getMemberSummary(req.user));
});

export const memberActivity = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Member activity retrieved successfully", await getMemberActivity(req.user));
});

export const memberPerformance = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Member performance retrieved successfully", await getMemberPerformance(req.user));
});
