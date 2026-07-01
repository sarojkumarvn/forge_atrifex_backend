const fallbackByType = {
  projectAnalysis: {
    summary: "AI analysis could not be generated from the current response.",
    strengths: [],
    weaknesses: [],
    risks: [],
    recommendations: [],
  },
  riskAnalysis: {
    riskLevel: "LOW",
    risks: [],
    mitigationStrategies: [],
  },
  teamAnalysis: {
    summary: "AI team analysis could not be generated from the current response.",
    topPerformers: [],
    concerns: [],
    recommendations: [],
  },
  taskSuggestions: {
    suggestions: [],
  },
  executiveSummary: {
    executiveSummary: "AI executive summary could not be generated from the current response.",
    keyAchievements: [],
    majorRisks: [],
    recommendedActions: [],
  },
  projectHealth: {
    overallHealth: "UNKNOWN",
    healthScore: 0,
    majorProblems: [],
    recommendations: [],
    predictedDeliveryRisk: "LOW",
  },
  taskAssignment: {
    bestDeveloper: "",
    confidenceScore: 0,
    reason: "AI task assignment could not be generated from the current response.",
    estimatedCompletion: "",
    workloadComparison: [],
  },
  sprintPlan: {
    recommendedSprintBacklog: [],
    estimatedSprintLoad: "",
    predictedBottlenecks: [],
  },
  dailyStandup: {
    yesterday: [],
    today: [],
    blockers: [],
    importantHighlights: [],
    riskSummary: "AI daily standup could not be generated from the current response.",
  },
  weeklyReport: {
    executiveSummary: "AI weekly report could not be generated from the current response.",
    teamAchievements: [],
    majorBlockers: [],
    deliveryProgress: "",
    aiRecommendations: [],
  },
  teamCoaching: {
    strengths: [],
    weaknesses: [],
    recommendations: [],
  },
  riskPrediction: {
    risks: [],
    overallRiskProbability: 0,
    summary: "AI risk prediction could not be generated from the current response.",
  },
};

const schemaByType = {
  projectAnalysis: {
    summary: "string",
    strengths: "array",
    weaknesses: "array",
    risks: "array",
    recommendations: "array",
  },
  riskAnalysis: {
    riskLevel: "string",
    risks: "array",
    mitigationStrategies: "array",
  },
  teamAnalysis: {
    summary: "string",
    topPerformers: "array",
    concerns: "array",
    recommendations: "array",
  },
  taskSuggestions: {
    suggestions: "array",
  },
  executiveSummary: {
    executiveSummary: "string",
    keyAchievements: "array",
    majorRisks: "array",
    recommendedActions: "array",
  },
  projectHealth: {
    overallHealth: "string",
    healthScore: "number",
    majorProblems: "array",
    recommendations: "array",
    predictedDeliveryRisk: "string",
  },
  taskAssignment: {
    bestDeveloper: "string",
    confidenceScore: "number",
    reason: "string",
    estimatedCompletion: "string",
    workloadComparison: "array",
  },
  sprintPlan: {
    recommendedSprintBacklog: "array",
    estimatedSprintLoad: "string",
    predictedBottlenecks: "array",
  },
  dailyStandup: {
    yesterday: "array",
    today: "array",
    blockers: "array",
    importantHighlights: "array",
    riskSummary: "string",
  },
  weeklyReport: {
    executiveSummary: "string",
    teamAchievements: "array",
    majorBlockers: "array",
    deliveryProgress: "string",
    aiRecommendations: "array",
  },
  teamCoaching: {
    strengths: "array",
    weaknesses: "array",
    recommendations: "array",
  },
  riskPrediction: {
    risks: "array",
    overallRiskProbability: "number",
    summary: "string",
  },
};

const extractJsonObject = (content) => {
  if (!content || typeof content !== "string") {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch {
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      return null;
    }

    try {
      return JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    } catch {
      return null;
    }
  }
};

const hasExpectedType = (value, expectedType) => {
  if (expectedType === "array") {
    return Array.isArray(value);
  }

  return typeof value === expectedType;
};

const sanitizeTaskSuggestions = (suggestions) => {
  return suggestions
    .filter((suggestion) => suggestion && typeof suggestion === "object")
    .map((suggestion) => ({
      task: typeof suggestion.task === "string" ? suggestion.task : "",
      recommendedAssignee:
        typeof suggestion.recommendedAssignee === "string" ? suggestion.recommendedAssignee : "",
      reason: typeof suggestion.reason === "string" ? suggestion.reason : "",
    }))
    .filter((suggestion) => suggestion.task && suggestion.recommendedAssignee && suggestion.reason);
};

export const getFallbackAiResponse = (type) => fallbackByType[type] || {};

export const validateAiResponse = (type, content) => {
  const schema = schemaByType[type];
  const fallback = getFallbackAiResponse(type);

  if (!schema) {
    return fallback;
  }

  const parsedOutput = extractJsonObject(content);

  if (!parsedOutput || typeof parsedOutput !== "object" || Array.isArray(parsedOutput)) {
    // Validate AI output structure before returning to frontend.
    return fallback;
  }

  const validated = {};

  for (const [field, expectedType] of Object.entries(schema)) {
    if (!hasExpectedType(parsedOutput[field], expectedType)) {
      // Fall back field-by-field so one malformed value does not discard a useful response.
      validated[field] = fallback[field];
      continue;
    }

    validated[field] = parsedOutput[field];
  }

  if (type === "riskAnalysis" && !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(validated.riskLevel)) {
    validated.riskLevel = fallback.riskLevel;
  }

  if (type === "projectHealth" && !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(validated.predictedDeliveryRisk)) {
    validated.predictedDeliveryRisk = fallback.predictedDeliveryRisk;
  }

  if (type === "riskPrediction") {
    validated.risks = validated.risks
      .filter((risk) => risk && typeof risk === "object")
      .map((risk) => ({
        type: typeof risk.type === "string" ? risk.type : "LATE_DELIVERY",
        riskProbability: typeof risk.riskProbability === "number" ? Math.max(0, Math.min(100, risk.riskProbability)) : 0,
        impact: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(risk.impact) ? risk.impact : "LOW",
        recommendedMitigation:
          typeof risk.recommendedMitigation === "string" ? risk.recommendedMitigation : "",
      }));
    validated.overallRiskProbability = Math.max(0, Math.min(100, validated.overallRiskProbability));
  }

  if (type === "taskSuggestions") {
    validated.suggestions = sanitizeTaskSuggestions(validated.suggestions);
  }

  if (typeof validated.healthScore === "number") {
    validated.healthScore = Math.max(0, Math.min(100, validated.healthScore));
  }

  if (typeof validated.confidenceScore === "number") {
    validated.confidenceScore = Math.max(0, Math.min(100, validated.confidenceScore));
  }

  return validated;
};
