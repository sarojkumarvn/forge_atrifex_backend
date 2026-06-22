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
import validate from "../middleware/validate.middleware.js";
import {
  connectRepositorySchema,
  githubCallbackSchema,
  githubProjectSchema,
} from "../validators/github.validator.js";

const router = Router();

router.get("/callback", validate(githubCallbackSchema), githubCallback);

router.use(authMiddleware);

router.get("/connect", connectGithub);
router.get("/repositories", getRepositories);
router.post("/connect-repository", roleMiddleware("ADMIN", "TEAM_LEAD"), validate(connectRepositorySchema), connectRepository);
router.get("/project/:projectId/overview", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), validate(githubProjectSchema), repositoryOverview);
router.get("/project/:projectId/commits", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), validate(githubProjectSchema), commitAnalytics);
router.get(
  "/project/:projectId/pull-requests",
  roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"),
  validate(githubProjectSchema),
  pullRequestAnalytics,
);
router.get("/project/:projectId/issues", roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"), validate(githubProjectSchema), issueAnalytics);
router.get(
  "/project/:projectId/contributors",
  roleMiddleware("ADMIN", "TEAM_LEAD", "TEAM_MEMBER"),
  validate(githubProjectSchema),
  contributorAnalytics,
);

export default router;
