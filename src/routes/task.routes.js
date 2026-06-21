import { Router } from "express";
import {
  createTask,
  deleteTask,
  getTaskById,
  getTasks,
  reassignTask,
  updateTask,
  updateTaskProgress,
  updateTaskStatus,
} from "../controllers/task.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", getTasks);
router.get("/:id", getTaskById);
router.post("/", roleMiddleware("TEAM_LEAD", "ADMIN"), createTask);
router.patch("/:id", updateTask);
router.patch("/:id/status", updateTaskStatus);
router.patch("/:id/progress", updateTaskProgress);
router.patch("/:id/reassign", roleMiddleware("TEAM_LEAD", "ADMIN"), reassignTask);
router.delete("/:id", roleMiddleware("TEAM_LEAD", "ADMIN"), deleteTask);

export default router;
