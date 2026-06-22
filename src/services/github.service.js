import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import logger from "../config/logger.js";
import ApiError from "../utils/apiError.js";
import logActivity from "../utils/activityLogger.js";
import { getRequestLoggerMeta } from "../utils/requestContext.js";
import {
  buildGithubOAuthUrl,
  decryptGithubToken,
  encryptGithubToken,
  exchangeCodeForToken,
  githubPaginatedRequest,
  githubRequest,
} from "../utils/githubClient.js";
import {
  getCommitAnalytics,
  getContributorAnalytics,
  getIssueAnalytics,
  getPullRequestAnalytics,
  getRepositoryOverviewAnalytics,
} from "./githubAnalytics.service.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validateUuid = (id, fieldName) => {
  if (!uuidRegex.test(id)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }
};

const assertJwtConfig = () => {
  if (!process.env.JWT_SECRET) {
    throw new ApiError(500, "JWT_SECRET is not configured");
  }
};

const buildProjectAccessWhere = (user) => ({
  organizationId: user.organizationId,
  ...(user.role === "TEAM_LEAD"
    ? {
        assignedTeam: {
          leadId: user.id,
        },
      }
    : {}),
  ...(user.role === "TEAM_MEMBER"
    ? {
        assignedTeam: {
          memberships: {
            some: {
              userId: user.id,
            },
          },
        },
      }
    : {}),
});

const getGithubTokenForUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      githubAccessToken: true,
    },
  });

  if (!user?.githubAccessToken) {
    throw new ApiError(401, "Connect GitHub before using GitHub APIs");
  }

  return decryptGithubToken(user.githubAccessToken);
};

const getAccessibleProject = async (user, projectId, { requireRepository = false } = {}) => {
  validateUuid(projectId, "projectId");

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...buildProjectAccessWhere(user),
    },
    select: {
      id: true,
      title: true,
      organizationId: true,
      repositoryUrl: true,
      githubRepositoryId: true,
      githubRepositoryOwner: true,
      githubRepositoryName: true,
      githubDefaultBranch: true,
    },
  });

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  if (requireRepository && (!project.githubRepositoryOwner || !project.githubRepositoryName)) {
    throw new ApiError(400, "Project is not connected to a GitHub repository");
  }

  return project;
};

const normalizeRepositoryInput = ({ repositoryOwner, repositoryName }) => {
  const owner = repositoryOwner?.trim();
  const name = repositoryName?.trim();

  if (!owner || !name) {
    throw new ApiError(400, "repositoryOwner and repositoryName are required");
  }

  return {
    owner,
    name,
  };
};

const getProjectRepositoryContext = async (user, projectId) => {
  const [project, token] = await Promise.all([
    getAccessibleProject(user, projectId, { requireRepository: true }),
    getGithubTokenForUser(user.id),
  ]);

  return {
    token,
    owner: project.githubRepositoryOwner,
    repo: project.githubRepositoryName,
    project,
  };
};

export const getGithubConnectUrl = (user) => {
  assertJwtConfig();

  const state = jwt.sign(
    {
      userId: user.id,
      organizationId: user.organizationId,
      purpose: "github_oauth",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "10m",
    },
  );

  return {
    redirectUrl: buildGithubOAuthUrl(state),
  };
};

