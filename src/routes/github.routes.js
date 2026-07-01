import { Router } from "express";
import {
  commitAnalytics,
  commitTimeline,
  connectGithub,
  connectRepository,
  contributorAnalytics,
  disconnectRepository,
  getRepositories,
  getProjectRepository,
  githubCallback,
  githubWebhook,
  issueAnalytics,
  issueInsights,
  pullRequestAnalytics,
  pullRequestInsights,
  repositoryOverview,
  syncRepository,
} from "../controllers/github.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import roleMiddleware from "../middleware/role.middleware.js";
import validate from "../middleware/validate.middleware.js";
import {
  connectRepositorySchema,
  githubCallbackSchema,
  githubCommitTimelineSchema,
  githubProjectSchema,
  githubRepositoryRemovalSchema,
  githubRepositorySyncSchema,
  githubWebhookSchema,
} from "../validators/github.validator.js";

const router = Router();

router.get("/callback", validate(githubCallbackSchema), githubCallback);
router.post("/webhook", validate(githubWebhookSchema), githubWebhook);

router.use(authMiddleware);

router.get("/connect", connectGithub);
router.get("/repositories", getRepositories);
router.post("/connect-repository", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(connectRepositorySchema), connectRepository);
router.get("/project/:projectId/repository", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), validate(githubProjectSchema), getProjectRepository);
router.delete("/project/:projectId/repository", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(githubRepositoryRemovalSchema), disconnectRepository);
router.post("/project/:projectId/sync", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(githubRepositorySyncSchema), syncRepository);
router.get("/project/:projectId/overview", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), validate(githubProjectSchema), repositoryOverview);
router.get("/project/:projectId/commits", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), validate(githubProjectSchema), commitAnalytics);
router.get(
  "/project/:projectId/commit-timeline",
  roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"),
  validate(githubCommitTimelineSchema),
  commitTimeline,
);
router.get(
  "/project/:projectId/pull-requests",
  roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"),
  validate(githubProjectSchema),
  pullRequestAnalytics,
);
router.get(
  "/project/:projectId/pr-insights",
  roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"),
  validate(githubProjectSchema),
  pullRequestInsights,
);
router.get("/project/:projectId/issues", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), validate(githubProjectSchema), issueAnalytics);
router.get("/project/:projectId/issue-insights", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), validate(githubProjectSchema), issueInsights);
router.get(
  "/project/:projectId/contributors",
  roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"),
  validate(githubProjectSchema),
  contributorAnalytics,
);

export default router;
