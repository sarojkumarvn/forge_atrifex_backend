import { getLiveness, getReadiness } from "../services/health.service.js";
import asyncHandler from "../utils/asyncHandler.js";

export const liveness = (req, res) => res.json(getLiveness());

export const readiness = asyncHandler(async (req, res) => {
  const result = await getReadiness();
  return res.status(result.httpStatus).json(result.body);
});
