import { Router } from "express";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notification.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { idParamSchema, paginationQuerySchema, searchQuerySchema } from "../validators/common.validator.js";
import { z } from "zod";

const router = Router();

router.use(authMiddleware);

const notificationQuerySchema = paginationQuerySchema.merge(searchQuerySchema).extend({
  read: z.enum(["true", "false"]).optional(),
});

router.get("/", validate({ query: notificationQuerySchema }), getNotifications);
router.get("/unread-count", getUnreadNotificationCount);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", validate({ params: idParamSchema }), markNotificationRead);

export default router;
