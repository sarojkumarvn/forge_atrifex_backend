import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import { sendSuccess } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const parseReadFilter = (read) => {
  if (read === undefined) {
    return null;
  }

  if (read === "true" || read === true) {
    return true;
  }

  if (read === "false" || read === false) {
    return false;
  }

  throw new ApiError(400, "read must be true or false");
};

const formatNotification = (notification) => ({
  id: notification.id,
  title: notification.title,
  message: notification.message,
  isRead: notification.isRead,
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt,
});

export const getNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query.page, req.query.limit);
  const readFilter = parseReadFilter(req.query.read);
  const search = req.query.search?.trim();
  const where = {
    // Users should only see notifications addressed to them.
    recipientId: req.user.id,
  };

  if (readFilter !== null) {
    where.isRead = readFilter;
  }

  if (search) {
    where.OR = [
      {
        title: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        message: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return sendSuccess(
    res,
    200,
    "Notifications retrieved successfully",
    notifications.map(formatNotification),
    {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  );
});

export const getUnreadNotificationCount = asyncHandler(async (req, res) => {
  const count = await prisma.notification.count({
    where: {
      // Unread count is scoped to the authenticated notification owner.
      recipientId: req.user.id,
      isRead: false,
    },
  });

  return sendSuccess(res, 200, "Unread notification count retrieved successfully", { count });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    throw new ApiError(400, "Invalid notification id");
  }

  const notification = await prisma.notification.findFirst({
    where: {
      id: req.params.id,
      // Notification ownership prevents users from reading another user's inbox item.
      recipientId: req.user.id,
    },
  });

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  const updatedNotification = await prisma.notification.update({
    where: {
      id: notification.id,
    },
    data: {
      isRead: true,
    },
  });

  return sendSuccess(res, 200, "Notification marked as read", formatNotification(updatedNotification));
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: {
      // Mark-all only affects the current user's inbox.
      recipientId: req.user.id,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });

  return sendSuccess(res, 200, "All notifications marked as read", { updatedCount: result.count });
});
