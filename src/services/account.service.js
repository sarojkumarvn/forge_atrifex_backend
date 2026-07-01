import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import logActivity from "../utils/activityLogger.js";
import { createNotification } from "../utils/notificationSender.js";
import { formatSafeUser, safeUserSelect } from "../utils/safeUser.js";

const normalizeOptionalString = (value) => value?.trim() || null;

const findCurrentUser = async (userId, select = safeUserSelect) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select,
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return user;
};

const assertGithubUsernameAvailable = async ({ userId, githubUsername }) => {
  if (!githubUsername) return;

  const existing = await prisma.user.findUnique({
    where: { githubUsername },
    select: { id: true },
  });

  if (existing && existing.id !== userId) {
    throw new ApiError(409, "GitHub username is already in use");
  }
};

const assertCanDeactivateOwnAccount = async (user) => {
  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { ownerId: true },
  });

  if (organization?.ownerId === user.id) {
    throw new ApiError(400, "Transfer ownership before deactivating your account");
  }

  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({
      where: {
        organizationId: user.organizationId,
        role: "ADMIN",
        isActive: true,
        status: "ACTIVE",
      },
    });

    if (adminCount <= 1) {
      throw new ApiError(400, "Cannot deactivate the final administrator from an organization");
    }
  }
};

export const getCurrentAccountProfile = async (user) => {
  return formatSafeUser(await findCurrentUser(user.id));
};

export const updateCurrentAccountProfile = async (user, payload) => {
  const data = {};

  if (payload.fullName !== undefined) data.fullName = payload.fullName.trim();
  if (payload.avatar !== undefined) data.avatar = normalizeOptionalString(payload.avatar);
  if (payload.phone !== undefined) data.phone = normalizeOptionalString(payload.phone);
  if (payload.location !== undefined) data.location = normalizeOptionalString(payload.location);
  if (payload.githubUsername !== undefined) {
    data.githubUsername = normalizeOptionalString(payload.githubUsername);
    await assertGithubUsernameAvailable({ userId: user.id, githubUsername: data.githubUsername });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const account = await tx.user.update({
      where: { id: user.id },
      data,
      select: safeUserSelect,
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "ACCOUNT_PROFILE_UPDATED",
      entityType: "USER",
      entityId: user.id,
      metadata: { updatedFields: Object.keys(data) },
      client: tx,
    });

    await createNotification({
      title: "Profile updated",
      message: "Your profile was updated.",
      recipientId: user.id,
      client: tx,
    });

    return account;
  });

  return formatSafeUser(updated);
};

export const changeCurrentAccountPassword = async (user, payload) => {
  const account = await findCurrentUser(user.id, {
    id: true,
    passwordHash: true,
    organizationId: true,
  });

  const isCurrentPasswordValid = await bcrypt.compare(payload.currentPassword, account.passwordHash);

  if (!isCurrentPasswordValid) {
    throw new ApiError(401, "Current password is incorrect");
  }

  if (payload.currentPassword === payload.newPassword) {
    throw new ApiError(400, "New password must be different from current password");
  }

  const passwordHash = await bcrypt.hash(payload.newPassword, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
      select: { id: true },
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "ACCOUNT_PASSWORD_CHANGED",
      entityType: "USER",
      entityId: user.id,
      metadata: {},
      client: tx,
    });

    await createNotification({
      title: "Password changed",
      message: "Your account password was changed.",
      recipientId: user.id,
      client: tx,
    });
  });

  return { changed: true };
};

export const deactivateCurrentAccount = async (user) => {
  await assertCanDeactivateOwnAccount(user);

  const updated = await prisma.$transaction(async (tx) => {
    const account = await tx.user.update({
      where: { id: user.id },
      data: {
        isActive: false,
        status: "INACTIVE",
      },
      select: safeUserSelect,
    });

    await logActivity({
      actorId: user.id,
      organizationId: user.organizationId,
      action: "ACCOUNT_DEACTIVATED",
      entityType: "USER",
      entityId: user.id,
      metadata: {},
      client: tx,
    });

    await createNotification({
      title: "Account deactivated",
      message: "Your account was deactivated.",
      recipientId: user.id,
      client: tx,
    });

    return account;
  });

  return formatSafeUser(updated);
};
