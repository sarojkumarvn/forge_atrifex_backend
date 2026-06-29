import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import logActivity from "../utils/activityLogger.js";
import { createNotification } from "../utils/notificationSender.js";
import { formatSafeUser, safeUserSelect } from "../utils/safeUser.js";
import { assertCanChangeRole } from "../services/organization.service.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validRoles = new Set(["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"]);

const isValidUuid = (id) => typeof id === "string" && uuidRegex.test(id);

export const updateUserRole = asyncHandler(async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    throw new ApiError(400, "Invalid user id");
  }

  const nextRole = String(req.body.role || "").trim().toUpperCase();

  if (!validRoles.has(nextRole)) {
    throw new ApiError(400, "Invalid role");
  }

  // Restrict role changes to organization administrators only.
  const targetUser = await prisma.user.findFirst({
    where: {
      id: req.params.id,
      organizationId: req.user.organizationId,
    },
    select: safeUserSelect,
  });

  if (!targetUser) {
    throw new ApiError(404, "User not found");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
    select: { ownerId: true },
  });

  if (targetUser.role === nextRole) {
    return sendSuccess(res, 200, "User role updated successfully", formatSafeUser(targetUser));
  }

  if (organization?.ownerId === targetUser.id && nextRole !== "ADMIN") {
    throw new ApiError(400, "Organization owner must transfer ownership before demotion");
  }

  await assertCanChangeRole({ actor: req.user, targetUser, nextRole });

  if (req.user.id === targetUser.id && targetUser.role === "ADMIN" && nextRole !== "ADMIN") {
    const adminCount = await prisma.user.count({
      where: {
        organizationId: req.user.organizationId,
        role: "ADMIN",
        isActive: true,
      },
    });

    if (adminCount <= 1) {
      throw new ApiError(400, "Cannot remove the final administrator from an organization");
    }
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: {
        id: targetUser.id,
      },
      data: {
        role: nextRole,
      },
      select: safeUserSelect,
    });

    await logActivity({
      actorId: req.user.id,
      organizationId: req.user.organizationId,
      action: nextRole === "ADMIN" ? "USER_PROMOTED" : "USER_DEMOTED",
      entityType: "USER",
      entityId: user.id,
      metadata: {
        userId: user.id,
        fromRole: targetUser.role,
        toRole: nextRole,
      },
      client: tx,
    });

    await createNotification({
      title: nextRole === "ADMIN" ? "Role promoted" : "Role demoted",
      message: `Your role changed from ${targetUser.role} to ${nextRole}.`,
      recipientId: user.id,
      client: tx,
    });

    return user;
  });

  return sendSuccess(res, 200, "User role updated successfully", formatSafeUser(updatedUser));
});
