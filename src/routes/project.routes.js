import { Router } from "express";
import {
  assignTeamToProject,
  createProject,
  deleteProject,
  getProjectById,
  getProjects,
  getProjectsForTeam,
  updateProject,
} from "../controllers/project.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", getProjects);
router.get("/team/:teamId", getProjectsForTeam);
router.get("/:id", getProjectById);
router.post("/", roleMiddleware("ADMIN"), createProject);
router.patch("/:id", roleMiddleware("ADMIN"), updateProject);
router.delete("/:id", roleMiddleware("ADMIN"), deleteProject);
router.post("/:id/assign-team", roleMiddleware("ADMIN"), assignTeamToProject);

export default router;
