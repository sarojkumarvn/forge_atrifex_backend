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
import validate from "../middleware/validate.middleware.js";
import {
  memberReportSchema,
  projectReportSchema,
  reportFiltersSchema,
  teamReportSchema,
} from "../validators/report.validator.js";

const router = Router();

router.use(authMiddleware);

router.get("/project/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), validate(projectReportSchema), projectReport);
router.get("/team/:teamId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(teamReportSchema), teamReport);
router.get("/member/:memberId", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), validate(memberReportSchema), memberReport);
router.get("/delivery", roleMiddleware("ADMIN"), validate(reportFiltersSchema), deliveryReport);
router.get("/executive-summary", roleMiddleware("ADMIN"), validate(reportFiltersSchema), executiveSummary);

export default router;
