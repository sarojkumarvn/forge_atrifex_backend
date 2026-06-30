import crypto from "node:crypto";
import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import logActivity from "../utils/activityLogger.js";
import { createNotification } from "../utils/notificationSender.js";
import { formatSafeUser, safeUserSelect } from "../utils/safeUser.js";

const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;
const activeProjectStatuses = ["PLANNED", "IN_PROGRESS", "ON_HOLD"];
const openTaskStatuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"];

const defaultOrganizationSettings = {
  allowPublicInvites: false,
  requireAdminApproval: true,
  defaultMemberRole: "TEAM_MEMBER",
  aiEnabled: true,
  githubIntegrationEnabled: true,
  notificationsEnabled: true,
};

const normalizeOrganizationName = (name) => {
  const normalized = String(name || "").trim();

  if (!normalized) {
    throw new ApiError(400, "organizationName is required");
  }

  return {
    name: normalized,
    nameNormalized: normalized.toLowerCase(),
  };
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const parsePagination = (pageQuery, limitQuery) => {
  const page = Math.max(Number.parseInt(pageQuery, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(limitQuery, 10) || 20, 1), 100);

  return { page, limit, skip: (page - 1) * limit };
};

const hashInviteToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const generateInviteToken = () => crypto.randomBytes(32).toString("hex");

const isOwner = async (user) => {
  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { ownerId: true },
  });

  return organization?.ownerId === user.id;
};

const assertOwner = async (user) => {
  if (!(await isOwner(user))) {
    throw new ApiError(403, "Organization owner access required");
  }
};

const assertCanDeactivateMember = async ({ actor, target }) => {
  if (actor.organizationId !== target.organizationId) {
    throw new ApiError(404, "Member not found");
  }

  if (actor.id === target.id) {
    throw new ApiError(400, "Transfer ownership before changing your own membership status");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: actor.organizationId },
    select: { ownerId: true },
  });

  if (organization?.ownerId === target.id) {
    throw new ApiError(400, "Transfer ownership before changing the owner status");
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({
      where: { organizationId: actor.organizationId, role: "ADMIN", isActive: true, status: "ACTIVE" },
    });

    if (adminCount <= 1) {
      throw new ApiError(400, "Cannot remove the final administrator from an organization");
    }
  }
};

const organizationSelect = {
  id: true,
  name: true,
  description: true,
  logo: true,
  website: true,
  timezone: true,
  companySize: true,
  settings: true,
  isActive: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: safeUserSelect },
};

const memberSelect = {
  ...safeUserSelect,
  status: true,
  teamMemberships: {
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
};

const formatMember = (member) => ({
  user: formatSafeUser(member),
  role: member.role,
  teams: member.teamMemberships.map((membership) => membership.team),
  status: member.status || (member.isActive ? "ACTIVE" : "INACTIVE"),
  joinedAt: member.createdAt,
});

const getOrganizationOrThrow = async (organizationId, select = organizationSelect) => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select,
  });

  if (!organization) {
    throw new ApiError(404, "Organization not found");
  }

  return organization;
};

const findOrganizationMember = async (organizationId, memberId) => {
  const member = await prisma.user.findFirst({
    where: {
      id: memberId,
      organizationId,
    },
    select: memberSelect,
  });

  if (!member) {
    throw new ApiError(404, "Member not found");
  }

  return member;
};

const getInviteStatus = (invite) => {
  if (invite.status === "REVOKED" || invite.revokedAt) return "REVOKED";
  if (invite.status === "ACCEPTED" || invite.acceptedAt) return "ACCEPTED";
  if (invite.expiresAt < new Date()) return "EXPIRED";
  return "PENDING";
};

const ensureInviteUsable = (invite, email) => {
  const status = getInviteStatus(invite);

  if (status !== "PENDING") {
    throw new ApiError(400, `Invitation is ${status.toLowerCase()}`);
  }

  if (normalizeEmail(invite.invitedEmail) !== normalizeEmail(email)) {
    throw new ApiError(403, "Invitation email does not match");
  }
};

