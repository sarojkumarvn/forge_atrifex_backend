import { Router } from "express";
import {
  acceptRecommendation,
  dailyStandup,
  executiveSummary,
  projectAnalysis,
  projectHealth,
  rejectRecommendation,
  riskAnalysis,
  riskPrediction,
  sprintPlan,
  taskAssignment,
  taskSuggestions,
  teamAnalysis,
  teamCoaching,
  weeklyReport,
} from "../controllers/ai.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { aiInsightSchema, aiProjectSchema, aiTeamSchema, executiveSummarySchema } from "../validators/ai.validator.js";

const router = Router();

router.use(authMiddleware);

router.post("/project-analysis/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiProjectSchema), projectAnalysis);
router.post("/risk-analysis/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiProjectSchema), riskAnalysis);
router.post("/team-analysis/:teamId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiTeamSchema), teamAnalysis);
router.post("/task-suggestions/:projectId", roleMiddleware("TEAM_LEAD"), validate(aiProjectSchema), taskSuggestions);
router.post("/executive-summary", roleMiddleware("ADMIN"), validate(executiveSummarySchema), executiveSummary);
router.post("/project-health/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiProjectSchema), projectHealth);
router.post("/task-assignment/:projectId", roleMiddleware("TEAM_LEAD"), validate(aiProjectSchema), taskAssignment);
router.post("/sprint-plan/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiProjectSchema), sprintPlan);
router.post("/daily-standup/:teamId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiTeamSchema), dailyStandup);
router.post("/weekly-report/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiProjectSchema), weeklyReport);
router.post("/team-coaching/:teamId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiTeamSchema), teamCoaching);
router.post("/risk-prediction/:projectId", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiProjectSchema), riskPrediction);
router.post("/insights/:insightId/accept", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiInsightSchema), acceptRecommendation);
router.post("/insights/:insightId/reject", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(aiInsightSchema), rejectRecommendation);

export default router;
