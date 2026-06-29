import { Router } from "express";
import {
  deleteOrganizationInvite,
  getOrganizationInvites,
  inviteOrganization,
  transferOwnership,
} from "../controllers/organization.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";
import {
  createInviteSchema,
  revokeInviteSchema,
  transferOwnershipSchema,
} from "../validators/organization.validator.js";

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware("ADMIN"));

router.post("/invite", validate(createInviteSchema), inviteOrganization);
router.get("/invites", getOrganizationInvites);
router.delete("/invites/:id", validate(revokeInviteSchema), deleteOrganizationInvite);
router.post("/transfer-ownership", validate(transferOwnershipSchema), transferOwnership);

export default router;
