import { Router } from "express";
import {
  getActivityById,
  getActivityFeed,
  getProjectActivity,
  getTeamActivity,
} from "../controllers/activity.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", getActivityFeed);
router.get("/team/:teamId", getTeamActivity);
router.get("/project/:projectId", getProjectActivity);
router.get("/:id", getActivityById);

export default router;
