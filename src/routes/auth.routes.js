import { Router } from "express";
import { acceptInvite, login, logout, me, register } from "../controllers/auth.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { acceptInviteSchema, loginSchema, registerSchema } from "../validators/auth.validator.js";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/accept-invite", validate(acceptInviteSchema), acceptInvite);
router.post("/login", validate(loginSchema), login);
router.get("/me", authMiddleware, me);
router.post("/logout", logout);

export default router;
