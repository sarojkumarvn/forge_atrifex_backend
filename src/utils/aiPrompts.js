const stringifyContext = (context) => JSON.stringify(context, null, 2);

const baseSystemPrompt = `You are Forge AtriFex AI, an engineering delivery intelligence assistant.
Use only the supplied JSON context.
Return valid JSON only.
Do not include markdown, comments, or extra prose.
Keep recommendations practical, specific, and tied to the metrics provided.`;

export const promptRegistry = {
  projectAnalysis: { version: "1.0.0", description: "Project delivery analysis", createdAt: "2026-06-20" },
  riskAnalysis: { version: "1.0.0", description: "Project delivery risk analysis", createdAt: "2026-06-20" },
  teamAnalysis: { version: "1.0.0", description: "Team performance analysis", createdAt: "2026-06-20" },
  taskSuggestions: { version: "1.0.0", description: "Basic task assignment suggestions", createdAt: "2026-06-20" },
  executiveSummary: { version: "1.0.0", description: "Executive organization summary", createdAt: "2026-06-20" },
  projectHealth: { version: "1.0.0", description: "Project health advisor", createdAt: "2026-07-01" },
  taskAssignment: { version: "1.0.0", description: "Smart task assignment advisor", createdAt: "2026-07-01" },
  sprintPlan: { version: "1.0.0", description: "Sprint planning assistant", createdAt: "2026-07-01" },
  dailyStandup: { version: "1.0.0", description: "Daily standup generator", createdAt: "2026-07-01" },
  weeklyReport: { version: "1.0.0", description: "Weekly project report", createdAt: "2026-07-01" },
  teamCoaching: { version: "1.0.0", description: "Team performance coach", createdAt: "2026-07-01" },
  riskPrediction: { version: "1.0.0", description: "Predictive project risk advisor", createdAt: "2026-07-01" },
};

