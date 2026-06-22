import { jest } from "@jest/globals";

describe("performance utilities", () => {
  test("cache reuses computed values within ttl", async () => {
    const { buildCacheKey, flushCache, getOrSetCache } = await import("../src/services/cache.service.js");
    const factory = jest.fn().mockResolvedValue({ value: "cached" });
    const key = buildCacheKey("test", "cache-behavior");

    flushCache();

    const first = await getOrSetCache(key, 60, factory);
    const second = await getOrSetCache(key, 60, factory);

    expect(first).toEqual({ value: "cached" });
    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  test("pagination validator rejects limits over maximum", async () => {
    const { paginationQuerySchema } = await import("../src/validators/common.validator.js");

    const result = paginationQuerySchema.safeParse({
      page: "1",
      limit: "101",
    });

    expect(result.success).toBe(false);
  });

  test("pagination validator accepts default list limit range", async () => {
    const { paginationQuerySchema } = await import("../src/validators/common.validator.js");

    const result = paginationQuerySchema.safeParse({
      page: "1",
      limit: "20",
    });

    expect(result.success).toBe(true);
    expect(result.data.limit).toBe(20);
  });
});
