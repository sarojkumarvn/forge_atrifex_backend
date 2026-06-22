import request from "supertest";
import app from "./setup/testApp.js";
import { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("rbac", () => {
  test("ADMIN can access admin-only routes", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/dashboard/admin")
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(200);
  });

  test("TEAM_LEAD cannot access admin-only routes", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/dashboard/admin")
      .set(authHeader(data.tokens.lead));

    expect(response.status).toBe(403);
  });

  test("TEAM_MEMBER cannot access admin-only routes", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post("/api/projects")
      .set(authHeader(data.tokens.member))
      .send({ title: "Blocked", description: "Blocked" });

    expect(response.status).toBe(403);
  });

  test("TEAM_LEAD can access permitted lead routes", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/dashboard/team-lead")
      .set(authHeader(data.tokens.lead));

    expect(response.status).toBe(200);
  });

  test("TEAM_MEMBER can access permitted member routes", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/dashboard/member")
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
  });
});
