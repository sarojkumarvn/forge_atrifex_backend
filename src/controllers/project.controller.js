import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import logActivity from "../utils/activityLogger.js";
import { createNotification } from "../utils/notificationSender.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const projectStatuses = new Set(["PLANNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]);
const statusAliases = {
  PLANNING: "PLANNED",
  ACTIVE: "IN_PROGRESS",
};
const activeTaskStatuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"];

const userSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  githubUsername: true,
  avatar: true,
  phone: true,
  location: true,
  isActive: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
};

const teamSelect = {
  id: true,
  name: true,
  description: true,
  leadId: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
  lead: {
    select: userSelect,
  },
};

const projectListInclude = {
  assignedTeam: {
    select: teamSelect,
  },
};

const projectDetailInclude = {
  organization: {
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
    },
  },
  assignedTeam: {
    select: teamSelect,
  },
  createdBy: {
    select: userSelect,
  },
  _count: {
    select: {
      tasks: true,
    },
  },
};

const statusTransitions = {
  PLANNED: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const isValidUuid = (id) => typeof id === "string" && uuidRegex.test(id);

const parsePagination = (pageQuery, limitQuery) => {
  const page = Math.max(Number.parseInt(pageQuery, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(limitQuery, 10) || 10, 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const normalizeStatus = (status) => {
  if (status === undefined || status === null || status === "") {
    return null;
  }

  const normalized = String(status).trim().toUpperCase();
  const schemaStatus = statusAliases[normalized] || normalized;

  if (!projectStatuses.has(schemaStatus)) {
    throw new ApiError(400, "Invalid project status");
  }

  return schemaStatus;
};

const parseDeadline = (deadline, fieldName = "deadline") => {
  if (deadline === undefined) {
    return undefined;
  }

  if (!deadline) {
    throw new ApiError(400, `${fieldName} is required`);
  }

  const parsedDate = new Date(deadline);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, `${fieldName} must be a valid date`);
  }

  return parsedDate;
};

const validateRepositoryUrl = (repositoryUrl) => {
  if (repositoryUrl === undefined || repositoryUrl === null || repositoryUrl === "") {
    return null;
  }

  try {
    const url = new URL(repositoryUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Unsupported protocol");
    }

    return url.toString();
  } catch {
    // Repository URLs are optional, but supplied values must be safe HTTP(S) URLs.
    throw new ApiError(400, "repositoryUrl must be a valid HTTP or HTTPS URL");
  }
};

const buildProjectAccessWhere = (user) => {
  const where = {
    // Every project query is scoped to the authenticated user's organization.
    organizationId: user.organizationId,
  };

  if (user.role === "TEAM_LEAD") {
    // Team leads can only view projects assigned to teams they lead.
    where.assignedTeam = {
      leadId: user.id,
    };
  }

  if (user.role === "TEAM_MEMBER") {
    // Team members can only view projects assigned to teams where they have membership.
    where.assignedTeam = {
      memberships: {
        some: {
          userId: user.id,
        },
      },
    };
  }

  return where;
};

const buildSearchWhere = (search) => {
  const trimmedSearch = search?.trim();

  if (!trimmedSearch) {
    return {};
  }

  return {
    OR: [
      {
        title: {
          contains: trimmedSearch,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: trimmedSearch,
          mode: "insensitive",
        },
      },
      {
        repositoryUrl: {
          contains: trimmedSearch,
          mode: "insensitive",
        },
      },
    ],
  };
};

const validateTeamForOrganization = async (teamId, organizationId) => {
  if (teamId === undefined || teamId === null || teamId === "") {
    return null;
  }

  if (!isValidUuid(teamId)) {
    throw new ApiError(400, "Invalid teamId");
  }

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      // Ensure admins cannot assign projects to teams outside their organization.
      organizationId,
    },
    select: teamSelect,
  });

  if (!team) {
    // Verify the selected team exists before creating or assigning a project.
    throw new ApiError(404, "Team not found");
  }

  return team;
};

const validateTeamAccess = async (teamId, user) => {
  if (!isValidUuid(teamId)) {
    throw new ApiError(400, "Invalid teamId");
  }

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      organizationId: user.organizationId,
      ...(user.role === "TEAM_LEAD" ? { leadId: user.id } : {}),
      ...(user.role === "TEAM_MEMBER"
        ? {
            memberships: {
              some: {
                userId: user.id,
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  });

  if (!team) {
    // Team project lists require both organization ownership and role-specific team access.
    throw new ApiError(404, "Team not found");
  }
};

const ensureUniqueProjectTitle = async ({ title, organizationId, excludeProjectId = null }) => {
  const existingProject = await prisma.project.findFirst({
    where: {
      // Prevent accidental duplicate project creation with the same title in one organization.
      organizationId,
      title,
      ...(excludeProjectId ? { NOT: { id: excludeProjectId } } : {}),
    },
  });

  if (existingProject) {
    throw new ApiError(409, "Project title already exists in this organization");
  }
};

const findOrganizationScopedProject = async (
  projectId,
  organizationId,
  queryOptions = { include: projectDetailInclude },
) => {
  if (!isValidUuid(projectId)) {
    // Validate IDs before Prisma queries so malformed IDs return a clear client error.
    throw new ApiError(400, "Invalid project id");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      // Project mutations always require organization ownership.
      organizationId,
    },
    ...queryOptions,
  });

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  return project;
};

