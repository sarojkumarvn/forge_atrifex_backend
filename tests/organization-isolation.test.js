import request from "supertest";
import app from "./setup/testApp.js";
import { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("organization isolation", () => {
  test("user from Organization A cannot access Organization B teams", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/teams/${data.teamB.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(404);
  });

  test("user from Organization A cannot access Organization B projects", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/projects/${data.projectB.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(404);
  });

  test("user from Organization A cannot access Organization B tasks", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/tasks/${data.taskB.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(404);
  });

  test("user from Organization A cannot access Organization B reports", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/reports/project/${data.projectB.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(404);
  });

  test("user from Organization A cannot access Organization B activity", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/activity/${data.activityB.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(404);
  });
});