export const createOrganizationWithOwner = async ({
  organizationName,
  fullName,
  email,
  passwordHash,
  githubUsername,
  phone,
  location,
}) => {
  const { name, nameNormalized } = normalizeOrganizationName(organizationName);
  const normalizedEmail = normalizeEmail(email);

  const existingOrg = await prisma.organization.findUnique({
    where: { nameNormalized },
  });

  if (existingOrg) {
    throw new ApiError(409, "Organization already exists");
  }

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name,
        nameNormalized,
      },
    });

    const user = await tx.user.create({
      data: {
        fullName: String(fullName || "").trim(),
        email: normalizedEmail,
        passwordHash,
        role: "ADMIN",
        organizationId: organization.id,
        githubUsername: githubUsername?.trim() || null,
        phone: phone?.trim() || null,
        location: location?.trim() || null,
      },
      select: safeUserSelect,
    });

    await tx.organization.update({
      where: { id: organization.id },
      data: {
        ownerId: user.id,
      },
    });

    await logActivity({
      actorId: user.id,
      organizationId: organization.id,
      action: "ORGANIZATION_CREATED",
      entityType: "ORGANIZATION",
      entityId: organization.id,
      metadata: {
        organizationId: organization.id,
        ownerId: user.id,
      },
      client: tx,
    });

    return { organization, user };
  });
};

export const createOrganizationInvite = async (user, payload) => {
  const invitedEmail = normalizeEmail(payload.invitedEmail);
  const role = String(payload.role || "").trim().toUpperCase();
  if (!["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"].includes(role)) {
    throw new ApiError(400, "Invalid role");
  }

  const token = generateInviteToken();
  const inviteTokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + inviteTtlMs);

  const invite = await prisma.$transaction(async (tx) => {
    const record = await tx.organizationInvite.create({
      data: {
        organizationId: user.organizationId,
        invitedEmail,
        role,
        inviteTokenHash,
        expiresAt,
        invitedById: user.id,
      },
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "ORGANIZATION_INVITE_CREATED",
      entityType: "ORGANIZATION",
      entityId: user.organizationId,
      metadata: {
        inviteId: record.id,
        invitedEmail,
        role,
      },
      client: tx,
    });

    await createNotification({
      title: "Organization invitation created",
      message: `An invitation was created for ${invitedEmail}.`,
      recipientId: user.id,
      client: tx,
    });

    return record;
  });

  return {
    id: invite.id,
    organizationId: invite.organizationId,
    invitedEmail: invite.invitedEmail,
    role: invite.role,
    inviteToken: token,
    expiresAt: invite.expiresAt,
    status: invite.status,
  };
};

export const listOrganizationInvites = async (user) => {
  const invites = await prisma.organizationInvite.findMany({
    where: {
      organizationId: user.organizationId,
      status: "PENDING",
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return invites.map((invite) => ({
    id: invite.id,
    invitedEmail: invite.invitedEmail,
    role: invite.role,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt,
    revokedAt: invite.revokedAt,
    status: getInviteStatus(invite),
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
  }));
};

export const revokeOrganizationInvite = async (user, inviteId) => {
  const invite = await prisma.organizationInvite.findFirst({
    where: { id: inviteId, organizationId: user.organizationId },
  });

  if (!invite) throw new ApiError(404, "Invite not found");
  if (getInviteStatus(invite) !== "PENDING") throw new ApiError(400, "Invite cannot be revoked");

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.organizationInvite.update({
      where: { id: invite.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "ORGANIZATION_INVITE_REVOKED",
      entityType: "ORGANIZATION",
      entityId: user.organizationId,
      metadata: { inviteId: invite.id, invitedEmail: invite.invitedEmail },
      client: tx,
    });

    return record;
  });

  return { id: updated.id, status: updated.status };
};

export const acceptOrganizationInvite = async ({ inviteToken, email, passwordHash, fullName, githubUsername, phone, location }) => {
  const tokenHash = hashInviteToken(inviteToken);
  const invite = await prisma.organizationInvite.findUnique({
    where: { inviteTokenHash: tokenHash },
  });

  if (!invite) throw new ApiError(404, "Invite not found");
  ensureInviteUsable(invite, email);

  const existingUser = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  if (existingUser) throw new ApiError(409, "Email is already registered");

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        fullName: String(fullName || "").trim(),
        email: normalizeEmail(email),
        passwordHash,
        role: invite.role,
        organizationId: invite.organizationId,
        githubUsername: githubUsername?.trim() || null,
        phone: phone?.trim() || null,
        location: location?.trim() || null,
      },
      select: safeUserSelect,
    });

    await tx.organizationInvite.update({
      where: { id: invite.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    await logActivity({
      actorId: createdUser.id,
      organizationId: invite.organizationId,
      action: "ORGANIZATION_INVITE_ACCEPTED",
      entityType: "ORGANIZATION",
      entityId: invite.organizationId,
      metadata: { inviteId: invite.id, invitedEmail: invite.invitedEmail },
      client: tx,
    });

    await createNotification({
      title: "Invitation accepted",
      message: `${createdUser.fullName} joined the organization.`,
      recipientId: invite.invitedById,
      client: tx,
    });

    return createdUser;
  });
  return user;
};

