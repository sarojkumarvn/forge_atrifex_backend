import { Router } from "express";
import { updateUserRole } from "../controllers/user.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { idParamSchema, userRoleSchema } from "../validators/common.validator.js";
import { z } from "zod";

const router = Router();

router.use(authMiddleware);

router.patch(
  "/:id/role",
  roleMiddleware("ADMIN"),
  validate({
    params: idParamSchema,
    body: z.object({ role: userRoleSchema }),
  }),
  updateUserRole,
);

export default router;
