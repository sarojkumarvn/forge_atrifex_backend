import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { formatSafeUser, safeUserSelect } from "../utils/safeUser.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validRoles = new Set(["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"]);

const isValidUuid = (id) => typeof id === "string" && uuidRegex.test(id);

const assertCanRemoveAdminRole = async (user) => {
  if (user.role !== "ADMIN") {
    return;
  }

  const adminCount = await prisma.user.count({
    where: {
      organizationId: user.organizationId,
      role: "ADMIN",
      isActive: true,
    },
  });

  if (adminCount <= 1) {
    // Never allow an organization to lose its final administrator.
    throw new ApiError(400, "Cannot remove the final administrator from an organization");
  }
};

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

  if (targetUser.role === nextRole) {
    return sendSuccess(res, 200, "User role updated successfully", formatSafeUser(targetUser));
  }

  await assertCanRemoveAdminRole(targetUser);

  const updatedUser = await prisma.user.update({
    where: {
      id: targetUser.id,
    },
    data: {
      role: nextRole,
    },
    select: safeUserSelect,
  });

  return sendSuccess(res, 200, "User role updated successfully", formatSafeUser(updatedUser));
});