export const getOrganizationProfile = async (user) => {
  const organization = await getOrganizationOrThrow(user.organizationId);
  const [adminsCount, teamCount, projectCount, memberCount] = await Promise.all([
    prisma.user.count({ where: { organizationId: user.organizationId, role: "ADMIN", isActive: true } }),
    prisma.team.count({ where: { organizationId: user.organizationId } }),
    prisma.project.count({ where: { organizationId: user.organizationId } }),
    prisma.user.count({ where: { organizationId: user.organizationId } }),
  ]);

  return {
    organization: {
      ...organization,
      settings: undefined,
      owner: organization.owner ? formatSafeUser(organization.owner) : null,
    },
    owner: organization.owner ? formatSafeUser(organization.owner) : null,
    counts: {
      admins: adminsCount,
      teams: teamCount,
      projects: projectCount,
      members: memberCount,
    },
  };
};

export const updateOrganizationProfile = async (user, payload) => {
  const data = {};

  if (payload.name !== undefined) {
    const { name, nameNormalized } = normalizeOrganizationName(payload.name);
    const existing = await prisma.organization.findUnique({ where: { nameNormalized } });

    if (existing && existing.id !== user.organizationId) {
      throw new ApiError(409, "Organization already exists");
    }

    data.name = name;
    data.nameNormalized = nameNormalized;
  }

  ["logo", "description", "website", "timezone", "companySize"].forEach((field) => {
    if (payload[field] !== undefined) {
      data[field] = payload[field]?.trim() || null;
    }
  });

  const organization = await prisma.$transaction(async (tx) => {
    const updated = await tx.organization.update({
      where: { id: user.organizationId },
      data,
      select: organizationSelect,
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "ORGANIZATION_UPDATED",
      entityType: "ORGANIZATION",
      entityId: user.organizationId,
      metadata: { updatedFields: Object.keys(data) },
      client: tx,
    });

    return updated;
  });

  return {
    ...organization,
    owner: organization.owner ? formatSafeUser(organization.owner) : null,
  };
};

export const getOrganizationSettings = async (user) => {
  const organization = await getOrganizationOrThrow(user.organizationId, { settings: true });
  return {
    ...defaultOrganizationSettings,
    ...(organization.settings || {}),
  };
};

export const updateOrganizationSettings = async (user, payload) => {
  const settings = {
    ...(await getOrganizationSettings(user)),
    ...payload,
  };

  const organization = await prisma.$transaction(async (tx) => {
    const updated = await tx.organization.update({
      where: { id: user.organizationId },
      data: { settings },
      select: { settings: true, ownerId: true },
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "ORGANIZATION_SETTINGS_CHANGED",
      entityType: "ORGANIZATION",
      entityId: user.organizationId,
      metadata: { updatedFields: Object.keys(payload) },
      client: tx,
    });

    if (updated.ownerId && updated.ownerId !== user.id) {
      await createNotification({
        title: "Organization settings changed",
        message: "Organization settings were updated.",
        recipientId: updated.ownerId,
        client: tx,
      });
    }

    return updated;
  });

  return organization.settings;
};

