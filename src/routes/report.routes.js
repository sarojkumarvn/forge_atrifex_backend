import { Router } from "express";
import {
  deliveryReport,
  executiveSummary,
  memberReport,
  projectReport,
  teamReport,
} from "../controllers/report.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/project/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), projectReport);
router.get("/team/:teamId", roleMiddleware("ADMIN", "TEAM_LEAD"), teamReport);
router.get("/member/:memberId", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), memberReport);
router.get("/delivery", roleMiddleware("ADMIN"), deliveryReport);
router.get("/executive-summary", roleMiddleware("ADMIN"), executiveSummary);

export default router;
