import request from "supertest";
import app from "./setup/testApp.js";
import prisma, { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("teams", () => {
  test("admin can create team", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post("/api/teams")
      .set(authHeader(data.tokens.admin))
      .send({
        name: "Created Team",
        leadId: data.users.lead.id,
        memberIds: [data.users.member.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("Created Team");
  });

  test("admin can add and remove members", async () => {
    const data = await seedTestData();
    const newMember = await prisma.user.create({
      data: {
        fullName: "New Member",
        email: "new.member@example.com",
        passwordHash: data.users.member.passwordHash,
        role: "TEAM_MEMBER",
        organizationId: data.orgA.id,
      },
    });

    const addResponse = await request(app)
      .post(`/api/teams/${data.team.id}/members`)
      .set(authHeader(data.tokens.admin))
      .send({ memberIds: [newMember.id] });

    expect(addResponse.status).toBe(200);

    const removeResponse = await request(app)
      .delete(`/api/teams/${data.team.id}/members/${newMember.id}`)
      .set(authHeader(data.tokens.admin));

    expect(removeResponse.status).toBe(200);
  });

  test("team lead can view only led teams", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/teams")
      .set(authHeader(data.tokens.lead));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(data.team.id);
  });

  test("team member can view only joined teams", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/teams")
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(data.team.id);
  });

  test("cannot assign non-team-lead as team lead", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post("/api/teams")
      .set(authHeader(data.tokens.admin))
      .send({ name: "Invalid Lead Team", leadId: data.users.member.id });

    expect(response.status).toBe(400);
  });

  test("cannot add users from another organization", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post(`/api/teams/${data.team.id}/members`)
      .set(authHeader(data.tokens.admin))
      .send({ memberIds: [data.users.memberB.id] });

    expect(response.status).toBe(400);
  });

  test("cannot delete team with active projects", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .delete(`/api/teams/${data.team.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(400);
  });
});