export const handleGithubOAuthCallback = async ({ code, state }) => {
  const start = performance.now();

  if (!code || !state) {
    throw new ApiError(400, "GitHub OAuth code and state are required");
  }

  assertJwtConfig();

  let decodedState;

  try {
    decodedState = jwt.verify(state, process.env.JWT_SECRET);
  } catch {
    logger.warn({ ...getRequestLoggerMeta(), status: "failed" }, "GitHub OAuth callback failure");
    throw new ApiError(400, "Invalid GitHub OAuth state");
  }

  if (decodedState.purpose !== "github_oauth") {
    logger.warn({ ...getRequestLoggerMeta(), status: "failed" }, "GitHub OAuth callback failure");
    throw new ApiError(400, "Invalid GitHub OAuth state");
  }

  // OAuth callback exchanges the temporary code for a user-scoped GitHub token.
  const tokenPayload = await exchangeCodeForToken(code);
  const githubProfile = await githubRequest({
    token: tokenPayload.accessToken,
    path: "/user",
  });
  const existingGithubUser = await prisma.user.findFirst({
    where: {
      githubUsername: githubProfile.data.login,
      NOT: {
        id: decodedState.userId,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingGithubUser) {
    throw new ApiError(409, "GitHub account is already connected to another user");
  }

  const updatedUser = await prisma.user.update({
    where: {
      id: decodedState.userId,
    },
    data: {
      githubUsername: githubProfile.data.login,
      githubAccessToken: encryptGithubToken(tokenPayload.accessToken),
      githubTokenScope: tokenPayload.scope,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      githubUsername: true,
    },
  });

  logger.info(
    {
      ...getRequestLoggerMeta(),
      userId: updatedUser.id,
      status: "success",
      durationMs: Math.round(performance.now() - start),
    },
    "GitHub OAuth callback success",
  );

  return {
    user: updatedUser,
    githubProfile: {
      id: String(githubProfile.data.id),
      username: githubProfile.data.login,
      name: githubProfile.data.name,
      avatarUrl: githubProfile.data.avatar_url,
    },
  };
};

export const getGithubRepositories = async (user) => {
  const token = await getGithubTokenForUser(user.id);
  const repositories = await githubPaginatedRequest({
    token,
    path: "/user/repos",
    query: {
      affiliation: "owner,collaborator,organization_member",
      sort: "updated",
      direction: "desc",
    },
    maxPages: 5,
  });

  return repositories.map((repository) => ({
    id: String(repository.id),
    name: repository.name,
    owner: repository.owner?.login,
    private: repository.private,
  }));
};

export const connectRepositoryToProject = async (user, payload) => {
  const { projectId } = payload;
  validateUuid(projectId, "projectId");

  const { owner, name } = normalizeRepositoryInput(payload);
  logger.info(
    {
      ...getRequestLoggerMeta(),
      userId: user.id,
      projectId,
      repository: `${owner}/${name}`,
      status: "started",
    },
    "GitHub repository sync request",
  );

  const [project, token] = await Promise.all([getAccessibleProject(user, projectId), getGithubTokenForUser(user.id)]);
  const repositoryResponse = await githubRequest({
    token,
    path: `/repos/${owner}/${name}`,
  });
  const repository = repositoryResponse.data;

  if (String(repository.owner?.login).toLowerCase() !== owner.toLowerCase()) {
    logger.warn(
      {
        ...getRequestLoggerMeta(),
        userId: user.id,
        projectId,
        repository: `${owner}/${name}`,
        status: "failed",
      },
      "GitHub repository sync request failed",
    );
    throw new ApiError(400, "Repository owner does not match GitHub response");
  }

  const updatedProject = await prisma.$transaction(async (tx) => {
    // Ensure users can only connect repositories they have access to through their GitHub OAuth token.
    const connectedProject = await tx.project.update({
      where: {
        id: project.id,
      },
      data: {
        repositoryUrl: repository.html_url,
        githubRepositoryId: String(repository.id),
        githubRepositoryOwner: repository.owner.login,
        githubRepositoryName: repository.name,
        githubDefaultBranch: repository.default_branch,
      },
      select: {
        id: true,
        title: true,
        repositoryUrl: true,
        githubRepositoryId: true,
        githubRepositoryOwner: true,
        githubRepositoryName: true,
        githubDefaultBranch: true,
      },
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "GITHUB_REPOSITORY_CONNECTED",
      entityType: "GITHUB_REPOSITORY",
      entityId: project.id,
      metadata: {
        projectId: project.id,
        repositoryId: String(repository.id),
        repository: repository.full_name,
      },
      client: tx,
    });

    return connectedProject;
  });

  const result = {
    projectId: updatedProject.id,
    repository: `${updatedProject.githubRepositoryOwner}/${updatedProject.githubRepositoryName}`,
    repositoryUrl: updatedProject.repositoryUrl,
    defaultBranch: updatedProject.githubDefaultBranch,
  };

  logger.info(
    {
      ...getRequestLoggerMeta(),
      userId: user.id,
      projectId: result.projectId,
      repository: result.repository,
      status: "success",
    },
    "GitHub repository sync request completed",
  );

  return result;
};

export const getRepositoryOverview = async (user, projectId) => {
  const context = await getProjectRepositoryContext(user, projectId);
  return getRepositoryOverviewAnalytics(context);
};

export const getRepositoryCommits = async (user, projectId) => {
  const context = await getProjectRepositoryContext(user, projectId);
  return getCommitAnalytics(context);
};

export const getRepositoryPullRequests = async (user, projectId) => {
  const context = await getProjectRepositoryContext(user, projectId);
  return getPullRequestAnalytics(context);
};

export const getRepositoryIssues = async (user, projectId) => {
  const context = await getProjectRepositoryContext(user, projectId);
  return getIssueAnalytics(context);
};

export const getRepositoryContributors = async (user, projectId) => {
  const context = await getProjectRepositoryContext(user, projectId);
  return getContributorAnalytics(context);
};
