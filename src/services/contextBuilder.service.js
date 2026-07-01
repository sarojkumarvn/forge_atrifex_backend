import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import { buildCacheKey, cacheTtl, getOrSetCache } from "./cache.service.js";
import {
  buildProjectRiskMessages,
  calculateAverageHealth,
  calculateAverageProgress,
  calculateMemberProductivity,
  calculateProjectHealth,
  calculateRate,
  calculateTaskCompletionRate,
  calculateTeamProductivity,
  detectProjectRisk,
  isProjectDelayed,
  isTaskOverdue,
  openTaskStatuses,
} from "../utils/reportCalculations.js";
import { getDeliveryReport, getExecutiveSummary, getTeamReport } from "./report.service.js";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const taskContextLimit = 30;
const activityContextLimit = 20;
const taskMetricLimit = 200;

const userSelect = {
  id: true,
  fullName: true,
  role: true,
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
  assignedBy: {
    select: userSelect,
  },
};

const projectSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  progress: true,
  deadline: true,
  githubRepositoryOwner: true,
  githubRepositoryName: true,
  githubDefaultBranch: true,
  createdAt: true,
  updatedAt: true,
  assignedTeam: {
    select: {
      id: true,
      name: true,
      description: true,
      lead: {
        select: userSelect,
      },
      memberships: {
        include: {
          user: {
            select: userSelect,
          },
        },
      },
    },
  },
  createdBy: {
    select: userSelect,
  },
  tasks: {
    select: taskSelect,
    orderBy: [{ status: "asc" }, { deadline: "asc" }, { updatedAt: "desc" }],
    // Limit historical records to reduce token usage and response latency.
    take: taskMetricLimit,
  },
};

const cacheAiContext = (user, name, id, factory) =>
  getOrSetCache(
    buildCacheKey("ai-context", name, user.organizationId, user.id, user.role, id),
    cacheTtl.aiContext,
    factory,
  );

const validateUuid = (id, fieldName) => {
  if (!uuidRegex.test(id)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }
};

const buildProjectAccessWhere = (user) => ({
  organizationId: user.organizationId,
  ...(user.role === "TEAM_LEAD"
    ? {
        assignedTeam: {
          leadId: user.id,
        },
      }
    : {}),
});

const buildTeamAccessWhere = (user) => ({
  organizationId: user.organizationId,
  ...(user.role === "TEAM_LEAD" ? { leadId: user.id } : {}),
});

const countBy = (items, field) =>
  items.reduce((counts, item) => {
    counts[item[field]] = (counts[item[field]] || 0) + 1;
    return counts;
  }, {});

const summarizeTasks = (tasks, referenceDate = new Date()) => {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED").length;
  const overdueTasks = tasks.filter((task) => isTaskOverdue(task, referenceDate)).length;
  const blockedTasks = tasks.filter((task) => task.status === "BLOCKED").length;
  const averageProgress = calculateAverageProgress(tasks);

  return {
    totalTasks,
    completedTasks,
    openTasks: tasks.filter((task) => openTaskStatuses.includes(task.status)).length,
    overdueTasks,
    blockedTasks,
    averageProgress,
    completionRate: calculateTaskCompletionRate(tasks),
    statusBreakdown: countBy(tasks, "status"),
    priorityBreakdown: countBy(tasks, "priority"),
  };
};

const calculateProjectMetrics = (project, referenceDate = new Date()) => {
  const taskSummary = summarizeTasks(project.tasks, referenceDate);
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

  const reportShape = {
    projectName: project.title,
    totalTasks: taskSummary.totalTasks,
    overdueTasks: taskSummary.overdueTasks,
    blockedTasks: taskSummary.blockedTasks,
    completionRate: taskSummary.completionRate,
    deliveryRisk,
  };

  return {
    progress: project.progress,
    healthScore,
    deliveryRisk,
    isDelayed: isProjectDelayed(project, referenceDate),
    taskSummary,
    riskSignals: buildProjectRiskMessages(reportShape),
    overdueRate: calculateRate(taskSummary.overdueTasks, taskSummary.totalTasks),
    blockedTaskRate: calculateRate(taskSummary.blockedTasks, taskSummary.totalTasks),
  };
};

const compactTask = (task) => ({
  id: task.id,
  title: task.title,
  status: task.status,
  priority: task.priority,
  progress: task.progress,
  deadline: task.deadline,
  assignedTo: task.assignedTo?.fullName || null,
  updatedAt: task.updatedAt,
});

const daysBetween = (from, to = new Date()) => Math.max(0, Math.ceil((new Date(to) - new Date(from)) / 86400000));

