import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import logActivity from "../utils/activityLogger.js";
import { createNotifications } from "../utils/notificationSender.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activeProjectStatuses = ["PLANNED", "IN_PROGRESS", "ON_HOLD"];

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

const teamListInclude = {
  lead: {
    select: userSelect,
  },
  _count: {
    select: {
      memberships: true,
    },
  },
};

const teamDetailInclude = {
  organization: {
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
    },
  },
  lead: {
    select: userSelect,
  },
  memberships: {
    orderBy: {
      joinedAt: "asc",
    },
    include: {
      user: {
        select: userSelect,
      },
    },
  },
  _count: {
    select: {
      assignedProjects: true,
    },
  },
};

const isValidUuid = (id) => typeof id === "string" && uuidRegex.test(id);

const uniqueIds = (ids) => [...new Set(ids)];

const buildTeamAccessWhere = (user) => {
  const where = {
    // Ensure users cannot access teams outside their organization.
    organizationId: user.organizationId,
  };

  if (user.role === "TEAM_LEAD") {
    // Team leads can only view teams they are assigned to lead.
    where.leadId = user.id;
  }

  if (user.role === "TEAM_MEMBER") {
    // Team members can only view teams where a membership relation exists.
    where.memberships = {
      some: {
        userId: user.id,
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
        name: {
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
    ],
  };
};

const parsePagination = (pageQuery, limitQuery) => {
  const page = Math.max(Number.parseInt(pageQuery, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(limitQuery, 10) || 20, 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const formatTeamListItem = (team) => ({
  id: team.id,
  name: team.name,
  description: team.description,
  lead: team.lead,
  memberCount: team._count.memberships,
  createdAt: team.createdAt,
  updatedAt: team.updatedAt,
});

const formatTeamDetail = async (team) => {
  const tasksCount = await prisma.task.count({
    where: {
      project: {
        assignedTeamId: team.id,
      },
    },
  });

  return {
    id: team.id,
    name: team.name,
    description: team.description,
    organization: team.organization,
    lead: team.lead,
    members: team.memberships.map((membership) => ({
      membershipId: membership.id,
      joinedAt: membership.joinedAt,
      user: membership.user,
    })),
    projectsCount: team._count.assignedProjects,
    tasksCount,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
};

const findOrganizationScopedTeam = async (teamId, organizationId, queryOptions = { include: teamDetailInclude }) => {
  if (!isValidUuid(teamId)) {
    // Validate IDs before Prisma queries so malformed IDs return a clear client error.
    throw new ApiError(400, "Invalid team id");
  }

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      // Every team lookup is scoped to the caller organization.
      organizationId,
    },
    ...queryOptions,
  });

  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  return team;
};

const ensureUniqueTeamName = async ({ name, organizationId, excludeTeamId = null }) => {
  const existingTeam = await prisma.team.findFirst({
    where: {
      // Team names are unique only within the same organization.
      organizationId,
      name,
      ...(excludeTeamId ? { NOT: { id: excludeTeamId } } : {}),
    },
  });

  if (existingTeam) {
    throw new ApiError(409, "Team name already exists in this organization");
  }
};

const validateTeamLead = async (leadId, organizationId) => {
  if (!isValidUuid(leadId)) {
    throw new ApiError(400, "Invalid leadId");
  }

  const lead = await prisma.user.findFirst({
    where: {
      id: leadId,
      organizationId,
      role: "TEAM_LEAD",
      isActive: true,
    },
    select: userSelect,
  });

  if (!lead) {
    // Verify the selected lead actually has TEAM_LEAD role and belongs to this organization.
    throw new ApiError(400, "leadId must belong to an active TEAM_LEAD in your organization");
  }

  return lead;
};

const validateMemberIds = async (memberIds, organizationId) => {
  if (memberIds === undefined) {
    return [];
  }

  if (!Array.isArray(memberIds)) {
    throw new ApiError(400, "memberIds must be an array");
  }

  if (!memberIds.every(isValidUuid)) {
    throw new ApiError(400, "memberIds must contain valid user ids");
  }

  const ids = uniqueIds(memberIds);

  if (ids.length === 0) {
    return [];
  }

  const members = await prisma.user.findMany({
    where: {
      id: {
        in: ids,
      },
      organizationId,
      role: "TEAM_MEMBER",
      isActive: true,
    },
    select: userSelect,
  });

  if (members.length !== ids.length) {
    // Member IDs are restricted to active TEAM_MEMBER users inside the admin organization.
    throw new ApiError(400, "memberIds must belong to active TEAM_MEMBER users in your organization");
  }

  return ids;
};

const getTeamForResponse = async (teamId) => {
  const team = await prisma.team.findUnique({
    where: {
      id: teamId,
    },
    include: teamDetailInclude,
  });

  return formatTeamDetail(team);
};

export const getTeams = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);
  const accessWhere = buildTeamAccessWhere(req.user);
  const searchWhere = buildSearchWhere(req.query.search);

  const where = {
    ...accessWhere,
    ...searchWhere,
  };

  const [teams, total] = await Promise.all([
    prisma.team.findMany({
      where,
      include: teamListInclude,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.team.count({ where }),
  ]);

  return sendSuccess(
    res,
    200,
    "Teams fetched successfully",
    teams.map(formatTeamListItem),
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  );
});

export const getTeamById = asyncHandler(async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    throw new ApiError(400, "Invalid team id");
  }

  const team = await prisma.team.findFirst({
    where: {
      id: req.params.id,
      ...buildTeamAccessWhere(req.user),
    },
    include: teamDetailInclude,
  });

  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  return sendSuccess(res, 200, "Team fetched successfully", await formatTeamDetail(team));
});

