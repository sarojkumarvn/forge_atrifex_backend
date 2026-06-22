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
import validate from "../middleware/validate.middleware.js";
import {
  assignTeamToProjectSchema,
  createProjectSchema,
  projectIdSchema,
  projectListSchema,
  teamProjectsSchema,
  updateProjectSchema,
} from "../validators/project.validator.js";

const router = Router();

router.use(authMiddleware);

router.get("/", validate(projectListSchema), getProjects);
router.get("/team/:teamId", validate(teamProjectsSchema), getProjectsForTeam);
router.get("/:id", validate(projectIdSchema), getProjectById);
router.post("/", roleMiddleware("ADMIN"), validate(createProjectSchema), createProject);
router.patch("/:id", roleMiddleware("ADMIN"), validate(updateProjectSchema), updateProject);
router.delete("/:id", roleMiddleware("ADMIN"), validate(projectIdSchema), deleteProject);
router.post("/:id/assign-team", roleMiddleware("ADMIN"), validate(assignTeamToProjectSchema), assignTeamToProject);

export default router;
