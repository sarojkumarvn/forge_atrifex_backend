import rateLimit from "express-rate-limit";

const rateLimitResponse = {
  success: false,
  message: "Too many requests. Please try again later.",
};

const createRateLimiter = ({ windowMs, max }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitResponse,
  });

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
});

export const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
});

export const githubRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
});

export const generalApiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
});
