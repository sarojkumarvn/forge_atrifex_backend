import request from "supertest";
import app from "./setup/testApp.js";
import prisma, { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("notifications", () => {
  test("user can view own notifications", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/notifications")
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
    expect(response.body.data.map((notification) => notification.id)).toEqual([data.notification.id]);
  });

  test("user cannot view another user's notifications", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .patch(`/api/notifications/${data.otherNotification.id}/read`)
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(404);
  });

  test("unread count works", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/notifications/unread-count")
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
    expect(response.body.data.count).toBe(1);
  });

  test("mark single notification read works", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .patch(`/api/notifications/${data.notification.id}/read`)
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
    expect(response.body.data.isRead).toBe(true);
  });

  test("mark all read works", async () => {
    const data = await seedTestData();
    await prisma.notification.create({
      data: {
        title: "Second notification",
        message: "Second",
        recipientId: data.users.member.id,
      },
    });

    const response = await request(app)
      .patch("/api/notifications/read-all")
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
    expect(response.body.data.updatedCount).toBe(2);
  });

  test("task assignment creates notification", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post("/api/tasks")
      .set(authHeader(data.tokens.lead))
      .send({
        title: "Notification Task",
        projectId: data.project.id,
        assigneeId: data.users.member.id,
      });

    expect(response.status).toBe(201);

    const notification = await prisma.notification.findFirst({
      where: {
        recipientId: data.users.member.id,
        title: "You have been assigned a new task",
      },
    });

    expect(notification).toBeTruthy();
  });
});
