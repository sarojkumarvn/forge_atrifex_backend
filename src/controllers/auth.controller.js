import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import generateToken from "../utils/generateToken.js";
import getDashboardPath from "../utils/dashboardPath.js";
import { formatSafeUser, safeUserSelect } from "../utils/safeUser.js";

const validRoles = new Set(["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"]);

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

    const normalizedOrganizationName = organizationName?.trim();

    if (!normalizedOrganizationName) {
      // Never auto-join the first organization because it breaks tenant isolation.
      return res.status(400).json({
        success: false,
        message: "organizationName is required",
      });
    }

    const existingOrganization = await prisma.organization.findFirst({
      where: { name: normalizedOrganizationName },
    });

    if (existingOrganization && role === "ADMIN") {
      // Public registration cannot create admins inside existing organizations.
      return res.status(403).json({
        success: false,
        message: "Public registration cannot create admins inside existing organizations",
      });
    }

    const assignedRole = existingOrganization ? role || "TEAM_MEMBER" : "ADMIN";
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const organization =
        existingOrganization ||
        (await tx.organization.create({
          data: { name: normalizedOrganizationName },
        }));

      return tx.user.create({
        data: {
          fullName: fullName.trim(),
          email: normalizedEmail,
          passwordHash,
          role: assignedRole,
          organizationId: organization.id,
          githubUsername: githubUsername?.trim() || null,
          phone: phone?.trim() || null,
          location: location?.trim() || null,
        },
        // Use explicit selects so secret-bearing fields can never leak in auth responses.
        select: safeUserSelect,
      });
    });

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
