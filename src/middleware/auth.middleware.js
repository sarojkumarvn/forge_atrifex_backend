import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import { InternalServerError, UnauthorizedError } from "../utils/errors.js";

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authorization token is required");
    }

    if (!process.env.JWT_SECRET) {
      throw new InternalServerError("JWT_SECRET is not configured");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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

    if (!user || !user.isActive) {
      throw new UnauthorizedError("Invalid or inactive user");
    }

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
