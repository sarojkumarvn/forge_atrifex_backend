import { Router } from "express";
import {
  adminContributionAnalytics,
  adminDashboardSummary,
  adminDeliveryHealth,
  memberActivity,
  memberDashboardSummary,
  memberPerformance,
  teamLeadAnalytics,
  teamLeadDashboardSummary,
  teamLeadIssues,
} from "../controllers/dashboard.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/admin", roleMiddleware("ADMIN"), adminDashboardSummary);
router.get("/admin/delivery-health", roleMiddleware("ADMIN"), adminDeliveryHealth);
router.get("/admin/contribution-analytics", roleMiddleware("ADMIN"), adminContributionAnalytics);

router.get("/team-lead", roleMiddleware("TEAM_LEAD"), teamLeadDashboardSummary);
router.get("/team-lead/analytics", roleMiddleware("TEAM_LEAD"), teamLeadAnalytics);
router.get("/team-lead/issues", roleMiddleware("TEAM_LEAD"), teamLeadIssues);

router.get("/member", roleMiddleware("TEAM_MEMBER"), memberDashboardSummary);
router.get("/member/activity", roleMiddleware("TEAM_MEMBER"), memberActivity);
router.get("/member/performance", roleMiddleware("TEAM_MEMBER"), memberPerformance);

export default router;
