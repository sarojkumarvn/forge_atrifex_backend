import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import { buildCacheKey, cacheTtl, getOrSetCache } from "./cache.service.js";
import {
  activeProjectStatuses,
  buildProjectRiskMessages,
  calculateAverageHealth,
  calculateAverageProgress,
  calculateDeliverySuccessRate,
  calculateMemberProductivity,
  calculateOrganizationHealth,
  calculateProjectCompletionRate,
  calculateProjectHealth,
  calculateRate,
  calculateTaskCompletionRate,
  calculateTeamProductivity,
  detectProjectRisk,
  isProjectDelayed,
  isTaskOverdue,
  openTaskStatuses,
  projectStatuses,
  taskStatuses,
} from "../utils/reportCalculations.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const userSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  avatar: true,
  organizationId: true,
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
  assignedToId: true,
  assignedTo: {
    select: userSelect,
  },
};

const projectInclude = {
  assignedTeam: {
    include: {
      memberships: {
        include: {
          user: {
            select: userSelect,
          },
        },
      },
      lead: {
        select: userSelect,
      },
    },
  },
  tasks: {
    select: taskSelect,
  },
};

const cacheReport = (user, name, query, factory, id = null) =>
  getOrSetCache(
    buildCacheKey("report", name, user.organizationId, user.id, user.role, id, query || {}),
    cacheTtl.report,
    factory,
  );

const parseDate = (value, fieldName) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, `${fieldName} must be a valid date`);
  }

  return parsedDate;
};

const validateUuid = (id, fieldName) => {
  if (!uuidRegex.test(id)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }
};

const normalizeStatus = (status) => {
  if (!status) {
    return null;
  }

  const normalizedStatus = String(status).trim().toUpperCase();

  if (![...projectStatuses, ...taskStatuses].includes(normalizedStatus)) {
    throw new ApiError(400, "Invalid status filter");
  }

  return normalizedStatus;
};

const parseFilters = (query = {}) => {
  const dateFrom = parseDate(query.dateFrom, "dateFrom");
  const dateTo = parseDate(query.dateTo, "dateTo");

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ApiError(400, "dateFrom must be before dateTo");
  }

  ["projectId", "teamId", "memberId"].forEach((fieldName) => {
    if (query[fieldName]) {
      validateUuid(query[fieldName], fieldName);
    }
  });

  return {
    dateFrom,
    dateTo,
    projectId: query.projectId || null,
    teamId: query.teamId || null,
    memberId: query.memberId || null,
    status: normalizeStatus(query.status),
  };
};

const buildDateWhere = (filters) => {
  if (!filters.dateFrom && !filters.dateTo) {
    return {};
  }

  return {
    createdAt: {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    },
  };
};

const buildTaskFilter = (filters) => ({
  ...buildDateWhere(filters),
  ...(filters.status && taskStatuses.includes(filters.status) ? { status: filters.status } : {}),
  ...(filters.memberId ? { assignedToId: filters.memberId } : {}),
});

const buildProjectFilter = (filters) => ({
  ...buildDateWhere(filters),
  ...(filters.projectId ? { id: filters.projectId } : {}),
  ...(filters.teamId ? { assignedTeamId: filters.teamId } : {}),
  ...(filters.status && projectStatuses.includes(filters.status) ? { status: filters.status } : {}),
});

const buildProjectAccessWhere = (user) => {
  const where = {
    // Restrict report visibility to resources inside the user's organization.
    organizationId: user.organizationId,
  };

  if (user.role === "TEAM_LEAD") {
    where.assignedTeam = {
      leadId: user.id,
    };
  }

  if (user.role === "TEAM_MEMBER") {
    where.assignedTeam = {
      memberships: {
        some: {
          userId: user.id,
        },
      },
    };
  }

  return where;
};

const buildTeamAccessWhere = (user) => ({
  organizationId: user.organizationId,
  ...(user.role === "TEAM_LEAD" ? { leadId: user.id } : {}),
});

const assertReportRole = (user, allowedRoles) => {
  if (!allowedRoles.includes(user.role)) {
    throw new ApiError(403, "Unauthorized");
  }
};

const applyTaskFilters = (tasks, filters) => {
  // Report filtering logic is applied after relation loading so scoped report endpoints share one calculation path.
  return tasks.filter((task) => {
    if (filters.dateFrom && task.createdAt < filters.dateFrom) return false;
    if (filters.dateTo && task.createdAt > filters.dateTo) return false;
    if (filters.memberId && task.assignedToId !== filters.memberId) return false;
    if (filters.status && taskStatuses.includes(filters.status) && task.status !== filters.status) return false;

    return true;
  });
};

