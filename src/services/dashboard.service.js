import prisma from "../config/prisma.js";
import { buildCacheKey, cacheTtl, getOrSetCache } from "./cache.service.js";
import {
  calculateAverageHealth,
  calculateProductivityScore,
  calculateProjectHealth,
} from "../utils/healthCalculator.js";

const activeProjectStatuses = ["PLANNED", "IN_PROGRESS", "ON_HOLD"];
const openTaskStatuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"];
const now = () => new Date();

const userSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  githubUsername: true,
  avatar: true,
  isActive: true,
};

const taskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  progress: true,
  deadline: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: {
    select: userSelect,
  },
};

const projectHealthSelect = {
  id: true,
  title: true,
  status: true,
  progress: true,
  deadline: true,
  assignedTeam: {
    select: {
      id: true,
      name: true,
    },
  },
  tasks: {
    select: taskSelect,
  },
};

const cacheDashboard = (user, name, factory, scope = {}) =>
  getOrSetCache(
    buildCacheKey("dashboard", name, user.organizationId, user.id, user.role, scope),
    cacheTtl.dashboard,
    factory,
  );

const isTaskOverdue = (task) => {
  return task.deadline && task.deadline < now() && !["COMPLETED", "CANCELLED"].includes(task.status);
};

const getProjectHealthInput = (project) => {
  const totalTasks = project.tasks.length;
  const completedTasks = project.tasks.filter((task) => task.status === "COMPLETED").length;
  const blockedTasks = project.tasks.filter((task) => task.status === "BLOCKED").length;
  const overdueTasks = project.tasks.filter(isTaskOverdue).length;

  return {
    progress: project.progress,
    totalTasks,
    completedTasks,
    blockedTasks,
    overdueTasks,
  };
};

const formatProjectHealth = (project) => {
  const healthInput = getProjectHealthInput(project);
  const healthScore = calculateProjectHealth(healthInput);

  return {
    id: project.id,
    title: project.title,
    status: project.status,
    progress: project.progress,
    deadline: project.deadline,
    assignedTeam: project.assignedTeam,
    healthScore,
    ...healthInput,
  };
};

const buildTaskWhereForOrganization = (organizationId) => ({
  // Restrict analytics to the user's organization through project ownership.
  project: {
    organizationId,
  },
});

const getLeadTeamIds = async (user) => {
  const teams = await prisma.team.findMany({
    where: {
      organizationId: user.organizationId,
      leadId: user.id,
    },
    select: {
      id: true,
    },
  });

  // Team lead dashboards should only include teams managed by that lead.
  return teams.map((team) => team.id);
};

const getTeamProjectIds = async (teamIds, organizationId) => {
  const projects = await prisma.project.findMany({
    where: {
      organizationId,
      assignedTeamId: {
        in: teamIds,
      },
    },
    select: {
      id: true,
    },
  });

  return projects.map((project) => project.id);
};

const getAverageProgress = (tasks) => {
  if (!tasks.length) {
    return 0;
  }

  return Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length);
};

const getCompletionSpeedDays = (tasks) => {
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED");

  if (!completedTasks.length) {
    return null;
  }

  const totalDays = completedTasks.reduce((sum, task) => {
    return sum + Math.max((task.updatedAt - task.createdAt) / (1000 * 60 * 60 * 24), 0);
  }, 0);

  // Completion speed is estimated from task creation to last update because the schema has no completedAt field.
  return Number((totalDays / completedTasks.length).toFixed(2));
};

const getAdminSummaryUncached = async (user) => {
  const organizationId = user.organizationId;
  const taskWhere = buildTaskWhereForOrganization(organizationId);
  const [
    totalProjects,
    activeProjects,
    completedProjects,
    totalTeams,
    totalEmployees,
    totalTasks,
    completedTasks,
    overdueTasks,
    projects,
  ] = await Promise.all([
    prisma.project.count({ where: { organizationId } }),
    prisma.project.count({ where: { organizationId, status: { in: activeProjectStatuses } } }),
    prisma.project.count({ where: { organizationId, status: "COMPLETED" } }),
    prisma.team.count({ where: { organizationId } }),
    prisma.user.count({ where: { organizationId, isActive: true } }),
    prisma.task.count({ where: taskWhere }),
    prisma.task.count({ where: { ...taskWhere, status: "COMPLETED" } }),
    prisma.task.count({
      where: {
        ...taskWhere,
        deadline: {
          lt: now(),
        },
        status: {
          in: openTaskStatuses,
        },
      },
    }),
    prisma.project.findMany({
      where: { organizationId },
      select: projectHealthSelect,
    }),
  ]);
  const organizationHealth = calculateAverageHealth(projects.map((project) => formatProjectHealth(project).healthScore));

  return {
    totalProjects,
    activeProjects,
    completedProjects,
    totalTeams,
    totalEmployees,
    totalTasks,
    completedTasks,
    overdueTasks,
    organizationHealth,
  };
};

