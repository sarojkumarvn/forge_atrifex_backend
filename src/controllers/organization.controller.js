import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  createOrganizationInvite,
  getOrganizationActivity,
  getOrganizationMemberDetails,
  getOrganizationProfile,
  getOrganizationSettings,
  getOrganizationStatistics,
  listOrganizationInvites,
  listOrganizationMembers,
  removeOrganizationMember,
  revokeOrganizationInvite,
  transferOrganizationOwnership,
  updateOrganizationMemberStatus,
  updateOrganizationProfile,
  updateOrganizationSettings,
} from "../services/organization.service.js";

export const getProfile = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Organization profile retrieved successfully", await getOrganizationProfile(req.user));
});

export const updateProfile = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Organization profile updated successfully", await updateOrganizationProfile(req.user, req.body));
});

export const getSettings = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Organization settings retrieved successfully", await getOrganizationSettings(req.user));
});

export const updateSettings = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Organization settings updated successfully", await updateOrganizationSettings(req.user, req.body));
});

export const getMembers = asyncHandler(async (req, res) => {
  const result = await listOrganizationMembers(req.user, req.query);
  return sendSuccess(res, 200, "Organization members retrieved successfully", result.members, result.meta);
});

export const getMember = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Organization member retrieved successfully", await getOrganizationMemberDetails(req.user, req.params.id));
});

export const updateMemberStatus = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "Organization member status updated successfully",
    await updateOrganizationMemberStatus(req.user, req.params.id, req.body.status),
  );
});

export const deleteMember = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Organization member removed successfully", await removeOrganizationMember(req.user, req.params.id));
});

export const getStatistics = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Organization statistics retrieved successfully", await getOrganizationStatistics(req.user));
});

export const getActivity = asyncHandler(async (req, res) => {
  const result = await getOrganizationActivity(req.user, req.query);
  return sendSuccess(res, 200, "Organization activity retrieved successfully", result.activity, result.meta);
});

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