const summarizeTasks = (tasks, referenceDate = new Date()) => {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED").length;
  const overdueTasks = tasks.filter((task) => isTaskOverdue(task, referenceDate)).length;
  const blockedTasks = tasks.filter((task) => task.status === "BLOCKED").length;
  const averageProgress = calculateAverageProgress(tasks);

  return {
    totalTasks,
    completedTasks,
    pendingTasks: totalTasks - completedTasks,
    activeTasks: tasks.filter((task) => openTaskStatuses.includes(task.status)).length,
    overdueTasks,
    blockedTasks,
    averageProgress,
    completionRate: calculateTaskCompletionRate(tasks),
  };
};

const formatProjectReport = (project, filters, referenceDate = new Date()) => {
  const tasks = applyTaskFilters(project.tasks, filters);
  const taskSummary = summarizeTasks(tasks, referenceDate);
  const healthScore = calculateProjectHealth({
    progress: project.progress,
    totalTasks: taskSummary.totalTasks,
    completedTasks: taskSummary.completedTasks,
    overdueTasks: taskSummary.overdueTasks,
    blockedTasks: taskSummary.blockedTasks,
  });
  const deliveryRisk = detectProjectRisk({
    totalTasks: taskSummary.totalTasks,
    completionRate: taskSummary.completionRate,
    overdueTasks: taskSummary.overdueTasks,
    blockedTasks: taskSummary.blockedTasks,
    healthScore,
    isDelayed: isProjectDelayed(project, referenceDate),
  });

  const report = {
    projectId: project.id,
    projectName: project.title,
    status: project.status,
    progress: project.progress,
    healthScore,
    totalTasks: taskSummary.totalTasks,
    completedTasks: taskSummary.completedTasks,
    pendingTasks: taskSummary.pendingTasks,
    overdueTasks: taskSummary.overdueTasks,
    blockedTasks: taskSummary.blockedTasks,
    completionRate: taskSummary.completionRate,
    deliveryRisk,
  };

  return {
    ...report,
    metrics: {
      // Generate summary metrics that will later feed AI analysis.
      taskCompletionRate: taskSummary.completionRate,
      overdueRate: calculateRate(taskSummary.overdueTasks, taskSummary.totalTasks),
      blockedTaskRate: calculateRate(taskSummary.blockedTasks, taskSummary.totalTasks),
      averageProgress: taskSummary.averageProgress,
    },
    risks: buildProjectRiskMessages(report),
    recommendations: [],
  };
};

const getAccessibleProject = async (projectId, user) => {
  validateUuid(projectId, "projectId");

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...buildProjectAccessWhere(user),
    },
    include: projectInclude,
  });

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  return project;
};

const getProjectReportUncached = async (user, projectId, query) => {
  assertReportRole(user, ["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"]);
  const filters = parseFilters(query);
  const project = await getAccessibleProject(projectId, user);

  // Generate project report metrics from live task data inside the user's access boundary.
  return formatProjectReport(project, filters);
};

export const getProjectReport = (user, projectId, query) =>
  cacheReport(user, "project", query, () => getProjectReportUncached(user, projectId, query), projectId);

const getTeamReportUncached = async (user, teamId, query) => {
  assertReportRole(user, ["ADMIN", "TEAM_LEAD"]);
  validateUuid(teamId, "teamId");
  const filters = parseFilters(query);

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      ...buildTeamAccessWhere(user),
    },
    include: {
      memberships: true,
      assignedProjects: {
        where: buildProjectFilter({ ...filters, teamId: null }),
        include: projectInclude,
      },
    },
  });

  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  const tasks = team.assignedProjects.flatMap((project) => applyTaskFilters(project.tasks, filters));
  const taskSummary = summarizeTasks(tasks);
  const projectReports = team.assignedProjects.map((project) => formatProjectReport(project, filters));
  const healthScores = projectReports.map((report) => report.healthScore);
  const productivityScore = calculateTeamProductivity({
    totalTasks: taskSummary.totalTasks,
    completedTasks: taskSummary.completedTasks,
    averageProgress: taskSummary.averageProgress,
    overdueTasks: taskSummary.overdueTasks,
    blockedTasks: taskSummary.blockedTasks,
  });
  const teamHealth = calculateAverageHealth(healthScores);
  const risks = projectReports.flatMap((report) => report.risks);

  return {
    teamId: team.id,
    teamName: team.name,
    members: team.memberships.length,
    projects: team.assignedProjects.length,
    activeTasks: taskSummary.activeTasks,
    completedTasks: taskSummary.completedTasks,
    completionRate: taskSummary.completionRate,
    productivityScore,
    teamHealth,
    metrics: {
      // Team productivity metrics are prepared for future executive and AI analysis.
      totalTasks: taskSummary.totalTasks,
      averageProgress: taskSummary.averageProgress,
      overdueRate: calculateRate(taskSummary.overdueTasks, taskSummary.totalTasks),
      blockedTaskRate: calculateRate(taskSummary.blockedTasks, taskSummary.totalTasks),
    },
    risks,
    recommendations: [],
  };
};

