import { Router } from "express";
import {
  deleteMember,
  deleteOrganizationInvite,
  getActivity,
  getMember,
  getMembers,
  getOrganizationInvites,
  getProfile,
  getSettings,
  getStatistics,
  inviteOrganization,
  transferOwnership,
  updateMemberStatus,
  updateProfile,
  updateSettings,
} from "../controllers/organization.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";
import {
  createInviteSchema,
  organizationActivityQuerySchema,
  organizationMemberParamSchema,
  organizationMembersQuerySchema,
  organizationMemberStatusSchema,
  organizationSettingsSchema,
  organizationUpdateSchema,
  revokeInviteSchema,
  transferOwnershipSchema,
} from "../validators/organization.validator.js";

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware("ADMIN"));

router.get("/me", getProfile);
router.patch("/me", validate(organizationUpdateSchema), updateProfile);
router.get("/settings", getSettings);
router.patch("/settings", validate(organizationSettingsSchema), updateSettings);
router.get("/members", validate(organizationMembersQuerySchema), getMembers);
router.get("/members/:id", validate(organizationMemberParamSchema), getMember);
router.patch("/members/:id/status", validate(organizationMemberStatusSchema), updateMemberStatus);
router.delete("/members/:id", validate(organizationMemberParamSchema), deleteMember);
router.get("/statistics", getStatistics);
router.get("/activity", validate(organizationActivityQuerySchema), getActivity);
router.post("/invite", validate(createInviteSchema), inviteOrganization);
router.get("/invites", getOrganizationInvites);
router.delete("/invites/:id", validate(revokeInviteSchema), deleteOrganizationInvite);
router.post("/transfer-ownership", validate(transferOwnershipSchema), transferOwnership);

export default router;
