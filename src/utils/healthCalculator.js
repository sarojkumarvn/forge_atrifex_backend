const clamp = (value, min = 0, max = 100) => Math.min(Math.max(value, min), max);

export const calculateProjectHealth = ({
  progress = 0,
  totalTasks = 0,
  completedTasks = 0,
  blockedTasks = 0,
  overdueTasks = 0,
}) => {
  const completionRate = totalTasks > 0 ? completedTasks / totalTasks : progress / 100;
  const overduePenalty = Math.min(overdueTasks * 8, 30);
  const blockedPenalty = Math.min(blockedTasks * 10, 30);
  const progressPenalty = Math.max(0, 100 - progress) * 0.2;
  const completionBonus = completionRate * 10;

  // Health score combines delivery progress, completion rate, overdue work, and blockers.
  return Math.round(clamp(100 - overduePenalty - blockedPenalty - progressPenalty + completionBonus));
};

export const calculateAverageHealth = (healthScores) => {
  if (!healthScores.length) {
    return 100;
  }

  const totalHealth = healthScores.reduce((sum, score) => sum + score, 0);

  // Organization and team health are the average of visible project health scores.
  return Math.round(clamp(totalHealth / healthScores.length));
};

export const calculateProductivityScore = ({
  totalTasks = 0,
  completedTasks = 0,
  averageProgress = 0,
  overdueTasks = 0,
  blockedTasks = 0,
}) => {
  if (totalTasks === 0) {
    return 0;
  }

  const completionRate = completedTasks / totalTasks;
  const riskPenalty = Math.min(overdueTasks * 5 + blockedTasks * 8, 35);

  // Productivity rewards completed work and current progress, then subtracts risk penalties.
  return Math.round(clamp(completionRate * 70 + (averageProgress / 100) * 30 - riskPenalty));
};
