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

  if (type === "taskSuggestions") {
    validated.suggestions = sanitizeTaskSuggestions(validated.suggestions);
  }

  return validated;
};
