import prisma from "../config/prisma.js";

const logActivity = async ({
  actorId,
  organizationId,
  action,
  entityType,
  entityId,
  metadata = {},
  client = prisma,
}) => {
  // Record important actions for audit history and timeline tracking.
  return client.activityLog.create({
    data: {
      actorId,
      organizationId,
      action,
      entityType,
      entityId,
      metadata,
    },
  });
};

export default logActivity;
