import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const entityTypes = new Set([
  "ORGANIZATION",
  "USER",
  "TEAM",
  "TEAM_MEMBERSHIP",
  "PROJECT",
  "TASK",
  "NOTIFICATION",
  "REPORT",
  "GITHUB_REPOSITORY",
  "AI_INSIGHT",
]);

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

const activityInclude = {
  actor: {
    select: userSelect,
  },
  organization: {
    select: {
      id: true,
      name: true,
    },
  },
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

const parseDate = (value, fieldName) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${fieldName} must be a valid date`);
  }

  return date;
};

const normalizeEntityType = (entityType) => {
  if (!entityType) {
    return null;
  }

  const normalized = String(entityType).trim().toUpperCase();

  if (!entityTypes.has(normalized)) {
    throw new ApiError(400, "Invalid entityType");
  }

  return normalized;
};

const getUserActivityScope = async (user) => {
  if (user.role === "ADMIN") {
    return {
      teamIds: [],
      projectIds: [],
      taskIds: [],
    };
  }

  if (user.role === "TEAM_LEAD") {
    const teams = await prisma.team.findMany({
      where: {
        // Team leads only receive activity visibility for teams they lead.
        organizationId: user.organizationId,
        leadId: user.id,
      },
      select: {
        id: true,
      },
    });
    const teamIds = teams.map((team) => team.id);
    const projects = await prisma.project.findMany({
      where: {
        organizationId: user.organizationId,
        assignedTeamId: {
          in: teamIds,
        },
      },
      select: {
        id: true,
      },
    });
    const projectIds = projects.map((project) => project.id);
    const tasks = await prisma.task.findMany({
      where: {
        projectId: {
          in: projectIds,
        },
      },
      select: {
        id: true,
      },
    });

    return {
      teamIds,
      projectIds,
      taskIds: tasks.map((task) => task.id),
    };
  }

  const memberships = await prisma.teamMembership.findMany({
    where: {
      // Team members receive activity visibility through teams they belong to.
      userId: user.id,
      team: {
        organizationId: user.organizationId,
      },
    },
    select: {
      teamId: true,
    },
  });
  const teamIds = memberships.map((membership) => membership.teamId);
  const projects = await prisma.project.findMany({
    where: {
      organizationId: user.organizationId,
      assignedTeamId: {
        in: teamIds,
      },
    },
    select: {
      id: true,
    },
  });
  const projectIds = projects.map((project) => project.id);
  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: user.id,
      projectId: {
        in: projectIds,
      },
    },
    select: {
      id: true,
    },
  });

  return {
    teamIds,
    projectIds,
    taskIds: tasks.map((task) => task.id),
  };
};

const buildVisibleActivityWhere = async (user) => {
  const baseWhere = {
    // Restrict activity feed to the user's organization.
    organizationId: user.organizationId,
  };

  if (user.role === "ADMIN") {
    return baseWhere;
  }

  const scope = await getUserActivityScope(user);
  const visibleEntityRules = [
    {
      actorId: user.id,
    },
  ];

  if (scope.teamIds.length) {
    visibleEntityRules.push({
      entityType: "TEAM",
      entityId: {
        in: scope.teamIds,
      },
    });
  }

  if (scope.projectIds.length) {
    visibleEntityRules.push({
      entityType: "PROJECT",
      entityId: {
        in: scope.projectIds,
      },
    });
  }

  if (scope.taskIds.length) {
    visibleEntityRules.push({
      entityType: "TASK",
      entityId: {
        in: scope.taskIds,
      },
    });
  }

  return {
    ...baseWhere,
    // Activity visibility is limited to personal actions plus entities the role can access.
    OR: visibleEntityRules,
  };
};

const applyActivityFilters = (where, query) => {
  const entityType = normalizeEntityType(query.entityType);
  const startDate = parseDate(query.startDate || query.dateFrom, "startDate");
  const endDate = parseDate(query.endDate || query.dateTo, "endDate");

  if (entityType) {
    where.entityType = entityType;
  }

  if (query.userId) {
    if (!isValidUuid(query.userId)) {
      throw new ApiError(400, "Invalid userId");
    }

    where.actorId = query.userId;
  }

  if (query.projectId) {
    if (!isValidUuid(query.projectId)) {
      throw new ApiError(400, "Invalid projectId");
    }

    where.entityType = "PROJECT";
    where.entityId = query.projectId;
  }

  if (query.teamId) {
    if (!isValidUuid(query.teamId)) {
      throw new ApiError(400, "Invalid teamId");
    }

    where.entityType = "TEAM";
    where.entityId = query.teamId;
  }

  if (startDate || endDate) {
    // Timeline date filters operate on creation time for stable audit ordering.
    where.createdAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  return where;
};

const formatActivity = (activity) => ({
  id: activity.id,
  actor: activity.actor,
  organization: activity.organization,
  action: activity.action,
  entityType: activity.entityType,
  entityId: activity.entityId,
  metadata: activity.metadata,
  createdAt: activity.createdAt,
  updatedAt: activity.updatedAt,
});

const validateTeamActivityAccess = async (teamId, user) => {
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
    throw new ApiError(404, "Team not found");
  }
};

const validateProjectActivityAccess = async (projectId, user) => {
  if (!isValidUuid(projectId)) {
    throw new ApiError(400, "Invalid projectId");
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
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
    },
    select: {
      id: true,
    },
  });

  if (!project) {
    throw new ApiError(404, "Project not found");
  }
};

const buildTeamTimelineWhere = async (teamId) => {
  const projects = await prisma.project.findMany({
    where: {
      assignedTeamId: teamId,
    },
    select: {
      id: true,
    },
  });
  const projectIds = projects.map((project) => project.id);
  const tasks = await prisma.task.findMany({
    where: {
      projectId: {
        in: projectIds,
      },
    },
    select: {
      id: true,
    },
  });
  const taskIds = tasks.map((task) => task.id);
  const relatedRules = [
    {
      entityType: "TEAM",
      entityId: teamId,
    },
  ];

  if (projectIds.length) {
    relatedRules.push({
      entityType: "PROJECT",
      entityId: {
        in: projectIds,
      },
    });
  }

  if (taskIds.length) {
    relatedRules.push({
      entityType: "TASK",
      entityId: {
        in: taskIds,
      },
    });
  }

  return {
    // Team timelines include direct team events plus project and task events owned by that team.
    OR: relatedRules,
  };
};

const buildProjectTimelineWhere = async (projectId) => {
  const tasks = await prisma.task.findMany({
    where: {
      projectId,
    },
    select: {
      id: true,
    },
  });
  const taskIds = tasks.map((task) => task.id);
  const relatedRules = [
    {
      entityType: "PROJECT",
      entityId: projectId,
    },
  ];

  if (taskIds.length) {
    relatedRules.push({
      entityType: "TASK",
      entityId: {
        in: taskIds,
      },
    });
  }

  return {
    // Project timelines include direct project events plus task activity under the project.
    OR: relatedRules,
  };
};

export const getActivityFeed = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);
  const where = applyActivityFilters(await buildVisibleActivityWhere(req.user), req.query);

  const [activities, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: activityInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return sendSuccess(
    res,
    200,
    "Activity feed retrieved successfully",
    activities.map(formatActivity),
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  );
});

export const getActivityById = asyncHandler(async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    throw new ApiError(400, "Invalid activity id");
  }

  const activity = await prisma.activityLog.findFirst({
    where: {
      id: req.params.id,
      ...(await buildVisibleActivityWhere(req.user)),
    },
    include: activityInclude,
  });

  if (!activity) {
    throw new ApiError(404, "Activity not found");
  }

  return sendSuccess(res, 200, "Activity details retrieved successfully", formatActivity(activity));
});

export const getTeamActivity = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);

  await validateTeamActivityAccess(req.params.teamId, req.user);

  const where = {
    AND: [await buildVisibleActivityWhere(req.user), await buildTeamTimelineWhere(req.params.teamId)],
  };

  const [activities, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: activityInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return sendSuccess(
    res,
    200,
    "Team activity retrieved successfully",
    activities.map(formatActivity),
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  );
});

export const getProjectActivity = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);

  await validateProjectActivityAccess(req.params.projectId, req.user);

  const where = {
    AND: [await buildVisibleActivityWhere(req.user), await buildProjectTimelineWhere(req.params.projectId)],
  };

  const [activities, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: activityInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return sendSuccess(
    res,
    200,
    "Project activity retrieved successfully",
    activities.map(formatActivity),
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  );
});
