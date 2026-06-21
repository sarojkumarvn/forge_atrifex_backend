import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  getDeliveryReport,
  getExecutiveSummary,
  getMemberReport,
  getProjectReport,
  getTeamReport,
  parseReportFilters,
} from "../services/report.service.js";

export const projectReport = asyncHandler(async (req, res) => {
  parseReportFilters(req.query);

  return sendSuccess(
    res,
    200,
    "Project report generated successfully",
    await getProjectReport(req.user, req.params.projectId, req.query),
  );
});

export const teamReport = asyncHandler(async (req, res) => {
  parseReportFilters(req.query);

  return sendSuccess(
    res,
    200,
    "Team report generated successfully",
    await getTeamReport(req.user, req.params.teamId, req.query),
  );
});

export const memberReport = asyncHandler(async (req, res) => {
  parseReportFilters(req.query);

  return sendSuccess(
    res,
    200,
    "Member report generated successfully",
    await getMemberReport(req.user, req.params.memberId, req.query),
  );
});

export const deliveryReport = asyncHandler(async (req, res) => {
  parseReportFilters(req.query);

  return sendSuccess(res, 200, "Delivery report generated successfully", await getDeliveryReport(req.user, req.query));
});

export const executiveSummary = asyncHandler(async (req, res) => {
  parseReportFilters(req.query);

  return sendSuccess(
    res,
    200,
    "Executive summary generated successfully",
    await getExecutiveSummary(req.user, req.query),
  );
});
