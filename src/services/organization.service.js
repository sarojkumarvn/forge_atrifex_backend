import crypto from "node:crypto";
import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import logActivity from "../utils/activityLogger.js";
import { createNotification } from "../utils/notificationSender.js";
import { safeUserSelect } from "../utils/safeUser.js";

const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;

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

const hashInviteToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const generateInviteToken = () => crypto.randomBytes(32).toString("hex");

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

export const transferOrganizationOwnership = async (user, nextOwnerId) => {
  const target = await prisma.user.findFirst({
    where: {
      id: nextOwnerId,
      organizationId: user.organizationId,
      isActive: true,
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

    await tx.user.update({
      where: { id: target.id },
      data: { role: "ADMIN" },
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

    return target;
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
