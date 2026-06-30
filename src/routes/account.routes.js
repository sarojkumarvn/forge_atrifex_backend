import { Router } from "express";
import {
  changePassword,
  deactivateMe,
  getMe,
  updateMe,
} from "../controllers/account.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { accountPasswordChangeSchema, accountProfileUpdateSchema } from "../validators/account.validator.js";

const router = Router();

router.use(authMiddleware);

router.get("/me", getMe);
router.patch("/me", validate(accountProfileUpdateSchema), updateMe);
router.patch("/password", validate(accountPasswordChangeSchema), changePassword);
router.patch("/deactivate", deactivateMe);

export default router;
