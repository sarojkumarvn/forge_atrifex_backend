import request from "supertest";
import app from "./setup/testApp.js";
import prisma, { disconnectDatabase, resetDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterAll(disconnectDatabase);

describe("authentication", () => {
  test("register new organization creates first user as ADMIN", async () => {
    await resetDatabase();

    const response = await request(app).post("/api/auth/register").send({
      fullName: "New Admin",
      email: "new.admin@example.com",
      password: "Password@123",
      organizationName: "New Org",
    });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe("ADMIN");
    expect(response.body.user.organization.name).toBe("New Org");
  });

  test("register into existing organization cannot create ADMIN", async () => {
    const data = await seedTestData();

    const response = await request(app).post("/api/auth/register").send({
      fullName: "Blocked Admin",
      email: "blocked.admin@example.com",
      password: "Password@123",
      role: "ADMIN",
      organizationName: data.orgA.name,
    });

    expect(response.status).toBe(409);
  });

  test("login works with valid credentials", async () => {
    const data = await seedTestData();

    const response = await request(app).post("/api/auth/login").send({
      email: data.users.admin.email,
      password: data.password,
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBe(data.users.admin.email);
  });

  test("login fails with invalid password", async () => {
    const data = await seedTestData();

    const response = await request(app).post("/api/auth/login").send({
      email: data.users.admin.email,
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
  });

  test("register rejects invalid email", async () => {
    await resetDatabase();

    const response = await request(app).post("/api/auth/register").send({
      fullName: "Invalid Email",
      email: "not-an-email",
      password: "Password@123",
      organizationName: "Email Test Org",
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Validation failed");
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "body.email",
          message: "Invalid email address",
        }),
      ]),
    );
  });

  test("register rejects missing required fields", async () => {
    await resetDatabase();

    const response = await request(app).post("/api/auth/register").send({
      email: "missing@example.com",
      password: "Password@123",
    });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "body.fullName",
        }),
        expect.objectContaining({
          field: "body.organizationName",
        }),
      ]),
    );
  });

  test("/me returns safe user fields", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/auth/me")
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(data.users.member.id);
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.user.githubAccessToken).toBeUndefined();
    expect(response.body.user.githubTokenScope).toBeUndefined();
  });

  test("protected routes reject missing token", async () => {
    await seedTestData();

    const response = await request(app).get("/api/teams");

    expect(response.status).toBe(401);
  });

  test("safe auth responses never include stored secrets", async () => {
    const data = await seedTestData();
    const storedUser = await prisma.user.findUnique({ where: { id: data.users.member.id } });

    expect(storedUser.passwordHash).toBeTruthy();
    expect(storedUser.githubAccessToken).toBeTruthy();

    const response = await request(app)
      .get("/api/auth/me")
      .set(authHeader(data.tokens.member));

    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("githubAccessToken");
  });
});
