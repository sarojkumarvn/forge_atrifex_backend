import request from "supertest";
import app from "./setup/testApp.js";
import { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("dashboard analytics", () => {
  test("admin dashboard returns correct totals", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/dashboard/admin")
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(200);
    expect(response.body.data.totalProjects).toBe(1);
    expect(response.body.data.totalTeams).toBe(1);
    expect(response.body.data.totalTasks).toBe(2);
  });

  test("team lead dashboard is scoped to led teams", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/dashboard/team-lead")
      .set(authHeader(data.tokens.lead));

    expect(response.status).toBe(200);
    expect(response.body.data.teamProjects).toBe(1);
    expect(response.body.data.activeTasks).toBe(2);
  });

  test("member dashboard is scoped to own tasks", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/dashboard/member")
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
    expect(response.body.data.assignedTasks).toBe(1);
    expect(response.body.data.overdueTasks).toBe(1);
  });

  test("health score calculation returns expected range", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/dashboard/admin/delivery-health")
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(200);
    expect(response.body.data.projectHealth[0].healthScore).toBeGreaterThanOrEqual(0);
    expect(response.body.data.projectHealth[0].healthScore).toBeLessThanOrEqual(100);
  });

  test("overdue and blocked counts are correct", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/dashboard/team-lead/issues")
      .set(authHeader(data.tokens.lead));

    expect(response.status).toBe(200);
    expect(response.body.data.overdueTasks).toHaveLength(1);
    expect(response.body.data.blockedTasks).toHaveLength(1);
  });
});