const validateStatusTransition = (currentStatus, nextStatus) => {
  if (!nextStatus || nextStatus === currentStatus) {
    return;
  }

  const allowedNextStatuses = statusTransitions[currentStatus] || [];

  if (!allowedNextStatuses.includes(nextStatus)) {
    // Status transitions are constrained to avoid reopening completed or cancelled projects accidentally.
    throw new ApiError(400, `Cannot change project status from ${currentStatus} to ${nextStatus}`);
  }
};

const formatProject = (project) => ({
  id: project.id,
  title: project.title,
  description: project.description,
  repositoryUrl: project.repositoryUrl,
  deadline: project.deadline,
  status: project.status,
  progress: project.progress,
  healthScore: project.healthScore,
  assignedTeam: project.assignedTeam,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

const formatProjectDetail = (project) => ({
  ...formatProject(project),
  organization: project.organization,
  createdBy: project.createdBy,
  tasksCount: project._count.tasks,
});

export const getProjects = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);
  const where = {
    ...buildProjectAccessWhere(req.user),
    ...buildSearchWhere(req.query.search),
  };

  const status = normalizeStatus(req.query.status);

  if (status) {
    where.status = status;
  }

  if (req.query.teamId) {
    if (!isValidUuid(req.query.teamId)) {
      throw new ApiError(400, "Invalid teamId");
    }

    // The teamId filter is still combined with role access rules to avoid cross-team leaks.
    where.assignedTeamId = req.query.teamId;
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: projectListInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

  return sendSuccess(
    res,
    200,
    "Projects fetched successfully",
    projects.map(formatProject),
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  );
});

export const getProjectById = asyncHandler(async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    throw new ApiError(400, "Invalid project id");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: req.params.id,
      ...buildProjectAccessWhere(req.user),
    },
    include: projectDetailInclude,
  });

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  return sendSuccess(res, 200, "Project fetched successfully", formatProjectDetail(project));
});

export const createProject = asyncHandler(async (req, res) => {
  const { title, description, repositoryUrl, deadline, teamId } = req.body;
  const trimmedTitle = title?.trim();
  const trimmedDescription = description?.trim();
  const parsedDeadline = parseDeadline(deadline);
  const normalizedRepositoryUrl = validateRepositoryUrl(repositoryUrl);

  if (!trimmedTitle) {
    throw new ApiError(400, "title is required");
  }

  if (!trimmedDescription) {
    throw new ApiError(400, "description is required");
  }

  await ensureUniqueProjectTitle({
    title: trimmedTitle,
    organizationId: req.user.organizationId,
  });
  const team = await validateTeamForOrganization(teamId, req.user.organizationId);

  const project = await prisma.$transaction(async (tx) => {
    const createdProject = await tx.project.create({
      data: {
        title: trimmedTitle,
        description: trimmedDescription,
        repositoryUrl: normalizedRepositoryUrl,
        deadline: parsedDeadline,
        status: "PLANNED",
        progress: 0,
        healthScore: 100,
        organizationId: req.user.organizationId,
        assignedTeamId: team?.id || null,
        createdById: req.user.id,
      },
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "PROJECT_CREATED",
      entityType: "PROJECT",
      entityId: createdProject.id,
      metadata: {
        projectId: createdProject.id,
        teamId: team?.id || null,
      },
      client: tx,
    });

    if (team) {
      await logActivity({
        actorId: req.user.id,
        organizationId: req.user.organizationId,
        action: "PROJECT_ASSIGNED",
        entityType: "PROJECT",
        entityId: createdProject.id,
        metadata: {
          projectId: createdProject.id,
          teamId: team.id,
          assignedDuringCreate: true,
        },
        client: tx,
      });

      // Project quick-create with a team should notify the team lead immediately.
      await createNotification({
        title: "Your team has been assigned a new project",
        message: `${team.name} has been assigned to ${createdProject.title}.`,
        recipientId: team.leadId,
        client: tx,
      });
    }

    return createdProject;
  });

  return sendSuccess(
    res,
    201,
    "Project created successfully",
    formatProjectDetail(await findOrganizationScopedProject(project.id, req.user.organizationId)),
  );
});

