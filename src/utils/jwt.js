import jwt from "jsonwebtoken";
import { InternalServerError, UnauthorizedError } from "./errors.js";

const tokenVersion = "v1";

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new InternalServerError("JWT_SECRET is not configured");
  }

  return process.env.JWT_SECRET;
};

const parseInvalidBefore = () => {
  if (!process.env.JWT_INVALID_BEFORE) return null;

  const parsedDate = new Date(process.env.JWT_INVALID_BEFORE);
  return Number.isNaN(parsedDate.getTime()) ? null : Math.floor(parsedDate.getTime() / 1000);
};

export const signAccessToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      tokenVersion: user.tokenVersion || 1,
      typ: tokenVersion,
    },
    getJwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    },
  );

export const verifyAccessToken = (token) => {
  const decoded = jwt.verify(token, getJwtSecret());

  if (!decoded?.id || !decoded?.organizationId || !decoded.iat) {
    throw new UnauthorizedError("Invalid token");
  }

  if (decoded.typ && decoded.typ !== tokenVersion) {
    throw new UnauthorizedError("Invalid token");
  }

  const invalidBefore = parseInvalidBefore();
  if (invalidBefore && decoded.iat < invalidBefore) {
    throw new UnauthorizedError("Token was issued before the allowed session window");
  }

  return decoded;
};

export const assertTokenMatchesUser = (decoded, user) => {
  const expectedVersion = user.tokenVersion || 1;
  const decodedVersion = decoded.tokenVersion || 1;

  // Token versions allow future server-side invalidation without changing the login response shape.
  if (decodedVersion !== expectedVersion || decoded.organizationId !== user.organizationId) {
    throw new UnauthorizedError("Invalid token");
  }
};
