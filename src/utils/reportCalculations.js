const clamp = (value, min = 0, max = 100) => Math.min(Math.max(value, min), max);

export const activeProjectStatuses = ["PLANNED", "IN_PROGRESS", "ON_HOLD"];
export const openTaskStatuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"];
export const projectStatuses = ["PLANNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"];
export const taskStatuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED", "CANCELLED"];

export const isTaskOverdue = (task, referenceDate = new Date()) => {
  return task.deadline && task.deadline < referenceDate && openTaskStatuses.includes(task.status);
};

export const isProjectDelayed = (project, referenceDate = new Date()) => {
  return project.deadline && project.deadline < referenceDate && activeProjectStatuses.includes(project.status);
};

export const calculateRate = (part, total) => {
  if (!total) {
    return 0;
  }

  return Math.round(clamp((part / total) * 100));
};

export const calculateAverageProgress = (tasks) => {
  if (!tasks.length) {
    return 0;
  }

  // Average progress reflects current task movement even when tasks are not completed yet.
  return Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length);
};

export const calculateTaskCompletionRate = (tasks) => {
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED").length;

  // Completion rate is based on completed tasks versus all tasks visible in the report scope.
  return calculateRate(completedTasks, tasks.length);
};

export const calculateProjectCompletionRate = (projects) => {
  const completedProjects = projects.filter((project) => project.status === "COMPLETED").length;

  // Project completion rate measures delivered projects against all projects in the filtered period.
  return calculateRate(completedProjects, projects.length);
};

export const calculateDeliverySuccessRate = (projects, referenceDate = new Date()) => {
  const completedProjects = projects.filter((project) => project.status === "COMPLETED").length;
  const delayedProjects = projects.filter((project) => isProjectDelayed(project, referenceDate)).length;
  const deliveryBase = completedProjects + delayedProjects;

  // Delivery success rate compares completed projects against projects with a delivery outcome.
  return calculateRate(completedProjects, deliveryBase);
};

export const calculateOverdueRate = (tasks, referenceDate = new Date()) => {
  const overdueTasks = tasks.filter((task) => isTaskOverdue(task, referenceDate)).length;

  // Overdue rate shows how much open work has passed its deadline.
  return calculateRate(overdueTasks, tasks.length);
};

export const calculateBlockedTaskRate = (tasks) => {
  const blockedTasks = tasks.filter((task) => task.status === "BLOCKED").length;

  // Blocked task rate highlights stalled work as a share of total scoped tasks.
  return calculateRate(blockedTasks, tasks.length);
};

export const calculateProjectHealth = ({
  progress = 0,
  totalTasks = 0,
  completedTasks = 0,
  overdueTasks = 0,
  blockedTasks = 0,
}) => {
  const completionRate = totalTasks > 0 ? completedTasks / totalTasks : progress / 100;
  const overduePenalty = Math.min(overdueTasks * 8, 30);
  const blockedPenalty = Math.min(blockedTasks * 10, 30);
  const progressPenalty = Math.max(0, 100 - progress) * 0.2;
  const completionBonus = completionRate * 10;

  // Project health balances progress and completion against overdue and blocked work.
  return Math.round(clamp(100 - overduePenalty - blockedPenalty - progressPenalty + completionBonus));
};

export const calculateTeamProductivity = ({ totalTasks, completedTasks, averageProgress, overdueTasks, blockedTasks }) => {
  if (!totalTasks) {
    return 0;
  }

  const completionRate = completedTasks / totalTasks;
  const riskPenalty = Math.min(overdueTasks * 5 + blockedTasks * 8, 35);

  // Team productivity rewards finished work and average progress while penalizing delivery risks.
  return Math.round(clamp(completionRate * 70 + (averageProgress / 100) * 30 - riskPenalty));
};

export const calculateMemberProductivity = ({
  totalTasks,
  completedTasks,
  averageProgress,
  overdueTasks,
  blockedTasks,
}) => {
  if (!totalTasks) {
    return 0;
  }

  const completionRate = completedTasks / totalTasks;
  const riskPenalty = Math.min(overdueTasks * 6 + blockedTasks * 9, 40);

  // Member productivity weights individual completion slightly higher and penalizes personal blockers.
  return Math.round(clamp(completionRate * 75 + (averageProgress / 100) * 25 - riskPenalty));
};

export const calculateAverageHealth = (healthScores) => {
  if (!healthScores.length) {
    return 100;
  }

  // Organization and team health are averaged from the project health scores in scope.
  return Math.round(clamp(healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length));
};

export const detectProjectRisk = ({ totalTasks, completionRate, overdueTasks, blockedTasks, healthScore, isDelayed }) => {
  const overdueRate = calculateRate(overdueTasks, totalTasks);
  const blockedRate = calculateRate(blockedTasks, totalTasks);

  if (healthScore < 50 || overdueRate >= 40 || blockedRate >= 30 || (isDelayed && completionRate < 60)) {
    return "CRITICAL";
  }

  if (healthScore < 65 || overdueRate >= 25 || blockedRate >= 20 || (isDelayed && completionRate < 75)) {
    return "HIGH";
  }

  if (healthScore < 80 || overdueRate >= 10 || blockedRate >= 10 || isDelayed) {
    return "MEDIUM";
  }

  // Low risk means deadlines, blockers, completion, and health are within expected thresholds.
  return "LOW";
};

export const calculateOrganizationHealth = ({ averageProjectHealth, deliverySuccessRate, completionRate }) => {
  // Organization health blends project health, delivery outcomes, and task completion for executive summaries.
  return Math.round(clamp(averageProjectHealth * 0.45 + deliverySuccessRate * 0.3 + completionRate * 0.25));
};

export const buildProjectRiskMessages = (projectReport) => {
  const risks = [];

  if (projectReport.overdueTasks > 0) {
    risks.push(`${projectReport.projectName} has overdue tasks`);
  }

  if (projectReport.blockedTasks > 0) {
    risks.push(`${projectReport.projectName} has blocked tasks`);
  }

  if (projectReport.completionRate < 50 && projectReport.totalTasks > 0) {
    risks.push(`${projectReport.projectName} completion is below 50%`);
  }

  if (projectReport.deliveryRisk === "HIGH" || projectReport.deliveryRisk === "CRITICAL") {
    risks.push(`${projectReport.projectName} delivery risk is ${projectReport.deliveryRisk}`);
  }

  return risks;
};
