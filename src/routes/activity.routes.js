import { Router } from "express";
import {
  getActivityById,
  getActivityFeed,
  getProjectActivity,
  getTeamActivity,
} from "../controllers/activity.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import {
  idParamSchema,
  optionalDateSchema,
  paginationQuerySchema,
  projectIdParamSchema,
  teamIdParamSchema,
  uuidSchema,
} from "../validators/common.validator.js";
import { z } from "zod";

const router = Router();

router.use(authMiddleware);

const activityQuerySchema = paginationQuerySchema.extend({
  entityType: z
    .enum([
      "ORGANIZATION",
      "USER",
      "TEAM",
      "TEAM_MEMBERSHIP",
      "PROJECT",
      "TASK",
      "NOTIFICATION",
      "REPORT",
      "GITHUB_REPOSITORY",
      "AI_INSIGHT",
    ])
    .optional(),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
  dateFrom: optionalDateSchema,
  dateTo: optionalDateSchema,
  userId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  teamId: uuidSchema.optional(),
});

router.get("/", validate({ query: activityQuerySchema }), getActivityFeed);
router.get("/team/:teamId", validate({ params: teamIdParamSchema, query: paginationQuerySchema }), getTeamActivity);
router.get(
  "/project/:projectId",
  validate({ params: projectIdParamSchema, query: paginationQuerySchema }),
  getProjectActivity,
);
router.get("/:id", validate({ params: idParamSchema }), getActivityById);

export default router;
