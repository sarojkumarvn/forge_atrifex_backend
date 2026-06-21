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

const router = Router();

router.use(authMiddleware);

router.get("/", getTeams);
router.get("/:id", getTeamById);
router.post("/", roleMiddleware("ADMIN"), createTeam);
router.patch("/:id", roleMiddleware("ADMIN"), updateTeam);
router.delete("/:id", roleMiddleware("ADMIN"), deleteTeam);
router.post("/:id/members", roleMiddleware("ADMIN"), addTeamMembers);
router.delete("/:id/members/:userId", roleMiddleware("ADMIN"), removeTeamMember);

export default router;