const promptBuilders = {
  projectAnalysis: (context) => ({
    system: baseSystemPrompt,
    user: `Analyze this project for delivery health.

Required JSON shape:
{
  "summary": "string",
  "strengths": ["string"],
  "weaknesses": ["string"],
  "risks": ["string"],
  "recommendations": ["string"]
}

Project context:
${stringifyContext(context)}`,
  }),

  riskAnalysis: (context) => ({
    system: baseSystemPrompt,
    user: `Identify delivery risks from overdue work, blocked work, missed deadlines, productivity, and health scores.

Required JSON shape:
{
  "riskLevel": "LOW | MEDIUM | HIGH | CRITICAL",
  "risks": ["string"],
  "mitigationStrategies": ["string"]
}

Risk context:
${stringifyContext(context)}`,
  }),

  teamAnalysis: (context) => ({
    system: baseSystemPrompt,
    user: `Analyze team performance using completion rates, productivity, workload distribution, and delivery performance.

Required JSON shape:
{
  "summary": "string",
  "topPerformers": ["string"],
  "concerns": ["string"],
  "recommendations": ["string"]
}

Team context:
${stringifyContext(context)}`,
  }),

  taskSuggestions: (context) => ({
    system: baseSystemPrompt,
    user: `Recommend assignees for open tasks using workload, productivity, role fit, and prior task performance.

Required JSON shape:
{
  "suggestions": [
    {
      "task": "string",
      "recommendedAssignee": "string",
      "reason": "string"
    }
  ]
}

Task assignment context:
${stringifyContext(context)}`,
  }),

  executiveSummary: (context) => ({
    system: baseSystemPrompt,
    user: `Create an executive-level delivery summary for organization leadership.

Required JSON shape:
{
  "executiveSummary": "string",
  "keyAchievements": ["string"],
  "majorRisks": ["string"],
  "recommendedActions": ["string"]
}

Executive context:
${stringifyContext(context)}`,
  }),

  projectHealth: (context) => ({
    system: baseSystemPrompt,
    user: `Act as a project health advisor. Analyze overdue tasks, blocked tasks, milestone progress, GitHub activity, recent productivity, and delivery trend.

Required JSON shape:
{
  "overallHealth": "string",
  "healthScore": 0,
  "majorProblems": ["string"],
  "recommendations": ["string"],
  "predictedDeliveryRisk": "LOW | MEDIUM | HIGH | CRITICAL"
}

Project health context:
${stringifyContext(context)}`,
  }),

  taskAssignment: (context) => ({
    system: baseSystemPrompt,
    user: `Recommend the best developer for current project work using workload, past performance, role, available skills, and active task count.

Required JSON shape:
{
  "bestDeveloper": "string",
  "confidenceScore": 0,
  "reason": "string",
  "estimatedCompletion": "string",
  "workloadComparison": [
    {
      "developer": "string",
      "activeTasks": 0,
      "completionRate": 0,
      "assessment": "string"
    }
  ]
}

Task assignment context:
${stringifyContext(context)}`,
  }),

  sprintPlan: (context) => ({
    system: baseSystemPrompt,
    user: `Build a sprint plan from candidate tasks, team capacity, recent productivity, and delivery risk.

Required JSON shape:
{
  "recommendedSprintBacklog": [
    {
      "task": "string",
      "priority": "LOW | MEDIUM | HIGH | URGENT",
      "recommendedOrder": 0,
      "reason": "string"
    }
  ],
  "estimatedSprintLoad": "string",
  "predictedBottlenecks": ["string"]
}

Sprint planning context:
${stringifyContext(context)}`,
  }),

  dailyStandup: (context) => ({
    system: baseSystemPrompt,
    user: `Generate a manager-ready daily standup summary from team metrics and recent activity.

Required JSON shape:
{
  "yesterday": ["string"],
  "today": ["string"],
  "blockers": ["string"],
  "importantHighlights": ["string"],
  "riskSummary": "string"
}

Daily standup context:
${stringifyContext(context)}`,
  }),

  weeklyReport: (context) => ({
    system: baseSystemPrompt,
    user: `Create a weekly project report for leadership using delivery progress, team achievements, blockers, GitHub activity, and productivity.

Required JSON shape:
{
  "executiveSummary": "string",
  "teamAchievements": ["string"],
  "majorBlockers": ["string"],
  "deliveryProgress": "string",
  "aiRecommendations": ["string"]
}

Weekly report context:
${stringifyContext(context)}`,
  }),

  teamCoaching: (context) => ({
    system: baseSystemPrompt,
    user: `Act as a team performance coach. Analyze workload, productivity, communication signals from activity, and delivery performance.

Required JSON shape:
{
  "strengths": ["string"],
  "weaknesses": ["string"],
  "recommendations": ["string"]
}

Team coaching context:
${stringifyContext(context)}`,
  }),

  riskPrediction: (context) => ({
    system: baseSystemPrompt,
    user: `Predict project risks across late delivery, team overload, deadline failure, resource shortage, and technical debt.

Required JSON shape:
{
  "risks": [
    {
      "type": "LATE_DELIVERY | TEAM_OVERLOAD | DEADLINE_FAILURE | RESOURCE_SHORTAGE | TECHNICAL_DEBT",
      "riskProbability": 0,
      "impact": "LOW | MEDIUM | HIGH | CRITICAL",
      "recommendedMitigation": "string"
    }
  ],
  "overallRiskProbability": 0,
  "summary": "string"
}

Risk prediction context:
${stringifyContext(context)}`,
  }),
};

export const buildAiPrompt = (type, context) => {
  const builder = promptBuilders[type];
  const metadata = promptRegistry[type];

  if (!builder || !metadata) {
    throw new Error(`Unsupported AI prompt type: ${type}`);
  }

  // Build endpoint-specific prompts outside controllers so prompt changes remain centralized.
  const prompt = builder(context);
  return {
    ...prompt,
    metadata,
  };
};
