import { Router } from "express";
import { updateUserRole } from "../controllers/user.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";

const router = Router();

router.use(authMiddleware);

router.patch("/:id/role", roleMiddleware("ADMIN"), updateUserRole);

export default router;
