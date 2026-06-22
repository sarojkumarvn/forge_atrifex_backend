import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "./setup/testApp.js";
import prisma, { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";
import { encryptGithubToken } from "../src/utils/githubClient.js";

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(disconnectDatabase);

const jsonResponse = ({ ok = true, status = 200, data, remaining = "100", link = null } = {}) => ({
  ok,
  status,
  headers: {
    get: (name) => {
      if (name.toLowerCase() === "x-ratelimit-remaining") return remaining;
      if (name.toLowerCase() === "link") return link;
      return null;
    },
  },
  text: async () => JSON.stringify(data),
  json: async () => data,
});

const connectAdminGithub = async (adminId) => {
  await prisma.user.update({
    where: { id: adminId },
    data: {
      githubUsername: "admin-a-gh",
      githubAccessToken: encryptGithubToken("github-token-admin"),
    },
  });
};

const connectProjectRepository = async (projectId) => {
  await prisma.project.update({
    where: { id: projectId },
    data: {
      githubRepositoryId: "123",
      githubRepositoryOwner: "owner",
      githubRepositoryName: "repo",
      githubDefaultBranch: "main",
      repositoryUrl: "https://github.com/owner/repo",
    },
  });
};

describe("github integration", () => {
  test("GitHub connect requires auth", async () => {
    await seedTestData();

    const response = await request(app).get("/api/github/connect");

    expect(response.status).toBe(401);
  });

  test("OAuth callback validates state", async () => {
    await seedTestData();

    const response = await request(app).get("/api/github/callback?code=test-code&state=invalid");

    expect(response.status).toBe(400);
  });

  test("repository listing requires connected token", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .get("/api/github/repositories")
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(401);
  });

  test("repository listing uses mocked GitHub API", async () => {
    const data = await seedTestData();
    await connectAdminGithub(data.users.admin.id);
    jest.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 123,
            name: "repo",
            private: false,
            owner: { login: "owner" },
          },
        ],
      }),
    );

    const response = await request(app)
      .get("/api/github/repositories")
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(200);
    expect(response.body.data[0].owner).toBe("owner");
  });

  test("repository linking validates project access", async () => {
    const data = await seedTestData();
    await connectAdminGithub(data.users.admin.id);

    const response = await request(app)
      .post("/api/github/connect-repository")
      .set(authHeader(data.tokens.admin))
      .send({
        projectId: data.projectB.id,
        repositoryOwner: "owner",
        repositoryName: "repo",
      });

    expect(response.status).toBe(404);
  });

  test("repository analytics respects project access", async () => {
    const data = await seedTestData();
    await connectAdminGithub(data.users.admin.id);

    const response = await request(app)
      .get(`/api/github/project/${data.projectB.id}/overview`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(404);
  });

  test("GitHub API failure returns safe error", async () => {
    const data = await seedTestData();
    await connectAdminGithub(data.users.admin.id);
    await connectProjectRepository(data.project.id);
    jest.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ ok: false, status: 500, data: {} }));

    const response = await request(app)
      .get(`/api/github/project/${data.project.id}/overview`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(502);
    expect(response.body.message).toBe("GitHub API request failed");
  });

  test("rate-limit response maps to 429", async () => {
    const data = await seedTestData();
    await connectAdminGithub(data.users.admin.id);
    await connectProjectRepository(data.project.id);
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ ok: false, status: 403, remaining: "0", data: {} }));

    const response = await request(app)
      .get(`/api/github/project/${data.project.id}/overview`)
      .set(authHeader(data.tokens.admin));

    expect(response.status).toBe(429);
  });

  test("valid OAuth callback stores encrypted GitHub token", async () => {
    const data = await seedTestData();
    const state = jwt.sign(
      { userId: data.users.admin.id, organizationId: data.orgA.id, purpose: "github_oauth" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" },
    );

    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "oauth-token", scope: "repo" }),
      })
      .mockResolvedValueOnce(jsonResponse({ data: { id: 123, login: "oauth-user", name: "OAuth User" } }));

    const response = await request(app).get(`/api/github/callback?code=test-code&state=${state}`);

    expect(response.status).toBe(200);
    expect(response.body.data.user.githubUsername).toBe("oauth-user");
  });
});
