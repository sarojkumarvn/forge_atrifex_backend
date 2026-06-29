import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import generateToken from "../utils/generateToken.js";
import getDashboardPath from "../utils/dashboardPath.js";
import ApiError from "../utils/apiError.js";
import { formatSafeUser, safeUserSelect } from "../utils/safeUser.js";
import {
  acceptOrganizationInvite,
  createOrganizationWithOwner,
} from "../services/organization.service.js";

const validRoles = new Set(["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"]);

export const register = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      role = "TEAM_MEMBER",
      organizationName,
      inviteToken,
      githubUsername,
      phone,
      location,
    } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "fullName, email, and password are required",
      });
    }

    if (!validRoles.has(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let user;

    if (inviteToken) {
      user = await acceptOrganizationInvite({
        inviteToken,
        email: normalizedEmail,
        passwordHash,
        fullName,
        githubUsername,
        phone,
        location,
      });
    } else {
      if (!organizationName) {
        throw new ApiError(400, "organizationName is required");
      }

      const result = await createOrganizationWithOwner({
        organizationName,
        fullName,
        email: normalizedEmail,
        passwordHash,
        githubUsername,
        phone,
        location,
      });
      user = formatSafeUser(result.user);
    }

    const safeUser = formatSafeUser(user);
    const token = generateToken(safeUser);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: {
        token,
        user: safeUser,
        dashboardPath: getDashboardPath(safeUser.role),
      },
      token,
      user: safeUser,
      dashboardPath: getDashboardPath(safeUser.role),
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A user with this unique field already exists",
      });
    }

    return next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "email and password are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        ...safeUserSelect,
        passwordHash: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "User account is inactive",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const safeUser = formatSafeUser(user);
    const token = generateToken(safeUser);

    return res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user: safeUser,
        dashboardPath: getDashboardPath(safeUser.role),
      },
      token,
      user: safeUser,
      dashboardPath: getDashboardPath(safeUser.role),
    });
  } catch (error) {
    return next(error);
  }
};

export const me = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    // Use explicit selects so secret-bearing fields can never leak in auth responses.
    select: safeUserSelect,
  });

  return res.json({
    success: true,
    data: {
      user: formatSafeUser(user),
      dashboardPath: getDashboardPath(user.role),
    },
    user: formatSafeUser(user),
    dashboardPath: getDashboardPath(user.role),
  });
};

export const logout = async (req, res) => {
  return res.json({
    success: true,
    message: "Logout successful",
    data: {},
  });
};

export const acceptInvite = async (req, res, next) => {
  try {
    const { inviteToken, email, password, fullName, githubUsername, phone, location } = req.body;

    if (!inviteToken || !email || !password || !fullName) {
      throw new ApiError(400, "inviteToken, email, password, and fullName are required");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await acceptOrganizationInvite({
      inviteToken,
      email: email.toLowerCase().trim(),
      passwordHash,
      fullName,
      githubUsername,
      phone,
      location,
    });
    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: "Invitation accepted successfully",
      data: {
        token,
        user,
        dashboardPath: getDashboardPath(user.role),
      },
      token,
      user,
      dashboardPath: getDashboardPath(user.role),
    });
  } catch (error) {
    return next(error);
  }
};
