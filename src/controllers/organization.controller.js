import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  createOrganizationInvite,
  listOrganizationInvites,
  revokeOrganizationInvite,
  transferOrganizationOwnership,
} from "../services/organization.service.js";

export const inviteOrganization = asyncHandler(async (req, res) => {
  return sendSuccess(res, 201, "Organization invite created successfully", await createOrganizationInvite(req.user, req.body));
});

export const getOrganizationInvites = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Organization invites retrieved successfully", await listOrganizationInvites(req.user));
});

export const deleteOrganizationInvite = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Organization invite revoked successfully", await revokeOrganizationInvite(req.user, req.params.id));
});

export const transferOwnership = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Organization ownership transferred successfully", await transferOrganizationOwnership(req.user, req.body.nextOwnerId));
});
