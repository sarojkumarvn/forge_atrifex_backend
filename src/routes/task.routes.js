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
import validate from "../middleware/validate.middleware.js";
import {
  createTaskSchema,
  reassignTaskSchema,
  taskIdSchema,
  taskListSchema,
  updateTaskProgressSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from "../validators/task.validator.js";

const router = Router();

router.use(authMiddleware);

router.get("/", validate(taskListSchema), getTasks);
router.get("/:id", validate(taskIdSchema), getTaskById);
router.post("/", roleMiddleware("TEAM_LEAD", "ADMIN"), validate(createTaskSchema), createTask);
router.patch("/:id", validate(updateTaskSchema), updateTask);
router.patch("/:id/status", validate(updateTaskStatusSchema), updateTaskStatus);
router.patch("/:id/progress", validate(updateTaskProgressSchema), updateTaskProgress);
router.patch("/:id/reassign", roleMiddleware("TEAM_LEAD", "ADMIN"), validate(reassignTaskSchema), reassignTask);
router.delete("/:id", roleMiddleware("TEAM_LEAD", "ADMIN"), validate(taskIdSchema), deleteTask);

export default router;
