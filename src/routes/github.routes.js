import { Router } from "express";
import {
  commitAnalytics,
  connectGithub,
  connectRepository,
  contributorAnalytics,
  getRepositories,
  githubCallback,
  issueAnalytics,
  pullRequestAnalytics,
  repositoryOverview,
} from "../controllers/github.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";

const router = Router();

router.get("/callback", githubCallback);

router.use(authMiddleware);

router.get("/connect", connectGithub);
router.get("/repositories", getRepositories);
router.post("/connect-repository", roleMiddleware("ADMIN", "TEAM_LEAD"), connectRepository);
router.get("/project/:projectId/overview", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), repositoryOverview);
router.get("/project/:projectId/commits", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), commitAnalytics);
router.get(
  "/project/:projectId/pull-requests",
  roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"),
  pullRequestAnalytics,
);
router.get("/project/:projectId/issues", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), issueAnalytics);
router.get(
  "/project/:projectId/contributors",
  roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"),
  contributorAnalytics,
);

export default router;