export const getAdminSummary = (user) => cacheDashboard(user, "admin-summary", () => getAdminSummaryUncached(user));

const getAdminDeliveryHealthUncached = async (user) => {
  const organizationId = user.organizationId;
  const [projects, teams, overdueProjects, blockedProjects] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId },
      select: projectHealthSelect,
      orderBy: { createdAt: "desc" },
    }),
    prisma.team.findMany({
      where: { organizationId },
      include: {
        assignedProjects: {
          select: projectHealthSelect,
        },
      },
    }),
    prisma.project.findMany({
      where: {
        organizationId,
        deadline: { lt: now() },
        status: { in: activeProjectStatuses },
      },
      select: {
        id: true,
        title: true,
        deadline: true,
        status: true,
      },
    }),
    prisma.project.findMany({
      where: {
        organizationId,
        tasks: {
          some: {
            status: "BLOCKED",
          },
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    }),
  ]);
  const projectHealth = projects.map(formatProjectHealth);
  const teamHealth = teams.map((team) => {
    const healthScores = team.assignedProjects.map((project) => formatProjectHealth(project).healthScore);

    return {
      id: team.id,
      name: team.name,
      projectCount: team.assignedProjects.length,
      healthScore: calculateAverageHealth(healthScores),
    };
  });

  return {
    projectHealth,
    teamHealth,
    overdueProjects,
    blockedProjects,
    riskIndicators: {
      overdueProjectCount: overdueProjects.length,
      blockedProjectCount: blockedProjects.length,
      lowHealthProjects: projectHealth.filter((project) => project.healthScore < 70),
    },
  };
};

export const getAdminDeliveryHealth = (user) =>
  cacheDashboard(user, "admin-delivery-health", () => getAdminDeliveryHealthUncached(user));

const getAdminContributionAnalyticsUncached = async (user) => {
  const teams = await prisma.team.findMany({
    where: {
      organizationId: user.organizationId,
    },
    include: {
      memberships: {
        include: {
          user: {
            select: userSelect,
          },
        },
      },
      assignedProjects: {
        select: {
          id: true,
          tasks: {
            select: taskSelect,
          },
        },
      },
    },
  });

  return teams.map((team) => {
    const tasks = team.assignedProjects.flatMap((project) => project.tasks);
    const completedTasks = tasks.filter((task) => task.status === "COMPLETED").length;
    const overdueTasks = tasks.filter(isTaskOverdue).length;
    const blockedTasks = tasks.filter((task) => task.status === "BLOCKED").length;

    return {
      teamId: team.id,
      teamName: team.name,
      members: team.memberships.map((membership) => membership.user),
      completedTasks,
      openTasks: tasks.length - completedTasks,
      productivityScore: calculateProductivityScore({
        totalTasks: tasks.length,
        completedTasks,
        averageProgress: getAverageProgress(tasks),
        overdueTasks,
        blockedTasks,
      }),
    };
  });
};

export const getAdminContributionAnalytics = (user) =>
  cacheDashboard(user, "admin-contribution", () => getAdminContributionAnalyticsUncached(user));

const getTeamLeadSummaryUncached = async (user) => {
  const teamIds = await getLeadTeamIds(user);
  const taskWhere = {
    project: {
      organizationId: user.organizationId,
      assignedTeamId: {
        in: teamIds,
      },
    },
  };
  const [teamProjects, teamMembers, activeTasks, completedTasks, blockedTasks, projects] = await Promise.all([
    prisma.project.count({
      where: {
        organizationId: user.organizationId,
        assignedTeamId: { in: teamIds },
      },
    }),
    prisma.teamMembership.count({
      where: {
        teamId: { in: teamIds },
      },
    }),
    prisma.task.count({
      where: {
        ...taskWhere,
        status: { in: openTaskStatuses },
      },
    }),
    prisma.task.count({
      where: {
        ...taskWhere,
        status: "COMPLETED",
      },
    }),
    prisma.task.count({
      where: {
        ...taskWhere,
        status: "BLOCKED",
      },
    }),
    prisma.project.findMany({
      where: {
        organizationId: user.organizationId,
        assignedTeamId: { in: teamIds },
      },
      select: projectHealthSelect,
    }),
  ]);

  return {
    teamProjects,
    teamMembers,
    activeTasks,
    completedTasks,
    blockedTasks,
    teamHealth: calculateAverageHealth(projects.map((project) => formatProjectHealth(project).healthScore)),
  };
};

export const getTeamLeadSummary = (user) =>
  cacheDashboard(user, "team-lead-summary", () => getTeamLeadSummaryUncached(user));

