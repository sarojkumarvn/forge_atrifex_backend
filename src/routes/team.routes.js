import { Router } from "express";
import {
  addTeamMembers,
  createTeam,
  deleteTeam,
  getTeamById,
  getTeams,
  removeTeamMember,
  updateTeam,
} from "../controllers/team.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";
import {
  addTeamMembersSchema,
  createTeamSchema,
  removeTeamMemberSchema,
  teamIdSchema,
  teamListSchema,
  updateTeamSchema,
} from "../validators/team.validator.js";

const router = Router();

router.use(authMiddleware);

router.get("/", validate(teamListSchema), getTeams);
router.get("/:id", validate(teamIdSchema), getTeamById);
router.post("/", roleMiddleware("ADMIN"), validate(createTeamSchema), createTeam);
router.patch("/:id", roleMiddleware("ADMIN"), validate(updateTeamSchema), updateTeam);
router.delete("/:id", roleMiddleware("ADMIN"), validate(teamIdSchema), deleteTeam);
router.post("/:id/members", roleMiddleware("ADMIN"), validate(addTeamMembersSchema), addTeamMembers);
router.delete("/:id/members/:userId", roleMiddleware("ADMIN"), validate(removeTeamMemberSchema), removeTeamMember);

export default router;
