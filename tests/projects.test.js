import request from "supertest";
import app from "./setup/testApp.js";
import { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("projects", () => {
  test("admin can create project", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post("/api/projects")
      .set(authHeader(data.tokens.admin))
      .send({
        title: "Created Project",
        description: "Created in tests",
        teamId: data.team.id,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.title).toBe("Created Project");
  });

  test("admin can assign team to project", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post(`/api/projects/${data.project.id}/assign-team`)
      .set(authHeader(data.tokens.admin))
      .send({ teamId: data.team.id });

    expect(response.status).toBe(200);
    expect(response.body.data.assignedTeam.id).toBe(data.team.id);
  });

  test("team lead can view projects for led team", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/projects")
      .set(authHeader(data.tokens.lead));

    expect(response.status).toBe(200);
    expect(response.body.data.map((project) => project.id)).toEqual([data.project.id]);
  });

  test("team member can view projects for joined team", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/projects")
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
    expect(response.body.data.map((project) => project.id)).toEqual([data.project.id]);
  });

  test("team member cannot create project", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post("/api/projects")
      .set(authHeader(data.tokens.member))
      .send({ title: "Blocked", description: "Blocked" });

    expect(response.status).toBe(403);
  });

  test("cannot assign project to team from another organization", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post(`/api/projects/${data.project.id}/assign-team`)
      .set(authHeader(data.tokens.admin))
      .send({ teamId: data.teamB.id });

    expect(response.status).toBe(404);
  });

  test("cannot delete active project", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .delete(`/api/projects/${data.project.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(400);
  });
});
