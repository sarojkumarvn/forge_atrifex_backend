const stringifyContext = (context) => JSON.stringify(context, null, 2);

const baseSystemPrompt = `You are Forge AtriFex AI, an engineering delivery intelligence assistant.
Use only the supplied JSON context.
Return valid JSON only.
Do not include markdown, comments, or extra prose.
Keep recommendations practical, specific, and tied to the metrics provided.`;

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
};

export const buildAiPrompt = (type, context) => {
  const builder = promptBuilders[type];

  if (!builder) {
    throw new Error(`Unsupported AI prompt type: ${type}`);
  }

  // Build endpoint-specific prompts outside controllers so prompt changes remain centralized.
  return builder(context);
};
