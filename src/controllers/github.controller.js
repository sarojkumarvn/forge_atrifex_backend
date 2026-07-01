import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  connectRepositoryToProject,
  disconnectRepositoryFromProject,
  getGithubConnectUrl,
  getGithubRepositories,
  getRepositoryCommits,
  getRepositoryCommitTimeline,
  getRepositoryContributors,
  getRepositoryIssueInsights,
  getRepositoryIssues,
  getRepositoryPullRequestInsights,
  getRepositoryOverview,
  getRepositoryPullRequests,
  getLinkedProjectRepository,
  handleGithubOAuthCallback,
  handleGithubWebhook,
  syncProjectRepository,
} from "../services/github.service.js";

export const connectGithub = asyncHandler(async (req, res) => {
  const { redirectUrl } = getGithubConnectUrl(req.user);

  return res.redirect(redirectUrl);
});

export const githubCallback = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub account connected successfully",
    await handleGithubOAuthCallback({
      code: req.query.code,
      state: req.query.state,
    }),
  );
});

export const getRepositories = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "GitHub repositories fetched successfully", await getGithubRepositories(req.user));
});

export const connectRepository = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub repository connected successfully",
    await connectRepositoryToProject(req.user, req.body),
  );
});

export const getProjectRepository = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub repository fetched successfully",
    await getLinkedProjectRepository(req.user, req.params.projectId),
  );
});

export const disconnectRepository = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub repository disconnected successfully",
    await disconnectRepositoryFromProject(req.user, req.params.projectId),
  );
});

export const syncRepository = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub repository synced successfully",
    await syncProjectRepository(req.user, req.params.projectId),
  );
});

export const repositoryOverview = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub repository overview fetched successfully",
    await getRepositoryOverview(req.user, req.params.projectId),
  );
});

export const commitAnalytics = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub commit analytics fetched successfully",
    await getRepositoryCommits(req.user, req.params.projectId),
  );
});

export const pullRequestAnalytics = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub pull request analytics fetched successfully",
    await getRepositoryPullRequests(req.user, req.params.projectId),
  );
});

export const issueAnalytics = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub issue analytics fetched successfully",
    await getRepositoryIssues(req.user, req.params.projectId),
  );
});

export const contributorAnalytics = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub contributor analytics fetched successfully",
    await getRepositoryContributors(req.user, req.params.projectId),
  );
});

export const commitTimeline = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub commit timeline fetched successfully",
    await getRepositoryCommitTimeline(req.user, req.params.projectId, req.query),
  );
});

export const pullRequestInsights = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub pull request insights fetched successfully",
    await getRepositoryPullRequestInsights(req.user, req.params.projectId),
  );
});

export const issueInsights = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub issue insights fetched successfully",
    await getRepositoryIssueInsights(req.user, req.params.projectId),
  );
});

export const githubWebhook = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    200,
    "GitHub webhook accepted",
    await handleGithubWebhook({
      event: req.headers["x-github-event"],
      deliveryId: req.headers["x-github-delivery"],
      signature: req.headers["x-hub-signature-256"],
      rawBody: req.rawBody,
      payload: req.body,
    }),
  );
});
