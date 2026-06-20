import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import generateToken from "../utils/generateToken.js";
import getDashboardPath from "../utils/dashboardPath.js";

const validRoles = new Set(["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"]);

const userSelect = {
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
};

export const register = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      password,
      role = "TEAM_MEMBER",
      organizationName,
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

    let organization = null;
    const normalizedOrganizationName = organizationName?.trim();

    if (normalizedOrganizationName) {
      organization = await prisma.organization.findFirst({
        where: { name: normalizedOrganizationName },
      });

      if (!organization) {
        organization = await prisma.organization.create({
          data: { name: normalizedOrganizationName },
        });
      }
    } else {
      organization = await prisma.organization.findFirst({
        orderBy: { createdAt: "asc" },
      });
    }

    if (!organization) {
      return res.status(400).json({
        success: false,
        message: "organizationName is required when no organization exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        fullName: fullName.trim(),
        email: normalizedEmail,
        passwordHash,
        role,
        organizationId: organization.id,
        githubUsername: githubUsername?.trim() || null,
        phone: phone?.trim() || null,
        location: location?.trim() || null,
      },
      select: userSelect,
    });

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user,
      dashboardPath: getDashboardPath(user.role),
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
      include: {
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

    const { passwordHash, ...safeUser } = user;
    const token = generateToken(safeUser);

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: safeUser,
      dashboardPath: getDashboardPath(safeUser.role),
    });
  } catch (error) {
    return next(error);
  }
};

export const me = async (req, res) => {
  return res.json({
    success: true,
    user: req.user,
    dashboardPath: getDashboardPath(req.user.role),
  });
};

export const logout = async (req, res) => {
  return res.json({
    success: true,
    message: "Logout successful",
  });
};