export const listOrganizationMembers = async (user, query = {}) => {
  const { page, limit, skip } = parsePagination(query.page, query.limit);
  const search = query.search?.trim();
  const where = {
    organizationId: user.organizationId,
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.teamId
      ? {
          teamMemberships: {
            some: { teamId: query.teamId },
          },
        }
      : {}),
  };

  if (search) {
    const searchRules = [
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { teamMemberships: { some: { team: { name: { contains: search, mode: "insensitive" } } } } },
    ];

    if (["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"].includes(search.toUpperCase())) {
      searchRules.push({ role: { equals: search.toUpperCase() } });
    }

    where.OR = searchRules;
  }

  const sortBy = query.sortBy || "createdAt";
  const sortOrder = query.sortOrder || "desc";
  const [members, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: memberSelect,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    members: members.map(formatMember),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getOrganizationMemberDetails = async (user, memberId) => {
  const member = await findOrganizationMember(user.organizationId, memberId);
  const [assignedTasks, projects, activity] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignedToId: member.id,
        project: { organizationId: user.organizationId },
      },
      include: {
        project: {
          select: { id: true, title: true, status: true, progress: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
    prisma.project.findMany({
      where: {
        organizationId: user.organizationId,
        tasks: { some: { assignedToId: member.id } },
      },
      select: { id: true, title: true, status: true, progress: true },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
    prisma.activityLog.findMany({
      where: { organizationId: user.organizationId, actorId: member.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const completedTasks = assignedTasks.filter((task) => task.status === "COMPLETED").length;
  const overdueTasks = assignedTasks.filter(
    (task) => task.deadline && task.deadline < new Date() && openTaskStatuses.includes(task.status),
  ).length;

  return {
    profile: formatMember(member),
    assignedTasks,
    projects,
    performanceSummary: {
      totalTasks: assignedTasks.length,
      completedTasks,
      overdueTasks,
      completionRate: assignedTasks.length ? Math.round((completedTasks / assignedTasks.length) * 100) : 0,
    },
    activitySummary: {
      recentActivity: activity,
      recentActivityCount: activity.length,
    },
  };
};

export const updateOrganizationMemberStatus = async (user, memberId, status) => {
  const member = await findOrganizationMember(user.organizationId, memberId);

  if (status !== "ACTIVE") {
    await assertCanDeactivateMember({ actor: user, target: member });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextMember = await tx.user.update({
      where: { id: member.id },
      data: {
        status,
        isActive: status === "ACTIVE",
      },
      select: safeUserSelect,
    });
    const action = status === "ACTIVE" ? "ORGANIZATION_MEMBER_ACTIVATED" : "ORGANIZATION_MEMBER_SUSPENDED";

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action,
      entityType: "USER",
      entityId: member.id,
      metadata: { memberId: member.id, status },
      client: tx,
    });

    await createNotification({
      title: status === "ACTIVE" ? "Account activated" : "Account status changed",
      message: `Your organization account status changed to ${status}.`,
      recipientId: member.id,
      client: tx,
    });

    return nextMember;
  });

  return formatSafeUser(updated);
};

export const removeOrganizationMember = async (user, memberId) => {
  const member = await findOrganizationMember(user.organizationId, memberId);
  await assertCanDeactivateMember({ actor: user, target: member });

  const updated = await prisma.$transaction(async (tx) => {
    const removed = await tx.user.update({
      where: { id: member.id },
      data: {
        status: "INACTIVE",
        isActive: false,
      },
      select: safeUserSelect,
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "ORGANIZATION_MEMBER_REMOVED",
      entityType: "USER",
      entityId: member.id,
      metadata: { memberId: member.id },
      client: tx,
    });

    await createNotification({
      title: "Organization access removed",
      message: "Your organization access was removed.",
      recipientId: member.id,
      client: tx,
    });

    return removed;
  });

  return formatSafeUser(updated);
};

export const getOrganizationStatistics = async (user) => {
  const taskWhere = { project: { organizationId: user.organizationId } };
  const [
    totalMembers,
    admins,
    teamLeads,
    teamMembers,
    teams,
    projects,
    activeProjects,
    completedProjects,
    totalTasks,
    completedTasks,
    overdueTasks,
    aiReportsGenerated,
    githubRepositoriesLinked,
  ] = await Promise.all([
    prisma.user.count({ where: { organizationId: user.organizationId } }),
    prisma.user.count({ where: { organizationId: user.organizationId, role: "ADMIN" } }),
    prisma.user.count({ where: { organizationId: user.organizationId, role: "TEAM_LEAD" } }),
    prisma.user.count({ where: { organizationId: user.organizationId, role: "TEAM_MEMBER" } }),
    prisma.team.count({ where: { organizationId: user.organizationId } }),
    prisma.project.count({ where: { organizationId: user.organizationId } }),
    prisma.project.count({ where: { organizationId: user.organizationId, status: { in: activeProjectStatuses } } }),
    prisma.project.count({ where: { organizationId: user.organizationId, status: "COMPLETED" } }),
    prisma.task.count({ where: taskWhere }),
    prisma.task.count({ where: { ...taskWhere, status: "COMPLETED" } }),
    prisma.task.count({
      where: { ...taskWhere, deadline: { lt: new Date() }, status: { in: openTaskStatuses } },
    }),
    prisma.activityLog.count({ where: { organizationId: user.organizationId, entityType: "AI_INSIGHT" } }),
    prisma.project.count({
      where: {
        organizationId: user.organizationId,
        githubRepositoryOwner: { not: null },
        githubRepositoryName: { not: null },
      },
    }),
  ]);

  return {
    totalMembers,
    admins,
    teamLeads,
    teamMembers,
    teams,
    projects,
    activeProjects,
    completedProjects,
    totalTasks,
    completedTasks,
    overdueTasks,
    aiReportsGenerated,
    githubRepositoriesLinked,
  };
};

export const getOrganizationActivity = async (user, query = {}) => {
  const { page, limit, skip } = parsePagination(query.page, query.limit);
  const search = query.search?.trim();
  const where = {
    organizationId: user.organizationId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
  };

  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { actor: { is: { fullName: { contains: search, mode: "insensitive" } } } },
      { actor: { is: { email: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const [activity, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        actor: { select: safeUserSelect },
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return {
    activity,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const transferOrganizationOwnership = async (user, nextOwnerId) => {
  await assertOwner(user);

  const target = await prisma.user.findFirst({
    where: {
      id: nextOwnerId,
      organizationId: user.organizationId,
      isActive: true,
      status: "ACTIVE",
    },
    select: safeUserSelect,
  });

  if (!target) throw new ApiError(404, "User not found");

  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { ownerId: true },
  });

  if (!organization) throw new ApiError(404, "Organization not found");
  if (organization.ownerId === target.id) return target;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: user.organizationId },
      data: { ownerId: target.id },
    });

    const nextOwner = await tx.user.update({
      where: { id: target.id },
      data: { role: "ADMIN" },
      select: safeUserSelect,
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "ORGANIZATION_OWNERSHIP_TRANSFERRED",
      entityType: "ORGANIZATION",
      entityId: user.organizationId,
      metadata: { previousOwnerId: user.id, nextOwnerId: target.id },
      client: tx,
    });

    await createNotification({
      title: "Organization ownership transferred",
      message: `Ownership was transferred to ${target.fullName}.`,
      recipientId: target.id,
      client: tx,
    });

    await createNotification({
      title: "Organization ownership transferred",
      message: `Ownership was transferred from your account.`,
      recipientId: user.id,
      client: tx,
    });

    return nextOwner;
  });

  return updated;
};

export const assertCanChangeRole = async ({ actor, targetUser, nextRole }) => {
  if (actor.organizationId !== targetUser.organizationId) {
    throw new ApiError(404, "User not found");
  }

  if (nextRole === "ADMIN") return;

  const adminCount = await prisma.user.count({
    where: {
      organizationId: actor.organizationId,
      role: "ADMIN",
      isActive: true,
    },
  });

  if (targetUser.role === "ADMIN" && adminCount <= 1) {
    throw new ApiError(400, "Cannot remove the final administrator from an organization");
  }
};
