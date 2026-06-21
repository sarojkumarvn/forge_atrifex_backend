import prisma from "../config/prisma.js";

export const createNotification = async ({ title, message, recipientId, client = prisma }) => {
  // Notifications are always addressed to one recipient so ownership checks stay simple.
  return client.notification.create({
    data: {
      title,
      message,
      recipientId,
    },
  });
};

export const createNotifications = async ({ notifications, client = prisma }) => {
  if (!notifications.length) {
    return { count: 0 };
  }

  // Bulk creation keeps multi-recipient events atomic with their parent business action.
  return client.notification.createMany({
    data: notifications,
  });
};
