import request from "supertest";
import app from "./setup/testApp.js";
import prisma, { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("tasks", () => {
  test("team lead can create task for own team project", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post("/api/tasks")
      .set(authHeader(data.tokens.lead))
      .send({
        title: "Created Task",
        projectId: data.project.id,
        assigneeId: data.users.member.id,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe("Created Task");
  });

  test("team lead cannot create task for another team", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post("/api/tasks")
      .set(authHeader(data.tokens.lead))
      .send({
        title: "Blocked Task",
        projectId: data.projectB.id,
        assigneeId: data.users.memberB.id,
      });

    expect(response.status).toBe(404);
  });

  test("team member can view assigned tasks", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/tasks")
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
    expect(response.body.data.map((task) => task.id)).toEqual([data.task.id]);
  });

  test("team member cannot update another member's task", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .patch(`/api/tasks/${data.otherTask.id}/progress`)
      .set(authHeader(data.tokens.member))
      .send({ progress: 30 });

    expect(response.status).toBe(404);
  });

  test("progress update recalculates project progress", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .patch(`/api/tasks/${data.task.id}/progress`)
      .set(authHeader(data.tokens.member))
      .send({ progress: 100 });

    expect(response.status).toBe(200);

    const project = await prisma.project.findUnique({ where: { id: data.project.id } });
    expect(project.progress).toBe(50);
  });

  test("progress 100 marks task completed", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .patch(`/api/tasks/${data.task.id}/progress`)
      .set(authHeader(data.tokens.member))
      .send({ progress: 100 });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("COMPLETED");
  });

  test("invalid status transition is rejected", async () => {
    const data = await seedTestData();

    await prisma.task.update({
      where: { id: data.task.id },
      data: { status: "COMPLETED", progress: 100 },
    });

    const response = await request(app)
      .patch(`/api/tasks/${data.task.id}/status`)
      .set(authHeader(data.tokens.member))
      .send({ status: "IN_PROGRESS" });

    expect(response.status).toBe(400);
  });

  test("task reassignment validates assignee belongs to team", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .patch(`/api/tasks/${data.task.id}/reassign`)
      .set(authHeader(data.tokens.lead))
      .send({ assigneeId: data.users.memberB.id });

    expect(response.status).toBe(400);
  });
});
