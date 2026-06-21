import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  connectRepositoryToProject,
  getGithubConnectUrl,
  getGithubRepositories,
  getRepositoryCommits,
  getRepositoryContributors,
  getRepositoryIssues,
  getRepositoryOverview,
  getRepositoryPullRequests,
  handleGithubOAuthCallback,
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
