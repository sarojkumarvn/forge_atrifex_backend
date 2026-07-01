import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import logger from "../config/logger.js";
import ApiError from "../utils/apiError.js";
import logActivity from "../utils/activityLogger.js";
import { createNotification, createNotifications } from "../utils/notificationSender.js";
import { getRequestLoggerMeta } from "../utils/requestContext.js";
import {
  buildGithubOAuthUrl,
  decryptGithubToken,
  encryptGithubToken,
  exchangeCodeForToken,
  githubPaginatedRequest,
  githubRequest,
} from "../utils/githubClient.js";
import { createSha256HmacSignature, timingSafeEqualString } from "../utils/secretCrypto.js";
import GitHubSyncService from "./githubSync.service.js";
import {
  getCommitAnalytics,
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

export const getGithubTokenForUser = async (userId) => {
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

export const getAccessibleProject = async (user, projectId, { requireRepository = false } = {}) => {
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

const notifyUser = async ({ userId, title, message, client = prisma }) =>
  createNotification({
    recipientId: userId,
    title,
    message,
    client,
  });

const getOrganizationAdmins = async (organizationId, client = prisma) =>
  client.user.findMany({
    where: {
      organizationId,
      role: "ADMIN",
      isActive: true,
    },
    select: {
      id: true,
    },
  });

const verifyGithubWebhookSignature = ({ rawBody, signatureHeader }) => {
  const production = process.env.NODE_ENV === "production";
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    if (production) {
      throw new ApiError(500, "GitHub webhook secret is not configured");
    }

    return { configured: false, verified: false, required: false };
  }

  if (!signatureHeader) {
    throw new ApiError(401, "GitHub webhook signature is required");
  }

  if (!/^sha256=[a-f0-9]{64}$/i.test(signatureHeader)) {
    throw new ApiError(401, "Invalid GitHub webhook signature");
  }

  // Compare HMACs in constant time to avoid leaking signature validity through timing.
  const expected = createSha256HmacSignature({ secret, value: rawBody });
  const verified = timingSafeEqualString(expected, signatureHeader);

  if (!verified) {
    throw new ApiError(401, "Invalid GitHub webhook signature");
  }

  return { configured: true, verified: true, required: true };
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

    await notifyUser({
      userId: user.id,
      title: "Repository connected",
      message: `${repository.full_name} was connected to ${project.title}.`,
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

export const getLinkedProjectRepository = async (user, projectId) => {
  const project = await getAccessibleProject(user, projectId, { requireRepository: true });

  return {
    projectId: project.id,
    repository: `${project.githubRepositoryOwner}/${project.githubRepositoryName}`,
    repositoryUrl: project.repositoryUrl,
    repositoryId: project.githubRepositoryId,
    owner: project.githubRepositoryOwner,
    name: project.githubRepositoryName,
    defaultBranch: project.githubDefaultBranch,
  };
};

export const disconnectRepositoryFromProject = async (user, projectId) => {
  const project = await getAccessibleProject(user, projectId, { requireRepository: true });
  const repository = `${project.githubRepositoryOwner}/${project.githubRepositoryName}`;

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: {
        id: project.id,
      },
      data: {
        repositoryUrl: null,
        githubRepositoryId: null,
        githubRepositoryOwner: null,
        githubRepositoryName: null,
        githubDefaultBranch: null,
      },
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "GITHUB_REPOSITORY_REMOVED",
      entityType: "GITHUB_REPOSITORY",
      entityId: project.id,
      metadata: {
        projectId: project.id,
        repository,
      },
      client: tx,
    });

    await notifyUser({
      userId: user.id,
      title: "Repository disconnected",
      message: `${repository} was disconnected from ${project.title}.`,
      client: tx,
    });
  });

  logger.info(
    {
      ...getRequestLoggerMeta(),
      userId: user.id,
      projectId: project.id,
      repository,
      status: "success",
    },
    "GitHub repository disconnected",
  );

  return {
    projectId: project.id,
    repository,
    disconnected: true,
  };
};

export const syncProjectRepository = async (user, projectId) => {
  const context = await getProjectRepositoryContext(user, projectId);

  await logActivity({
    actorId: user.id,
    organizationId: user.organizationId,
    action: "GITHUB_SYNC_STARTED",
    entityType: "GITHUB_REPOSITORY",
    entityId: context.project.id,
    metadata: {
      projectId: context.project.id,
      repository: `${context.owner}/${context.repo}`,
    },
  });

  try {
    const result = await GitHubSyncService.syncRepository({
      token: context.token,
      project: context.project,
    });

    await prisma.$transaction(async (tx) => {
      await logActivity({
        actorId: user.id,
        organizationId: user.organizationId,
        action: "GITHUB_SYNC_COMPLETED",
        entityType: "GITHUB_REPOSITORY",
        entityId: context.project.id,
        metadata: {
          projectId: context.project.id,
          ...result,
        },
        client: tx,
      });

      await notifyUser({
        userId: user.id,
        title: "Repository sync completed",
        message: `${result.repository} synced successfully.`,
        client: tx,
      });
    });

    return result;
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await logActivity({
        actorId: user.id,
        organizationId: user.organizationId,
        action: "GITHUB_SYNC_FAILED",
        entityType: "GITHUB_REPOSITORY",
        entityId: context.project.id,
        metadata: {
          projectId: context.project.id,
          repository: `${context.owner}/${context.repo}`,
          error: error.message,
        },
        client: tx,
      });

      await notifyUser({
        userId: user.id,
        title: "Repository sync failed",
        message: `${context.owner}/${context.repo} could not be synced.`,
        client: tx,
      });
    });

    throw error;
  }
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
  return GitHubSyncService.getContributorInsights(context);
};

