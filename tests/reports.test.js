import request from "supertest";
import app from "./setup/testApp.js";
import { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("reports", () => {
  test("project report returns correct metrics", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/reports/project/${data.project.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(200);
    expect(response.body.data.totalTasks).toBe(2);
    expect(response.body.data.overdueTasks).toBe(1);
    expect(response.body.data.blockedTasks).toBe(1);
  });

  test("team report returns correct metrics", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/reports/team/${data.team.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(200);
    expect(response.body.data.projects).toBe(1);
    expect(response.body.data.activeTasks).toBe(2);
  });

  test("member report only allows self or permitted lead access", async () => {
    const data = await seedTestData();

    const selfResponse = await request(app)
      .get(`/api/reports/member/${data.users.member.id}`)
      .set(authHeader(data.tokens.member));
    const blockedResponse = await request(app)
      .get(`/api/reports/member/${data.users.otherMember.id}`)
      .set(authHeader(data.tokens.member));

    expect(selfResponse.status).toBe(200);
    expect(blockedResponse.status).toBe(403);
  });

  test("delivery report is admin-only", async () => {
    const data = await seedTestData();

    const adminResponse = await request(app)
      .get("/api/reports/delivery")
      .set(authHeader(data.tokens.admin));
    const leadResponse = await request(app)
      .get("/api/reports/delivery")
      .set(authHeader(data.tokens.lead));

    expect(adminResponse.status).toBe(200);
    expect(leadResponse.status).toBe(403);
  });

  test("executive summary is admin-only", async () => {
    const data = await seedTestData();

    const adminResponse = await request(app)
      .get("/api/reports/executive-summary")
      .set(authHeader(data.tokens.admin));
    const memberResponse = await request(app)
      .get("/api/reports/executive-summary")
      .set(authHeader(data.tokens.member));

    expect(adminResponse.status).toBe(200);
    expect(memberResponse.status).toBe(403);
  });

  test("cross-organization report access is blocked", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/reports/project/${data.projectB.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(404);
  });
});