export const getTeamReport = (user, teamId, query) =>
  cacheReport(user, "team", query, () => getTeamReportUncached(user, teamId, query), teamId);

const assertMemberReportAccess = async (user, memberId) => {
  validateUuid(memberId, "memberId");

  if (user.role === "TEAM_MEMBER" && user.id !== memberId) {
    throw new ApiError(403, "Unauthorized");
  }

  if (user.role === "ADMIN") {
    return {
      id: memberId,
      organizationId: user.organizationId,
    };
  }

  if (user.role === "TEAM_LEAD") {
    const membership = await prisma.teamMembership.findFirst({
      where: {
        userId: memberId,
        team: {
          organizationId: user.organizationId,
          leadId: user.id,
        },
      },
      select: {
        userId: true,
      },
    });

    if (!membership) {
      throw new ApiError(403, "Unauthorized");
    }
  }

  return {
    id: memberId,
    organizationId: user.organizationId,
  };
};

const getMemberReportUncached = async (user, memberId, query) => {
  assertReportRole(user, ["ADMIN", "TEAM_LEAD", "TEAM_MEMBER"]);
  const filters = parseFilters(query);
  const memberAccess = await assertMemberReportAccess(user, memberId);

  const member = await prisma.user.findFirst({
    where: {
      id: memberAccess.id,
      organizationId: memberAccess.organizationId,
      isActive: true,
    },
    select: userSelect,
  });

  if (!member) {
    throw new ApiError(404, "Member not found");
  }

  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: member.id,
      ...buildTaskFilter({ ...filters, memberId: null }),
      project: {
        organizationId: user.organizationId,
        ...(filters.projectId ? { id: filters.projectId } : {}),
        ...(filters.teamId ? { assignedTeamId: filters.teamId } : {}),
        ...(user.role === "TEAM_LEAD"
          ? {
              assignedTeam: {
                leadId: user.id,
              },
            }
          : {}),
      },
    },
    select: taskSelect,
  });
  const taskSummary = summarizeTasks(tasks);
  const productivityScore = calculateMemberProductivity({
    totalTasks: taskSummary.totalTasks,
    completedTasks: taskSummary.completedTasks,
    averageProgress: taskSummary.averageProgress,
    overdueTasks: taskSummary.overdueTasks,
    blockedTasks: taskSummary.blockedTasks,
  });

  return {
    memberId: member.id,
    name: member.fullName,
    assignedTasks: taskSummary.totalTasks,
    completedTasks: taskSummary.completedTasks,
    completionRate: taskSummary.completionRate,
    overdueTasks: taskSummary.overdueTasks,
    averageProgress: taskSummary.averageProgress,
    productivityScore,
    metrics: {
      // Member productivity metrics summarize individual delivery without exposing other members' data.
      blockedTasks: taskSummary.blockedTasks,
      overdueRate: calculateRate(taskSummary.overdueTasks, taskSummary.totalTasks),
      blockedTaskRate: calculateRate(taskSummary.blockedTasks, taskSummary.totalTasks),
    },
    risks: taskSummary.overdueTasks > 0 ? [`${member.fullName} has overdue assigned tasks`] : [],
    recommendations: [],
  };
};

export const getMemberReport = (user, memberId, query) =>
  cacheReport(user, "member", query, () => getMemberReportUncached(user, memberId, query), memberId);

