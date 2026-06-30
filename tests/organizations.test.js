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
      data: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
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
    expect(promoteResponse.body.data.role).toBe("TEAM_LEAD");

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

  test("admin can view and update organization profile", async () => {
    const data = await seedTestData();

    const profileResponse = await request(app)
      .get("/api/organizations/me")
      .set(authHeader(data.tokens.admin));

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.data.organization.id).toBe(data.orgA.id);
    expect(profileResponse.body.data.counts.members).toBe(4);

    const updateResponse = await request(app)
      .patch("/api/organizations/me")
      .set(authHeader(data.tokens.admin))
      .send({
        name: "Org A Updated",
        website: "https://org-a.example.com",
        timezone: "Asia/Kolkata",
        companySize: "11-50",
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.name).toBe("Org A Updated");
  });

  test("admin can manage organization settings", async () => {
    const data = await seedTestData();

    const settingsResponse = await request(app)
      .get("/api/organizations/settings")
      .set(authHeader(data.tokens.admin));

    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.body.data.defaultMemberRole).toBe("TEAM_MEMBER");

    const updateResponse = await request(app)
      .patch("/api/organizations/settings")
      .set(authHeader(data.tokens.admin))
      .send({
        requireAdminApproval: false,
        aiEnabled: false,
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.requireAdminApproval).toBe(false);
    expect(updateResponse.body.data.aiEnabled).toBe(false);
  });

  test("member search supports filters and team matching", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/organizations/members?search=Team A&role=TEAM_MEMBER&teamId=${data.team.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(200);
    expect(response.body.data.map((member) => member.user.email)).toEqual(
      expect.arrayContaining([data.users.member.email, data.users.otherMember.email]),
    );
  });

  test("member details include tasks projects and summaries", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get(`/api/organizations/members/${data.users.member.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(200);
    expect(response.body.data.profile.user.id).toBe(data.users.member.id);
    expect(response.body.data.assignedTasks).toHaveLength(1);
    expect(response.body.data.projects).toHaveLength(1);
    expect(response.body.data.performanceSummary.totalTasks).toBe(1);
  });

  test("admin can suspend and reactivate a member", async () => {
    const data = await seedTestData();

    const suspendResponse = await request(app)
      .patch(`/api/organizations/members/${data.users.member.id}/status`)
      .set(authHeader(data.tokens.admin))
      .send({ status: "SUSPENDED" });

    expect(suspendResponse.status).toBe(200);

    const loginResponse = await request(app).post("/api/auth/login").send({
      email: data.users.member.email,
      password: data.password,
    });
    expect(loginResponse.status).toBe(403);

    const activateResponse = await request(app)
      .patch(`/api/organizations/members/${data.users.member.id}/status`)
      .set(authHeader(data.tokens.admin))
      .send({ status: "ACTIVE" });

    expect(activateResponse.status).toBe(200);
    expect(activateResponse.body.data.status).toBe("ACTIVE");
  });

  test("admin can soft remove a member", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .delete(`/api/organizations/members/${data.users.member.id}`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(200);

    const removed = await prisma.user.findUnique({ where: { id: data.users.member.id } });
    expect(removed.isActive).toBe(false);
    expect(removed.status).toBe("INACTIVE");
  });

  test("statistics and activity are organization scoped", async () => {
    const data = await seedTestData();

    const statsResponse = await request(app)
      .get("/api/organizations/statistics")
      .set(authHeader(data.tokens.admin));

    expect(statsResponse.status).toBe(200);
    expect(statsResponse.body.data.totalMembers).toBe(4);
    expect(statsResponse.body.data.projects).toBe(1);
    expect(statsResponse.body.data.totalTasks).toBe(2);

    const activityResponse = await request(app)
      .get("/api/organizations/activity?search=TASK")
      .set(authHeader(data.tokens.admin));

    expect(activityResponse.status).toBe(200);
    expect(activityResponse.body.data.every((activity) => activity.organizationId === data.orgA.id)).toBe(true);
  });

  test("only current owner can transfer ownership", async () => {
    const data = await seedTestData();

    const nonOwnerResponse = await request(app)
      .post("/api/organizations/transfer-ownership")
      .set(authHeader(data.tokens.lead))
      .send({ nextOwnerId: data.users.member.id });

    expect(nonOwnerResponse.status).toBe(403);

    const ownerResponse = await request(app)
      .post("/api/organizations/transfer-ownership")
      .set(authHeader(data.tokens.admin))
      .send({ nextOwnerId: data.users.lead.id });

    expect(ownerResponse.status).toBe(200);

    const org = await prisma.organization.findUnique({ where: { id: data.orgA.id } });
    expect(org.ownerId).toBe(data.users.lead.id);
  });

  test("organization management enforces RBAC and isolation", async () => {
    const data = await seedTestData();

    const rbacResponse = await request(app)
      .get("/api/organizations/me")
      .set(authHeader(data.tokens.member));

    expect(rbacResponse.status).toBe(403);

    const isolationResponse = await request(app)
      .get(`/api/organizations/members/${data.users.memberB.id}`)
      .set(authHeader(data.tokens.admin));

    expect(isolationResponse.status).toBe(404);
  });
});
