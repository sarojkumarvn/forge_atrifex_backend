import request from "supertest";
import app from "./setup/testApp.js";
import prisma, { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("activity timeline", () => {
  test("admin can view org activity", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/activity")
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(200);
    expect(response.body.data.some((activity) => activity.id === data.activity.id)).toBe(true);
  });

  test("team lead can view team-scoped activity", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/activity/team/${data.team.id}`)
      .set(authHeader(data.tokens.lead));

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  test("team member can view personal activity", async () => {
    const data = await seedTestData();

    await prisma.activityLog.create({
      data: {
        actorId: data.users.member.id,
        organizationId: data.orgA.id,
        action: "TASK_PROGRESS_UPDATED",
        entityType: "TASK",
        entityId: data.task.id,
      },
    });

    const response = await request(app)
      .get("/api/activity")
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
    expect(response.body.data.some((activity) => activity.actor?.id === data.users.member.id)).toBe(true);
  });

  test("cross-organization activity access is blocked", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/activity/${data.activityB.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(404);
  });

  test("team/project/task actions create activity logs", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .patch(`/api/tasks/${data.task.id}/progress`)
      .set(authHeader(data.tokens.member))
      .send({ progress: 70 });

    expect(response.status).toBe(200);

    const activity = await prisma.activityLog.findFirst({
      where: { entityId: data.task.id, action: "TASK_PROGRESS_UPDATED" },
    });

    expect(activity).toBeTruthy();
  });
});
