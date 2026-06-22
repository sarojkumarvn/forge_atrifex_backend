import NodeCache from "node-cache";
import logger from "../config/logger.js";

export const cacheTtl = {
  dashboard: 60,
  report: 120,
  github: 300,
  aiContext: 120,
};

const cache = new NodeCache({
  stdTTL: 60,
  checkperiod: 120,
  useClones: false,
});

const stableStringify = (value) => {
  if (value === null || typeof value !== "object") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${key}:${stableStringify(value[key])}`)
    .join(",")}}`;
};

export const buildCacheKey = (...parts) =>
  parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .map((part) => (typeof part === "object" ? stableStringify(part) : String(part)))
    .join(":");

export const getOrSetCache = async (key, ttlSeconds, factory) => {
  const cached = cache.get(key);

  if (cached !== undefined) {
    logger.debug({ cacheKey: key }, "Cache hit");
    return cached;
  }

  const start = performance.now();
  const value = await factory();
  cache.set(key, value, ttlSeconds);
  logger.debug({ cacheKey: key, durationMs: Math.round(performance.now() - start), ttlSeconds }, "Cache populated");

  return value;
};

export const deleteCacheByPrefix = (prefix) => {
  const keys = cache.keys().filter((key) => key.startsWith(prefix));

  if (keys.length > 0) {
    cache.del(keys);
  }

  return keys.length;
};

export const flushCache = () => cache.flushAll();

export const getCacheStats = () => cache.getStats();

export default {
  buildCacheKey,
  cacheTtl,
  deleteCacheByPrefix,
  flushCache,
  getCacheStats,
  getOrSetCache,
};