const getTeamLeadAnalyticsUncached = async (user) => {
  const teamIds = await getLeadTeamIds(user);
  const memberships = await prisma.teamMembership.findMany({
    where: {
      teamId: { in: teamIds },
    },
    include: {
      user: {
        select: userSelect,
      },
    },
  });
  const projectIds = await getTeamProjectIds(teamIds, user.organizationId);
  const tasks = await prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
    },
    select: taskSelect,
  });

  return memberships.map((membership) => {
    const memberTasks = tasks.filter((task) => task.assignedTo?.id === membership.userId);
    const completedTasks = memberTasks.filter((task) => task.status === "COMPLETED").length;

    return {
      member: membership.user,
      assignedTasks: memberTasks.length,
      completedTasks,
      openTasks: memberTasks.length - completedTasks,
      completionRate: memberTasks.length ? Math.round((completedTasks / memberTasks.length) * 100) : 0,
      averageProgress: getAverageProgress(memberTasks),
      workloadDistribution: {
        todo: memberTasks.filter((task) => task.status === "TODO").length,
        inProgress: memberTasks.filter((task) => task.status === "IN_PROGRESS").length,
        inReview: memberTasks.filter((task) => task.status === "IN_REVIEW").length,
        blocked: memberTasks.filter((task) => task.status === "BLOCKED").length,
      },
    };
  });
};

export const getTeamLeadAnalytics = (user) =>
  cacheDashboard(user, "team-lead-analytics", () => getTeamLeadAnalyticsUncached(user));

const getTeamLeadIssuesUncached = async (user) => {
  const teamIds = await getLeadTeamIds(user);
  const projectIds = await getTeamProjectIds(teamIds, user.organizationId);
  const [blockedTasks, overdueTasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        status: "BLOCKED",
      },
      select: {
        ...taskSelect,
        project: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        assignedTo: {
          select: userSelect,
        },
      },
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        deadline: { lt: now() },
        status: { in: openTaskStatuses },
      },
      select: {
        ...taskSelect,
        project: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        assignedTo: {
          select: userSelect,
        },
      },
    }),
    prisma.project.findMany({
      where: {
        id: { in: projectIds },
      },
      select: projectHealthSelect,
    }),
  ]);

  return {
    blockedTasks,
    overdueTasks,
    projectRisks: projects.map(formatProjectHealth).filter((project) => project.healthScore < 75),
  };
};

export const getTeamLeadIssues = (user) =>
  cacheDashboard(user, "team-lead-issues", () => getTeamLeadIssuesUncached(user));

const getMemberSummaryUncached = async (user) => {
  const taskWhere = {
    project: {
      organizationId: user.organizationId,
    },
    assignedToId: user.id,
  };
  const [assignedTasks, completedTasks, overdueTasks, upcomingDeadlines] = await Promise.all([
    prisma.task.count({ where: taskWhere }),
    prisma.task.count({ where: { ...taskWhere, status: "COMPLETED" } }),
    prisma.task.count({
      where: {
        ...taskWhere,
        deadline: { lt: now() },
        status: { in: openTaskStatuses },
      },
    }),
    prisma.task.count({
      where: {
        ...taskWhere,
        deadline: {
          gte: now(),
          lte: new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        status: { in: openTaskStatuses },
      },
    }),
  ]);

  return {
    assignedTasks,
    completedTasks,
    remainingTasks: assignedTasks - completedTasks,
    overdueTasks,
    upcomingDeadlines,
  };
};

export const getMemberSummary = (user) => cacheDashboard(user, "member-summary", () => getMemberSummaryUncached(user));

const getMemberActivityUncached = async (user) => {
  const [recentCompletedTasks, recentUpdates, recentNotifications] = await Promise.all([
    prisma.task.findMany({
      where: {
        assignedToId: user.id,
        status: "COMPLETED",
        project: {
          organizationId: user.organizationId,
        },
      },
      select: {
        ...taskSelect,
        project: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 10,
    }),
    prisma.activityLog.findMany({
      where: {
        organizationId: user.organizationId,
        actorId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    }),
    prisma.notification.findMany({
      where: {
        recipientId: user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    }),
  ]);

  return {
    recentCompletedTasks,
    recentUpdates,
    recentNotifications,
  };
};

export const getMemberActivity = (user) =>
  cacheDashboard(user, "member-activity", () => getMemberActivityUncached(user));

const getMemberPerformanceUncached = async (user) => {
  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: user.id,
      project: {
        organizationId: user.organizationId,
      },
    },
    select: taskSelect,
  });
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED").length;
  const overdueTasks = tasks.filter(isTaskOverdue).length;
  const blockedTasks = tasks.filter((task) => task.status === "BLOCKED").length;

  return {
    totalTasks: tasks.length,
    completedTasks,
    completionPercentage: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
    averageProgress: getAverageProgress(tasks),
    averageCompletionSpeedDays: getCompletionSpeedDays(tasks),
    productivityScore: calculateProductivityScore({
      totalTasks: tasks.length,
      completedTasks,
      averageProgress: getAverageProgress(tasks),
      overdueTasks,
      blockedTasks,
    }),
  };
};

export const getMemberPerformance = (user) =>
  cacheDashboard(user, "member-performance", () => getMemberPerformanceUncached(user));
