const collectRefs = (value, refs = []) => {
  if (!value || typeof value !== "object") {
    return refs;
  }

  if (typeof value.$ref === "string") {
    refs.push(value.$ref);
  }

  Object.values(value).forEach((child) => collectRefs(child, refs));
  return refs;
};

const resolveLocalRef = (spec, ref) => {
  if (!ref.startsWith("#/")) {
    return undefined;
  }

  return ref
    .slice(2)
    .split("/")
    .reduce((current, part) => current?.[part], spec);
};

describe("OpenAPI documentation", () => {
  test("swagger spec exposes all major API route groups", async () => {
    const { swaggerSpec } = await import("../src/config/swagger.js");

    expect(swaggerSpec.openapi).toBe("3.0.3");
    expect(swaggerSpec.info.title).toBe("Forge AtriFex API");
    expect(swaggerSpec.paths["/api/auth/login"]).toBeDefined();
    expect(swaggerSpec.paths["/api/teams"]).toBeDefined();
    expect(swaggerSpec.paths["/api/projects/{id}/assign-team"]).toBeDefined();
    expect(swaggerSpec.paths["/api/tasks/{id}/progress"]).toBeDefined();
    expect(swaggerSpec.paths["/api/reports/executive-summary"]).toBeDefined();
    expect(swaggerSpec.paths["/api/ai/project-analysis/{projectId}"]).toBeDefined();
    expect(swaggerSpec.paths["/api/github/project/{projectId}/contributors"]).toBeDefined();
  });

  test("swagger spec has no broken local references", async () => {
    const { swaggerSpec } = await import("../src/config/swagger.js");
    const refs = collectRefs(swaggerSpec);
    const brokenRefs = refs.filter((ref) => !resolveLocalRef(swaggerSpec, ref));

    expect(brokenRefs).toEqual([]);
  });
});