export const getRepositoryCommitTimeline = async (user, projectId, query) => {
  const context = await getProjectRepositoryContext(user, projectId);
  return GitHubSyncService.getCommitTimeline({ ...context, pagination: query });
};

export const getRepositoryPullRequestInsights = async (user, projectId) => {
  const context = await getProjectRepositoryContext(user, projectId);
  return GitHubSyncService.getPullRequestInsights(context);
};

export const getRepositoryIssueInsights = async (user, projectId) => {
  const context = await getProjectRepositoryContext(user, projectId);
  return GitHubSyncService.getIssueInsights(context);
};

export const handleGithubWebhook = async ({ event, deliveryId, signature, rawBody, payload }) => {
  const signatureResult = verifyGithubWebhookSignature({ rawBody, signatureHeader: signature });

  logger.info(
    {
      ...getRequestLoggerMeta(),
      event,
      deliveryId,
      repository: payload.repository?.full_name,
      signatureVerified: signatureResult.verified,
      signatureRequired: signatureResult.required,
    },
    "GitHub webhook received",
  );

  if (!["push", "pull_request", "issues", "repository", "ping"].includes(event)) {
    return {
      accepted: true,
      event,
      deliveryId,
      message: "Event accepted but not routed",
    };
  }

  const repositoryOwner = payload.repository?.owner?.login || payload.repository?.owner?.name;
  const repositoryName = payload.repository?.name;
  const linkedProject =
    repositoryOwner && repositoryName
      ? await prisma.project.findFirst({
          where: {
            githubRepositoryOwner: repositoryOwner,
            githubRepositoryName: repositoryName,
          },
          select: {
            id: true,
            title: true,
            organizationId: true,
            githubRepositoryOwner: true,
            githubRepositoryName: true,
          },
        })
      : null;

  if (linkedProject) {
    await prisma.$transaction(async (tx) => {
      await logActivity({
        actorId: null,
        organizationId: linkedProject.organizationId,
        action: "GITHUB_WEBHOOK_RECEIVED",
        entityType: "GITHUB_REPOSITORY",
        entityId: linkedProject.id,
        metadata: {
          event,
          deliveryId,
          repository: payload.repository?.full_name,
          action: payload.action,
          supported: true,
        },
        client: tx,
      });

      const admins = await getOrganizationAdmins(linkedProject.organizationId, tx);
      await createNotifications({
        notifications: admins.map((admin) => ({
          recipientId: admin.id,
          title: "GitHub webhook received",
          message: `${event} received for ${payload.repository?.full_name || linkedProject.title}.`,
        })),
        client: tx,
      });
    });
  }

  const routing = {
    push: "push webhook accepted",
    pull_request: "pull request webhook accepted",
    issues: "issues webhook accepted",
    repository: "repository webhook accepted",
    ping: "pong",
  };

  return {
    accepted: true,
    event,
    deliveryId,
    message: routing[event],
    projectId: linkedProject?.id || null,
  };
};
