import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  changeCurrentAccountPassword,
  deactivateCurrentAccount,
  getCurrentAccountProfile,
  updateCurrentAccountProfile,
} from "../services/account.service.js";

export const getMe = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Account profile retrieved successfully", await getCurrentAccountProfile(req.user));
});

export const updateMe = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Account profile updated successfully", await updateCurrentAccountProfile(req.user, req.body));
});

export const changePassword = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Password changed successfully", await changeCurrentAccountPassword(req.user, req.body));
});

export const deactivateMe = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Account deactivated successfully", await deactivateCurrentAccount(req.user));
});