export const createTeam = asyncHandler(async (req, res) => {
  const { name, description, leadId, memberIds } = req.body;
  const trimmedName = name?.trim();
  const trimmedDescription = description?.trim() || null;

  if (!trimmedName) {
    // Team creation requires a stable name for organization-level uniqueness.
    throw new ApiError(400, "name is required");
  }

  if (!leadId) {
    throw new ApiError(400, "leadId is required");
  }

  await ensureUniqueTeamName({
    name: trimmedName,
    organizationId: req.user.organizationId,
  });
  await validateTeamLead(leadId, req.user.organizationId);
  const validMemberIds = await validateMemberIds(memberIds, req.user.organizationId);

  const team = await prisma.$transaction(async (tx) => {
    const createdTeam = await tx.team.create({
      data: {
        name: trimmedName,
        description: trimmedDescription,
        leadId,
        organizationId: req.user.organizationId,
      },
    });

    if (validMemberIds.length > 0) {
      // Prevent duplicate memberships before creating team relations.
      await tx.teamMembership.createMany({
        data: validMemberIds.map((userId) => ({
          userId,
          teamId: createdTeam.id,
        })),
        skipDuplicates: true,
      });

      // Notify new members immediately so team membership changes appear in their inbox.
      await createNotifications({
        notifications: validMemberIds.map((recipientId) => ({
          title: "You have been added to a team",
          message: `You have been added to ${createdTeam.name}.`,
          recipientId,
        })),
        client: tx,
      });

      await Promise.all(
        validMemberIds.map((memberId) =>
          logActivity({
            actorId: req.user.id,
            organizationId: req.user.organizationId,
            action: "USER_JOINED_TEAM",
            entityType: "TEAM",
            entityId: createdTeam.id,
            metadata: {
              teamId: createdTeam.id,
              memberId,
            },
            client: tx,
          }),
        ),
      );
    }

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TEAM_CREATED",
      entityType: "TEAM",
      entityId: createdTeam.id,
      metadata: {
        name: createdTeam.name,
        leadId,
        memberIds: validMemberIds,
      },
      client: tx,
    });

    return createdTeam;
  });

  return sendSuccess(res, 201, "Team created successfully", await getTeamForResponse(team.id));
});