const getGithubActivitySummary = (activityLogs) => {
  const githubLogs = activityLogs.filter((activity) => String(activity.action).startsWith("GITHUB_"));

  return {
    recentEvents: githubLogs.length,
    lastEventAt: githubLogs[0]?.createdAt || null,
    actions: countBy(githubLogs, "action"),
  };
};

const getProductivitySummary = (tasks) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentlyCompleted = tasks.filter((task) => task.status === "COMPLETED" && new Date(task.updatedAt) >= sevenDaysAgo);
  const recentlyUpdated = tasks.filter((task) => new Date(task.updatedAt) >= sevenDaysAgo);

  return {
    recentlyCompletedTasks: recentlyCompleted.length,
    recentlyUpdatedTasks: recentlyUpdated.length,
    recentCompletionRate: calculateRate(recentlyCompleted.length, recentlyUpdated.length || tasks.length),
  };
};

const buildDeliveryTrend = (project, metrics) => {
  if (!project.deadline) return "NO_DEADLINE";
  if (metrics.isDelayed) return "DELAYED";
  if (daysBetween(project.createdAt, project.deadline) <= 14 && metrics.taskSummary.completionRate < 70) return "AT_RISK";
  return metrics.taskSummary.completionRate >= 80 ? "ON_TRACK" : "WATCH";
};

const getRecentActivity = async ({ organizationId, entityIds }) => {
  return prisma.activityLog.findMany({
    where: {
      // Activity context is scoped to the caller organization before it reaches the AI provider.
      organizationId,
      entityId: {
        in: entityIds,
      },
    },
    select: {
      action: true,
      entityType: true,
      entityId: true,
      metadata: true,
      createdAt: true,
      actor: {
        select: userSelect,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: activityContextLimit,
  });
};

const getAccessibleProject = async (user, projectId) => {
  validateUuid(projectId, "projectId");

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      ...buildProjectAccessWhere(user),
    },
    select: projectSelect,
  });

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  return project;
};

const buildProjectBaseContext = async (user, projectId) => {
  const project = await getAccessibleProject(user, projectId);
  const metrics = calculateProjectMetrics(project);
  const activityLogs = await getRecentActivity({
    organizationId: user.organizationId,
    entityIds: [project.id, ...project.tasks.map((task) => task.id)],
  });

  const context = {
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      deadline: project.deadline,
      githubRepository:
        project.githubRepositoryOwner && project.githubRepositoryName
          ? {
              owner: project.githubRepositoryOwner,
              name: project.githubRepositoryName,
              defaultBranch: project.githubDefaultBranch,
            }
          : null,
      assignedTeam: project.assignedTeam
        ? {
            id: project.assignedTeam.id,
            name: project.assignedTeam.name,
            lead: project.assignedTeam.lead.fullName,
            memberCount: project.assignedTeam.memberships.length,
          }
        : null,
      createdBy: project.createdBy.fullName,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    metrics,
    // Limit task history to reduce token consumption while preserving high-risk and recently updated work.
    tasks: project.tasks.slice(0, taskContextLimit).map(compactTask),
    // Recent activity gives the model delivery context without exposing full audit history.
    activityLogs,
    teamMembers:
      project.assignedTeam?.memberships.map((membership) => ({
        id: membership.user.id,
        name: membership.user.fullName,
        role: membership.user.role,
      })) || [],
  };

  Object.defineProperties(context, {
    rawTasks: {
      value: project.tasks,
      enumerable: false,
    },
    rawTeamMemberships: {
      value: project.assignedTeam?.memberships || [],
      enumerable: false,
    },
  });

  return context;
};

export const buildProjectAnalysisContext = async (user, projectId) => {
  // Build project context from live metrics before sending to AI.
  return cacheAiContext(user, "project-analysis", projectId, () => buildProjectBaseContext(user, projectId));
};

export const buildRiskAnalysisContext = async (user, projectId) => {
  const context = await cacheAiContext(user, "risk-analysis-base", projectId, () => buildProjectBaseContext(user, projectId));

  return {
    project: context.project,
    metrics: context.metrics,
    riskInputs: {
      overdueTasks: context.tasks.filter((task) => task.deadline && new Date(task.deadline) < new Date()),
      blockedTasks: context.tasks.filter((task) => task.status === "BLOCKED"),
      lowHealthScore: context.metrics.healthScore < 65,
      delayedProject: context.metrics.isDelayed,
    },
    activityLogs: context.activityLogs,
  };
};

