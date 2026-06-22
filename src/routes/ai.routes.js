import { Router } from "express";
import {
  executiveSummary,
  projectAnalysis,
  riskAnalysis,
  taskSuggestions,
  teamAnalysis,
} from "../controllers/ai.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { aiProjectSchema, aiTeamSchema, executiveSummarySchema } from "../validators/ai.validator.js";

const router = Router();

router.use(authMiddleware);

router.post("/project-analysis/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiProjectSchema), projectAnalysis);
router.post("/risk-analysis/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiProjectSchema), riskAnalysis);
router.post("/team-analysis/:teamId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiTeamSchema), teamAnalysis);
router.post("/task-suggestions/:projectId", roleMiddleware("TEAM_LEAD"), validate(aiProjectSchema), taskSuggestions);
router.post("/executive-summary", roleMiddleware("ADMIN"), validate(executiveSummarySchema), executiveSummary);

export default router;