export const updateTeam = asyncHandler(async (req, res) => {
  const { name, description, leadId } = req.body;
  const data = {};

  await findOrganizationScopedTeam(req.params.id, req.user.organizationId, {
    include: {
      _count: {
        select: {
          memberships: true,
        },
      },
    },
  });

  if (name !== undefined) {
    const trimmedName = name?.trim();

    if (!trimmedName) {
      throw new ApiError(400, "name cannot be empty");
    }

    await ensureUniqueTeamName({
      name: trimmedName,
      organizationId: req.user.organizationId,
      excludeTeamId: req.params.id,
    });
    data.name = trimmedName;
  }

  if (description !== undefined) {
    data.description = description?.trim() || null;
  }

  if (leadId !== undefined) {
    await validateTeamLead(leadId, req.user.organizationId);
    data.leadId = leadId;
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const updatedTeam = await prisma.$transaction(async (tx) => {
    const team = await tx.team.update({
      where: {
        id: req.params.id,
      },
      data,
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TEAM_UPDATED",
      entityType: "TEAM",
      entityId: team.id,
      metadata: {
        updatedFields: Object.keys(data),
      },
      client: tx,
    });

    return team;
  });

  return sendSuccess(res, 200, "Team updated successfully", await getTeamForResponse(updatedTeam.id));
});

export const deleteTeam = asyncHandler(async (req, res) => {
  const team = await findOrganizationScopedTeam(req.params.id, req.user.organizationId, {
    include: {
      _count: {
        select: {
          memberships: true,
        },
      },
    },
  });

  const activeProjectsCount = await prisma.project.count({
    where: {
      assignedTeamId: team.id,
      status: {
        in: activeProjectStatuses,
      },
    },
  });

  if (activeProjectsCount > 0) {
    // Teams with active project dependencies must be preserved to avoid orphaning work ownership.
    throw new ApiError(400, "Team cannot be deleted while active projects are assigned");
  }

  await prisma.$transaction(async (tx) => {
    // Delete memberships first because they are explicit team-user relationship rows.
    await tx.teamMembership.deleteMany({
      where: {
        teamId: team.id,
      },
    });

    await tx.team.delete({
      where: {
        id: team.id,
      },
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TEAM_DELETED",
      entityType: "TEAM",
      entityId: team.id,
      metadata: {
        name: team.name,
      },
      client: tx,
    });
  });

  return sendSuccess(res, 200, "Team deleted successfully");
});

export const addTeamMembers = asyncHandler(async (req, res) => {
  const { memberIds } = req.body;

  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    throw new ApiError(400, "memberIds must be a non-empty array");
  }

  const team = await findOrganizationScopedTeam(req.params.id, req.user.organizationId, {
    select: {
      id: true,
      name: true,
      organizationId: true,
    },
  });
  const validMemberIds = await validateMemberIds(memberIds, req.user.organizationId);

  const existingMemberships = await prisma.teamMembership.findMany({
    where: {
      teamId: team.id,
      userId: {
        in: validMemberIds,
      },
    },
    select: {
      userId: true,
    },
  });
  const existingMemberIds = new Set(existingMemberships.map((membership) => membership.userId));
  const newMemberIds = validMemberIds.filter((userId) => !existingMemberIds.has(userId));

  if (newMemberIds.length === 0) {
    // Duplicate membership checks keep add-member calls idempotent and avoid unique constraint errors.
    throw new ApiError(409, "All selected users are already members of this team");
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMembership.createMany({
      data: newMemberIds.map((userId) => ({
        userId,
        teamId: team.id,
      })),
      skipDuplicates: true,
    });

    // Notify only newly-added members and skip existing memberships.
    await createNotifications({
      notifications: newMemberIds.map((recipientId) => ({
        title: "You have been added to a team",
        message: `You have been added to ${team.name}.`,
        recipientId,
      })),
      client: tx,
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TEAM_MEMBERS_ADDED",
      entityType: "TEAM",
      entityId: team.id,
      metadata: {
        addedMemberIds: newMemberIds,
        skippedExistingMemberIds: [...existingMemberIds],
      },
      client: tx,
    });

    await Promise.all(
      newMemberIds.map((memberId) =>
        logActivity({
          actorId: req.user.id,
          organizationId: req.user.organizationId,
          action: "USER_JOINED_TEAM",
          entityType: "TEAM",
          entityId: team.id,
          metadata: {
            teamId: team.id,
            memberId,
          },
          client: tx,
        }),
      ),
    );
  });

  return sendSuccess(res, 200, "Team members added successfully", await getTeamForResponse(team.id));
});

export const removeTeamMember = asyncHandler(async (req, res) => {
  const { id, userId } = req.params;
  const team = await findOrganizationScopedTeam(id, req.user.organizationId, {
    select: {
      id: true,
      name: true,
      leadId: true,
      organizationId: true,
    },
  });

  if (!isValidUuid(userId)) {
    throw new ApiError(400, "Invalid user id");
  }

  if (team.leadId === userId) {
    // The team lead is controlled by Team.leadId, so callers must update the team lead instead.
    throw new ApiError(400, "Cannot remove the team lead using this endpoint; update team lead instead");
  }

  const membership = await prisma.teamMembership.findUnique({
    where: {
      userId_teamId: {
        userId,
        teamId: team.id,
      },
    },
  });

  if (!membership) {
    throw new ApiError(404, "User is not a member of this team");
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamMembership.delete({
      where: {
        id: membership.id,
      },
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "TEAM_MEMBER_REMOVED",
      entityType: "TEAM",
      entityId: team.id,
      metadata: {
        removedMemberId: userId,
      },
      client: tx,
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: "USER_REMOVED_FROM_TEAM",
      entityType: "TEAM",
      entityId: team.id,
      metadata: {
        teamId: team.id,
        memberId: userId,
      },
      client: tx,
    });
  });

  return sendSuccess(res, 200, "Team member removed successfully");
});
