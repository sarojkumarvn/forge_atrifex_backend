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

const router = Router();

router.use(authMiddleware);

router.post("/project-analysis/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD"), projectAnalysis);
router.post("/risk-analysis/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD"), riskAnalysis);
router.post("/team-analysis/:teamId", roleMiddleware("ADMIN", "TEAM_LEAD"), teamAnalysis);
router.post("/task-suggestions/:projectId", roleMiddleware("TEAM_LEAD"), taskSuggestions);
router.post("/executive-summary", roleMiddleware("ADMIN"), executiveSummary);

export default router;