const getDeliveryReportUncached = async (user, query) => {
  assertReportRole(user, ["ADMIN"]);
  const filters = parseFilters(query);

  const projects = await prisma.project.findMany({
    where: {
      organizationId: user.organizationId,
      ...buildProjectFilter(filters),
    },
    include: projectInclude,
  });
  const projectReports = projects.map((project) => formatProjectReport(project, filters));
  const deliveredProjects = projects.filter((project) => project.status === "COMPLETED").length;
  const delayedProjects = projects.filter((project) => isProjectDelayed(project)).length;
  const activeProjects = projects.filter((project) => activeProjectStatuses.includes(project.status)).length;
  const deliverySuccessRate = calculateDeliverySuccessRate(projects);
  const averageHealthScore = calculateAverageHealth(projectReports.map((report) => report.healthScore));

  return {
    totalProjects: projects.length,
    deliveredProjects,
    delayedProjects,
    activeProjects,
    deliverySuccessRate,
    averageHealthScore,
    metrics: {
      // Delivery calculations use completed projects versus delayed active projects because no deliveredAt field exists yet.
      projectCompletionRate: calculateProjectCompletionRate(projects),
      delayedRate: calculateRate(delayedProjects, projects.length),
      activeRate: calculateRate(activeProjects, projects.length),
    },
    risks: projectReports.flatMap((report) => report.risks),
    recommendations: [],
  };
};

export const getDeliveryReport = (user, query) =>
  cacheReport(user, "delivery", query, () => getDeliveryReportUncached(user, query));

const getExecutiveSummaryUncached = async (user, query) => {
  assertReportRole(user, ["ADMIN"]);
  const filters = parseFilters(query);

  const [totalTeams, totalEmployees, projects] = await Promise.all([
    prisma.team.count({
      where: {
        organizationId: user.organizationId,
        ...(filters.teamId ? { id: filters.teamId } : {}),
      },
    }),
    prisma.user.count({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        ...(filters.memberId ? { id: filters.memberId } : {}),
      },
    }),
    prisma.project.findMany({
      where: {
        organizationId: user.organizationId,
        ...buildProjectFilter(filters),
      },
      include: projectInclude,
    }),
  ]);
  const projectReports = projects.map((project) => formatProjectReport(project, filters));
  const allTasks = projects.flatMap((project) => applyTaskFilters(project.tasks, filters));
  const taskSummary = summarizeTasks(allTasks);
  const deliverySuccessRate = calculateDeliverySuccessRate(projects);
  const averageProjectHealth = calculateAverageHealth(projectReports.map((report) => report.healthScore));
  const organizationHealth = calculateOrganizationHealth({
    averageProjectHealth,
    deliverySuccessRate,
    completionRate: taskSummary.completionRate,
  });
  const teamProductivity = projects.reduce((teams, project) => {
    if (!project.assignedTeam) {
      return teams;
    }

    const existingTeam = teams.get(project.assignedTeam.id) || {
      teamName: project.assignedTeam.name,
      tasks: [],
    };
    existingTeam.tasks.push(...applyTaskFilters(project.tasks, filters));
    teams.set(project.assignedTeam.id, existingTeam);

    return teams;
  }, new Map());
  const lowProductivityRisks = [...teamProductivity.values()]
    .map((team) => {
      const summary = summarizeTasks(team.tasks);
      const productivityScore = calculateTeamProductivity({
        totalTasks: summary.totalTasks,
        completedTasks: summary.completedTasks,
        averageProgress: summary.averageProgress,
        overdueTasks: summary.overdueTasks,
        blockedTasks: summary.blockedTasks,
      });

      return {
        teamName: team.teamName,
        productivityScore,
      };
    })
    .filter((team) => team.productivityScore > 0 && team.productivityScore < 60)
    .map((team) => `${team.teamName} productivity below threshold`);
  const keyRisks = [...new Set([...projectReports.flatMap((report) => report.risks), ...lowProductivityRisks])];

  return {
    organizationHealth,
    totalTeams,
    totalEmployees,
    activeProjects: projects.filter((project) => activeProjectStatuses.includes(project.status)).length,
    completionRate: taskSummary.completionRate,
    deliverySuccessRate,
    keyRisks,
    metrics: {
      // Organization-level summaries are structured so dashboards, exports, and future AI services can reuse them directly.
      totalProjects: projects.length,
      completedProjects: projects.filter((project) => project.status === "COMPLETED").length,
      overdueTasks: taskSummary.overdueTasks,
      blockedTasks: taskSummary.blockedTasks,
      averageProjectHealth,
    },
    risks: keyRisks,
    recommendations: [],
  };
};

export const getExecutiveSummary = (user, query) =>
  cacheReport(user, "executive", query, () => getExecutiveSummaryUncached(user, query));

export const parseReportFilters = parseFilters;