export const updateProject = asyncHandler(async (req, res) => {
  const project = await findOrganizationScopedProject(req.params.id, req.user.organizationId, {
    select: {
      id: true,
      title: true,
      status: true,
      organizationId: true,
    },
  });
  const { title, description, repositoryUrl, deadline, status, progress, healthScore } = req.body;
  const data = {};
  const metadata = {};

  if (title !== undefined) {
    const trimmedTitle = title?.trim();

    if (!trimmedTitle) {
      throw new ApiError(400, "title cannot be empty");
    }

    await ensureUniqueProjectTitle({
      title: trimmedTitle,
      organizationId: req.user.organizationId,
      excludeProjectId: project.id,
    });
    data.title = trimmedTitle;
  }

  if (description !== undefined) {
    const trimmedDescription = description?.trim();

    if (!trimmedDescription) {
      throw new ApiError(400, "description cannot be empty");
    }

    data.description = trimmedDescription;
  }

  if (repositoryUrl !== undefined) {
    data.repositoryUrl = validateRepositoryUrl(repositoryUrl);
  }

  if (deadline !== undefined) {
    data.deadline = parseDeadline(deadline);
  }

  if (status !== undefined) {
    const nextStatus = normalizeStatus(status);
    validateStatusTransition(project.status, nextStatus);
    data.status = nextStatus;
    metadata.oldStatus = project.status;
    metadata.newStatus = nextStatus;
  }

  if (progress !== undefined) {
    const normalizedProgress = Number(progress);

    if (!Number.isInteger(normalizedProgress) || normalizedProgress < 0 || normalizedProgress > 100) {
      throw new ApiError(400, "progress must be an integer between 0 and 100");
    }

    data.progress = normalizedProgress;
  }

  if (healthScore !== undefined) {
    const normalizedHealthScore = Number(healthScore);

    if (!Number.isInteger(normalizedHealthScore) || normalizedHealthScore < 0 || normalizedHealthScore > 100) {
      throw new ApiError(400, "healthScore must be an integer between 0 and 100");
    }

    data.healthScore = normalizedHealthScore;
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const updatedProject = await prisma.$transaction(async (tx) => {
    const savedProject = await tx.project.update({
      where: {
        id: project.id,
      },
      data,
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "PROJECT_UPDATED",
      entityType: "PROJECT",
      entityId: savedProject.id,
      metadata: {
        projectId: savedProject.id,
        updatedFields: Object.keys(data),
        ...metadata,
      },
      client: tx,
    });

    return savedProject;
  });

  return sendSuccess(
    res,
    200,
    "Project updated successfully",
    formatProjectDetail(await findOrganizationScopedProject(updatedProject.id, req.user.organizationId)),
  );
});

export const deleteProject = asyncHandler(async (req, res) => {
  const project = await findOrganizationScopedProject(req.params.id, req.user.organizationId, {
    select: {
      id: true,
      title: true,
      status: true,
      organizationId: true,
    },
  });

  if (project.status === "IN_PROGRESS") {
    // Active projects cannot be deleted while they are still in delivery.
    throw new ApiError(400, "Active projects cannot be deleted");
  }

  const activeTasksCount = await prisma.task.count({
    where: {
      projectId: project.id,
      status: {
        in: activeTaskStatuses,
      },
    },
  });

  if (activeTasksCount > 0) {
    // Projects with active tasks must be preserved to avoid orphaning in-flight work.
    throw new ApiError(400, "Project cannot be deleted while active tasks exist");
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.delete({
      where: {
        id: project.id,
      },
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "PROJECT_DELETED",
      entityType: "PROJECT",
      entityId: project.id,
      metadata: {
        projectId: project.id,
        title: project.title,
      },
      client: tx,
    });
  });

  return sendSuccess(res, 200, "Project deleted successfully");
});

export const assignTeamToProject = asyncHandler(async (req, res) => {
  const { teamId, deadline } = req.body;

  if (!teamId) {
    throw new ApiError(400, "teamId is required");
  }

  const [project, team] = await Promise.all([
    findOrganizationScopedProject(req.params.id, req.user.organizationId, {
      select: {
        id: true,
        title: true,
        assignedTeamId: true,
        organizationId: true,
      },
    }),
    validateTeamForOrganization(teamId, req.user.organizationId),
  ]);
  const parsedDeadline = deadline !== undefined ? parseDeadline(deadline) : undefined;

  const updatedProject = await prisma.$transaction(async (tx) => {
    const savedProject = await tx.project.update({
      where: {
        id: project.id,
      },
      data: {
        assignedTeamId: team.id,
        ...(parsedDeadline ? { deadline: parsedDeadline } : {}),
      },
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "PROJECT_ASSIGNED",
      entityType: "PROJECT",
      entityId: savedProject.id,
      metadata: {
        projectId: savedProject.id,
        oldTeamId: project.assignedTeamId,
        teamId: team.id,
        deadlineUpdated: parsedDeadline !== undefined,
        notifyTeamLead: "pending",
      },
      client: tx,
    });

    // Notify the team lead when ownership of a project is assigned to their team.
    await createNotification({
      title: "Your team has been assigned a new project",
      message: `${team.name} has been assigned to ${project.title}.`,
      recipientId: team.leadId,
      client: tx,
    });

    return savedProject;
  });

  return sendSuccess(
    res,
    200,
    "Project assigned successfully",
    formatProjectDetail(await findOrganizationScopedProject(updatedProject.id, req.user.organizationId)),
  );
});

export const getProjectsForTeam = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);

  await validateTeamAccess(req.params.teamId, req.user);

  const where = {
    ...buildProjectAccessWhere(req.user),
    assignedTeamId: req.params.teamId,
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: projectListInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

  return sendSuccess(
    res,
    200,
    "Team projects fetched successfully",
    projects.map(formatProject),
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  );
});