export const buildTeamAnalysisContext = async (user, teamId) => {
  return cacheAiContext(user, "team-analysis", teamId, async () => {
    validateUuid(teamId, "teamId");

    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        ...buildTeamAccessWhere(user),
      },
      include: {
        lead: {
          select: userSelect,
        },
        memberships: {
          include: {
            user: {
              select: userSelect,
            },
          },
        },
        assignedProjects: {
          select: projectSelect,
          orderBy: {
            updatedAt: "desc",
          },
          take: 25,
        },
      },
    });

    if (!team) {
      throw new ApiError(404, "Team not found");
    }

    const allTasks = team.assignedProjects.flatMap((project) => project.tasks);
    const taskSummary = summarizeTasks(allTasks);
    const projectMetrics = team.assignedProjects.map((project) => ({
      projectId: project.id,
      projectName: project.title,
      status: project.status,
      metrics: calculateProjectMetrics(project),
    }));
    const memberPerformance = team.memberships.map((membership) => {
      const memberTasks = allTasks.filter((task) => task.assignedToId === membership.userId);
      const memberSummary = summarizeTasks(memberTasks);

      return {
        memberId: membership.user.id,
        name: membership.user.fullName,
        assignedTasks: memberSummary.totalTasks,
        completedTasks: memberSummary.completedTasks,
        overdueTasks: memberSummary.overdueTasks,
        blockedTasks: memberSummary.blockedTasks,
        completionRate: memberSummary.completionRate,
        productivityScore: calculateMemberProductivity(memberSummary),
      };
    });
    const teamReport = await getTeamReport(user, teamId, {});

    return {
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        lead: team.lead.fullName,
        memberCount: team.memberships.length,
        projectCount: team.assignedProjects.length,
      },
      report: teamReport,
      metrics: {
        taskSummary,
        productivityScore: calculateTeamProductivity(taskSummary),
        averageProjectHealth: calculateAverageHealth(projectMetrics.map((project) => project.metrics.healthScore)),
      },
      memberPerformance,
      projectMetrics,
    };
  });
};

export const buildTaskSuggestionContext = async (user, projectId) => {
  return cacheAiContext(user, "task-suggestions", projectId, async () => {
  const context = await buildProjectBaseContext(user, projectId);

  if (!context.project.assignedTeam) {
    throw new ApiError(400, "Project must be assigned to a team before AI task suggestions can be generated");
  }

  const openTasks = context.rawTasks.filter((task) => openTaskStatuses.includes(task.status));
  const teamMemberIds = context.rawTeamMemberships.map((membership) => membership.userId);
  const teamTasks = await prisma.task.findMany({
    where: {
      assignedToId: {
        in: teamMemberIds,
      },
      project: {
        organizationId: user.organizationId,
      },
    },
    select: taskSelect,
    orderBy: [{ status: "asc" }, { deadline: "asc" }, { updatedAt: "desc" }],
    take: taskMetricLimit,
  });

  const memberWorkload = context.rawTeamMemberships.map((membership) => {
    const memberTasks = teamTasks.filter((task) => task.assignedToId === membership.userId);
    const memberSummary = summarizeTasks(memberTasks);

    return {
      memberId: membership.user.id,
      name: membership.user.fullName,
      activeTasks: memberSummary.openTasks,
      overdueTasks: memberSummary.overdueTasks,
      blockedTasks: memberSummary.blockedTasks,
      completionRate: memberSummary.completionRate,
      productivityScore: calculateMemberProductivity(memberSummary),
    };
  });

  return {
    project: context.project,
    projectMetrics: context.metrics,
    // Recommendation generation only receives open tasks because completed work should not be reassigned.
    openTasks: openTasks.slice(0, taskContextLimit).map(compactTask),
    memberWorkload,
  };
  });
};

export const buildProjectHealthContext = async (user, projectId) => {
  return cacheAiContext(user, "project-health", projectId, async () => {
    const context = await buildProjectBaseContext(user, projectId);

    return {
      project: context.project,
      metrics: context.metrics,
      overdueTasks: context.tasks.filter((task) => task.deadline && new Date(task.deadline) < new Date()),
      blockedTasks: context.tasks.filter((task) => task.status === "BLOCKED"),
      milestoneProgress: {
        projectProgress: context.metrics.progress,
        taskCompletionRate: context.metrics.taskSummary.completionRate,
      },
      githubActivity: getGithubActivitySummary(context.activityLogs),
      recentProductivity: getProductivitySummary(context.rawTasks),
      deliveryTrend: buildDeliveryTrend(
        {
          createdAt: context.project.createdAt,
          deadline: context.project.deadline,
        },
        context.metrics,
      ),
      activityLogs: context.activityLogs,
    };
  });
};

export const buildSmartTaskAssignmentContext = async (user, projectId) => {
  return cacheAiContext(user, "smart-task-assignment", projectId, async () => {
    const context = await buildTaskSuggestionContext(user, projectId);

    return {
      ...context,
      assignmentSignals: {
        skillsAvailable: false,
        roleWeighting: "Prefer active team members with lower active task count and stronger completion rate.",
      },
    };
  });
};

