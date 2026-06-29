import request from "supertest";
import app from "./setup/testApp.js";
import prisma, { disconnectDatabase, resetDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("organization security", () => {
  test("register new organization creates an owner admin", async () => {
    await resetDatabase();

    const response = await request(app).post("/api/auth/register").send({
      fullName: "Owner User",
      email: "owner@example.com",
      password: "Password@123",
      organizationName: "Owner Org",
    });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe("ADMIN");

    const org = await prisma.organization.findUnique({
      where: { nameNormalized: "owner org" },
    });
    const user = await prisma.user.findUnique({ where: { email: "owner@example.com" } });

    expect(org.ownerId).toBe(user.id);
  });

  test("register cannot join an existing organization by name alone", async () => {
    const data = await seedTestData();

    const response = await request(app).post("/api/auth/register").send({
      fullName: "Blocked Join",
      email: "blocked.join@example.com",
      password: "Password@123",
      organizationName: data.orgA.name,
    });

    expect(response.status).toBe(409);
  });

  test("organization invite lifecycle works", async () => {
    const data = await seedTestData();

    const createResponse = await request(app)
      .post("/api/organizations/invite")
      .set(authHeader(data.tokens.admin))
      .send({
        invitedEmail: "invitee@example.com",
        role: "TEAM_MEMBER",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.inviteToken).toBeTruthy();

    const listResponse = await request(app).get("/api/organizations/invites").set(authHeader(data.tokens.admin));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const acceptResponse = await request(app).post("/api/auth/accept-invite").send({
      inviteToken: createResponse.body.data.inviteToken,
      email: "invitee@example.com",
      password: "Password@123",
      fullName: "Invitee User",
    });

    expect(acceptResponse.status).toBe(201);
    expect(acceptResponse.body.user.organizationId).toBe(data.orgA.id);

    const invite = await prisma.organizationInvite.findFirst({
      where: { invitedEmail: "invitee@example.com" },
    });
    expect(invite.status).toBe("ACCEPTED");
  });

  test("rejects wrong email, reused, and expired invites", async () => {
    const data = await seedTestData();

    const createResponse = await request(app)
      .post("/api/organizations/invite")
      .set(authHeader(data.tokens.admin))
      .send({
        invitedEmail: "expire@example.com",
        role: "TEAM_MEMBER",
      });

    const token = createResponse.body.data.inviteToken;

    const wrongEmailResponse = await request(app).post("/api/auth/accept-invite").send({
      inviteToken: token,
      email: "wrong@example.com",
      password: "Password@123",
      fullName: "Wrong Email",
    });
    expect(wrongEmailResponse.status).toBe(403);

    await prisma.organizationInvite.updateMany({
      where: { invitedEmail: "expire@example.com" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expiredResponse = await request(app).post("/api/auth/accept-invite").send({
      inviteToken: token,
      email: "expire@example.com",
      password: "Password@123",
      fullName: "Expired Invite",
    });
    expect(expiredResponse.status).toBe(400);

    await prisma.organizationInvite.updateMany({
      where: { invitedEmail: "expire@example.com" },
      data: { expiresAt: new Date(Date.now() + 1000) },
    });

    const validResponse = await request(app).post("/api/auth/accept-invite").send({
      inviteToken: token,
      email: "expire@example.com",
      password: "Password@123",
      fullName: "Expired Invite",
    });
    expect(validResponse.status).toBe(201);

    const reusedResponse = await request(app).post("/api/auth/accept-invite").send({
      inviteToken: token,
      email: "expire@example.com",
      password: "Password@123",
      fullName: "Expired Invite",
    });
    expect(reusedResponse.status).toBe(400);
  });

  test("role promotion and demotion stay inside the organization", async () => {
    const data = await seedTestData();

    const promoteResponse = await request(app)
      .patch(`/api/users/${data.users.member.id}/role`)
      .set(authHeader(data.tokens.admin))
      .send({ role: "TEAM_LEAD" });

    expect(promoteResponse.status).toBe(200);
    expect(promoteResponse.body.user.role).toBe("TEAM_LEAD");

    const demoteResponse = await request(app)
      .patch(`/api/users/${data.users.lead.id}/role`)
      .set(authHeader(data.tokens.admin))
      .send({ role: "TEAM_MEMBER" });

    expect(demoteResponse.status).toBe(200);

    const crossOrgResponse = await request(app)
      .patch(`/api/users/${data.users.memberB.id}/role`)
      .set(authHeader(data.tokens.admin))
      .send({ role: "TEAM_LEAD" });

    expect(crossOrgResponse.status).toBe(404);
  });

  test("cannot remove the last admin", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .patch(`/api/users/${data.users.admin.id}/role`)
      .set(authHeader(data.tokens.admin))
      .send({ role: "TEAM_LEAD" });

    expect(response.status).toBe(400);
  });
});
