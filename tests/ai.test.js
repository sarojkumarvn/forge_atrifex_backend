import { jest } from "@jest/globals";
import request from "supertest";
import app from "./setup/testApp.js";
import { disconnectDatabase } from "./setup/testDb.js";
import { authHeader, seedTestData } from "./setup/testSeed.js";

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(disconnectDatabase);

const mockAiResponse = (content) => {
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  });
};

describe("ai services", () => {
  test("project analysis builds context and returns validated JSON", async () => {
    const data = await seedTestData();
    mockAiResponse(
      JSON.stringify({
        summary: "Project is active",
        strengths: ["Team assigned"],
        weaknesses: ["Blocked task"],
        risks: ["Overdue task"],
        recommendations: ["Clear blocker"],
      }),
    );

    const response = await request(app)
      .post(`/api/ai/project-analysis/${data.project.id}`)
      .set(authHeader(data.tokens.lead));

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toBe("Project is active");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("risk analysis rejects unauthorized users", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post(`/api/ai/risk-analysis/${data.project.id}`)
      .set(authHeader(data.tokens.member));

    expect(response.status).toBe(403);
  });

  test("malformed AI response uses fallback behavior", async () => {
    const data = await seedTestData();
    mockAiResponse("not-json");

    const response = await request(app)
      .post(`/api/ai/project-analysis/${data.project.id}`)
      .set(authHeader(data.tokens.lead));

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toBe("AI analysis could not be generated from the current response.");
  });

  test("missing AI config fails safely", async () => {
    const data = await seedTestData();
    const previousKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    const response = await request(app)
      .post(`/api/ai/project-analysis/${data.project.id}`)
      .set(authHeader(data.tokens.lead));

    process.env.GROQ_API_KEY = previousKey;

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("AI service is not configured");
  });

  test("AI endpoint respects RBAC", async () => {
    const data = await seedTestData();

    const response = await request(app)
      .post("/api/ai/executive-summary")
      .set(authHeader(data.tokens.lead));

    expect(response.status).toBe(403);
  });
});