export const buildSprintPlanContext = async (user, projectId) => {
  return cacheAiContext(user, "sprint-plan", projectId, async () => {
    const context = await buildProjectBaseContext(user, projectId);
    const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const candidateTasks = context.rawTasks
      .filter((task) => openTaskStatuses.includes(task.status))
      .sort(
        (a, b) =>
          priorityOrder[a.priority] - priorityOrder[b.priority] ||
          new Date(a.deadline || 8640000000000000) - new Date(b.deadline || 8640000000000000),
      );

    return {
      project: context.project,
      metrics: context.metrics,
      candidateTasks: candidateTasks.slice(0, taskContextLimit).map(compactTask),
      teamMembers: context.teamMembers,
      recentProductivity: getProductivitySummary(context.rawTasks),
    };
  });
};

export const buildDailyStandupContext = async (user, teamId) => {
  return cacheAiContext(user, "daily-standup", teamId, async () => {
    const context = await buildTeamAnalysisContext(user, teamId);
    const activityLogs = await getRecentActivity({
      organizationId: user.organizationId,
      entityIds: context.projectMetrics.map((project) => project.projectId),
    });

    return {
      team: context.team,
      metrics: context.metrics,
      memberPerformance: context.memberPerformance,
      projectMetrics: context.projectMetrics,
      activityLogs,
    };
  });
};

export const buildWeeklyReportContext = async (user, projectId) => {
  return cacheAiContext(user, "weekly-report", projectId, async () => {
    const context = await buildProjectBaseContext(user, projectId);

    return {
      project: context.project,
      metrics: context.metrics,
      tasks: context.tasks,
      recentProductivity: getProductivitySummary(context.rawTasks),
      githubActivity: getGithubActivitySummary(context.activityLogs),
      activityLogs: context.activityLogs,
    };
  });
};

export const buildTeamCoachingContext = async (user, teamId) => {
  return cacheAiContext(user, "team-coaching", teamId, () => buildTeamAnalysisContext(user, teamId));
};

export const buildRiskPredictionContext = async (user, projectId) => {
  return cacheAiContext(user, "risk-prediction", projectId, async () => {
    const context = await buildProjectBaseContext(user, projectId);

    return {
      project: context.project,
      metrics: context.metrics,
      deadlineSignals: {
        deadline: context.project.deadline,
        isDelayed: context.metrics.isDelayed,
        deliveryTrend: buildDeliveryTrend(
          {
            createdAt: context.project.createdAt,
            deadline: context.project.deadline,
          },
          context.metrics,
        ),
      },
      workloadSignals: context.teamMembers.map((member) => ({
        memberId: member.id,
        name: member.name,
        activeTasks: context.rawTasks.filter((task) => task.assignedToId === member.id && openTaskStatuses.includes(task.status)).length,
      })),
      riskSignals: context.metrics.riskSignals,
      githubActivity: getGithubActivitySummary(context.activityLogs),
    };
  });
};

export const buildExecutiveSummaryContext = async (user) => {
  return cacheAiContext(user, "executive-summary", null, async () => {
  if (user.role !== "ADMIN") {
    throw new ApiError(403, "Unauthorized");
  }

  const [organization, deliveryReport, executiveReport, teams, projects] = await Promise.all([
    prisma.organization.findFirst({
      where: {
        id: user.organizationId,
      },
      select: {
        id: true,
        name: true,
        description: true,
      },
    }),
    getDeliveryReport(user, {}),
    getExecutiveSummary(user, {}),
    prisma.team.findMany({
      where: {
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        name: true,
        lead: {
          select: userSelect,
        },
        _count: {
          select: {
            memberships: true,
            assignedProjects: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
    }),
    prisma.project.findMany({
      where: {
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        progress: true,
        deadline: true,
        tasks: {
          select: taskSelect,
          orderBy: [{ status: "asc" }, { deadline: "asc" }, { updatedAt: "desc" }],
          take: taskContextLimit,
        },
        assignedTeam: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 20,
    }),
  ]);

  const projectSummaries = projects.map((project) => ({
    id: project.id,
    title: project.title,
    status: project.status,
    team: project.assignedTeam?.name || null,
    deadline: project.deadline,
    metrics: calculateProjectMetrics(project),
  }));

  return {
    organization,
    // Report summarization reuses existing analytics reports instead of recalculating executive metrics in prompts.
    reports: {
      deliveryReport,
      executiveReport,
    },
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      lead: team.lead.fullName,
      members: team._count.memberships,
      projects: team._count.assignedProjects,
    })),
    projectSummaries,
  };
  });
};
