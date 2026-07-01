import prisma from "../config/prisma.js";
import { UnauthorizedError } from "../utils/errors.js";
import { assertTokenMatchesUser, verifyAccessToken } from "../utils/jwt.js";

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authorization token is required");
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        githubUsername: true,
        avatar: true,
        phone: true,
        location: true,
        isActive: true,
        status: true,
        tokenVersion: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user || !user.isActive || user.status !== "ACTIVE") {
      throw new UnauthorizedError("Invalid or inactive user");
    }

    assertTokenMatchesUser(decoded, user);

    req.user = user;
    return next();
  } catch (error) {
    if (error.statusCode) {
      return next(error);
    }

    return next(new UnauthorizedError("Invalid or expired token"));
  }
};

export default authMiddleware;
