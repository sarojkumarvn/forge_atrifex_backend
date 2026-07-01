import crypto from "crypto";
import prisma from "../config/prisma.js";
import ApiError from "../utils/apiError.js";
import { buildAiPrompt } from "../utils/aiPrompts.js";
import { validateAiResponse } from "../utils/aiResponseValidator.js";
import logger from "../config/logger.js";
import metrics from "../utils/metrics.js";
import logActivity from "../utils/activityLogger.js";
import { createNotification } from "../utils/notificationSender.js";
import { getRequestLoggerMeta } from "../utils/requestContext.js";
import {
  buildDailyStandupContext,
  buildExecutiveSummaryContext,
  buildProjectAnalysisContext,
  buildProjectHealthContext,
  buildRiskAnalysisContext,
  buildRiskPredictionContext,
  buildSmartTaskAssignmentContext,
  buildSprintPlanContext,
  buildTaskSuggestionContext,
  buildTeamAnalysisContext,
  buildTeamCoachingContext,
  buildWeeklyReportContext,
} from "./contextBuilder.service.js";

const groqChatCompletionsUrl = "https://api.groq.com/openai/v1/chat/completions";
const defaultModel = "llama-3.3-70b-versatile";
const aiTimeoutMs = 30000;

const workflowTargets = {
  projectAnalysis: "project",
  riskAnalysis: "project",
  taskSuggestions: "project",
  projectHealth: "project",
  taskAssignment: "project",
  sprintPlan: "project",
  weeklyReport: "project",
  riskPrediction: "project",
  teamAnalysis: "team",
  dailyStandup: "team",
  teamCoaching: "team",
  executiveSummary: "organization",
};

const estimateTokens = (...values) => Math.ceil(values.filter(Boolean).join(" ").length / 4);

const hashContext = (context) =>
  crypto.createHash("sha256").update(JSON.stringify(context)).digest("hex");

const callGroq = async ({ system, user }) => {
  if (!process.env.GROQ_API_KEY) {
    throw new ApiError(500, "AI service is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aiTimeoutMs);

  const response = await fetch(groqChatCompletionsUrl, {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || defaultModel,
      messages: [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: user,
        },
      ],
      temperature: 0.2,
      response_format: {
        type: "json_object",
      },
    }),
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    throw new ApiError(502, "AI provider request failed");
  }

  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content || "";
};

const aiProviders = {
  groq: callGroq,
};

const extractSummary = (type, result) =>
  result.summary ||
  result.executiveSummary ||
  result.overallHealth ||
  result.riskSummary ||
  `${type} generated`;

const extractRecommendations = (result) =>
  result.recommendations ||
  result.aiRecommendations ||
  result.recommendedActions ||
  result.mitigationStrategies ||
  result.predictedBottlenecks ||
  [];

const recordAiUsageMetric = async ({ user, type, providerName, model, estimatedTokens, durationMs, success, error }) => {
  try {
    await prisma.aIUsageMetric.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        feature: type,
        provider: providerName,
        model,
        estimatedTokens,
        latencyMs: durationMs,
        success,
        errorMessage: error?.message || null,
      },
    });
  } catch (metricError) {
    logger.warn({ feature: type, error: metricError.message }, "AI usage metric write failed");
  }
};

const findExistingInsight = ({ user, type, contextHash }) =>
  prisma.aIInsight.findUnique({
    where: {
      organizationId_type_contextHash: {
        organizationId: user.organizationId,
        type,
        contextHash,
      },
    },
  });

const getPreviousProjectHealth = ({ user, projectId, contextHash }) =>
  prisma.aIInsight.findFirst({
    where: {
      organizationId: user.organizationId,
      projectId,
      type: "projectHealth",
      NOT: {
        contextHash,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

const persistInsight = async ({ user, type, id, contextHash, result }) => {
  const target = workflowTargets[type];
  const previousProjectHealth =
    type === "projectHealth" && target === "project"
      ? await getPreviousProjectHealth({ user, projectId: id, contextHash })
      : null;
  const insight = await prisma.aIInsight.create({
    data: {
      organizationId: user.organizationId,
      projectId: target === "project" ? id : null,
      teamId: target === "team" ? id : null,
      type,
      contextHash,
      summary: extractSummary(type, result),
      recommendations: extractRecommendations(result),
      result,
      generatedBy: user.id,
    },
  });

  const activityAction = type === "riskPrediction" ? "AI_RISK_GENERATED" : "AI_REPORT_GENERATED";

  await logActivity({
    actorId: user.id,
    organizationId: user.organizationId,
    action: activityAction,
    entityType: "AI_INSIGHT",
    entityId: insight.id,
    metadata: {
      type,
      projectId: insight.projectId,
      teamId: insight.teamId,
      summary: insight.summary,
    },
  });

  await createNotification({
    recipientId: user.id,
    title: type === "riskPrediction" ? "AI risk prediction generated" : "AI report generated",
    message: insight.summary,
  });

  if (type === "riskPrediction" && result.overallRiskProbability >= 70) {
    await createNotification({
      recipientId: user.id,
      title: "High-risk prediction detected",
      message: `AI predicted ${result.overallRiskProbability}% delivery risk.`,
    });
  }

  if (type === "projectHealth" && result.predictedDeliveryRisk && ["HIGH", "CRITICAL"].includes(result.predictedDeliveryRisk)) {
    await createNotification({
      recipientId: user.id,
      title: "Project health risk detected",
      message: `Project health risk is ${result.predictedDeliveryRisk}.`,
    });
  }

  if (previousProjectHealth?.result?.healthScore !== undefined && result.healthScore !== previousProjectHealth.result.healthScore) {
    await createNotification({
      recipientId: user.id,
      title: "Project health changed",
      message: `Project health changed from ${previousProjectHealth.result.healthScore} to ${result.healthScore}.`,
    });
  }

  return {
    insightId: insight.id,
    cached: false,
    promptVersion: null,
    ...result,
  };
};

const runAiWorkflow = async ({ type, contextBuilder, user, id }) => {
  const start = performance.now();
  const providerName = (process.env.AI_PROVIDER || "groq").toLowerCase();
  const model = process.env.AI_MODEL || defaultModel;

  // AI logs intentionally exclude prompts and model output to avoid leaking business context.
  logger.info(
    {
      ...getRequestLoggerMeta(),
      endpoint: type,
      provider: providerName,
      model,
    },
    "AI request started",
  );

  // Build context before prompt creation so AI receives only authorized business data.
  const context = id ? await contextBuilder(user, id) : await contextBuilder(user);
  const contextHash = hashContext(context);
  const existingInsight = await findExistingInsight({ user, type, contextHash });

  if (existingInsight) {
    return {
      insightId: existingInsight.id,
      cached: true,
      promptVersion: existingInsight.result?.promptVersion || null,
      ...existingInsight.result,
    };
  }

  // Prompt construction is centralized to keep JSON contracts consistent across endpoints.
  const prompt = buildAiPrompt(type, context);
  const provider = aiProviders[providerName];
  const estimatedInputTokens = estimateTokens(prompt.system, prompt.user);

  if (!provider) {
    const durationMs = Math.round(performance.now() - start);
    metrics.recordProviderLatency("ai", durationMs);
    metrics.recordProviderFailure("ai");
    logger.error(
      {
        ...getRequestLoggerMeta(),
        endpoint: type,
        provider: providerName,
        model,
        durationMs,
      },
      "AI request failed",
    );
    await recordAiUsageMetric({
      user,
      type,
      providerName,
      model,
      estimatedTokens: estimatedInputTokens,
      durationMs,
      success: false,
      error: new Error("AI provider is not supported"),
    });
    throw new ApiError(500, "AI provider is not supported");
  }

  try {
    const rawOutput = await provider(prompt);
    const durationMs = Math.round(performance.now() - start);
    metrics.recordProviderLatency("ai", durationMs);
    const estimatedTokens = estimatedInputTokens + estimateTokens(rawOutput);

    logger.info(
      {
        ...getRequestLoggerMeta(),
        endpoint: type,
        provider: providerName,
        model,
        durationMs,
      },
      "AI request completed",
    );

    if (durationMs > 5000) {
      logger.warn(
        {
          ...getRequestLoggerMeta(),
          endpoint: type,
          provider: providerName,
          model,
          durationMs,
        },
        "Slow AI request detected",
      );
    }

    // LLM response validation protects the frontend from malformed or partial provider output.
    const result = {
      ...validateAiResponse(type, rawOutput),
      promptVersion: prompt.metadata.version,
    };

    await recordAiUsageMetric({
      user,
      type,
      providerName,
      model,
      estimatedTokens,
      durationMs,
      success: true,
    });

    return persistInsight({ user, type, id, contextHash, result });
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    metrics.recordProviderLatency("ai", durationMs);
    metrics.recordProviderFailure("ai");
    const normalizedError = error.name === "AbortError" ? new ApiError(504, "AI provider request timed out") : error;

    logger.error(
      {
        ...getRequestLoggerMeta(),
        endpoint: type,
        provider: providerName,
        model,
        durationMs,
        error: {
          message: normalizedError.message,
          statusCode: normalizedError.statusCode,
          code: normalizedError.code,
        },
      },
      "AI request failed",
    );

    await recordAiUsageMetric({
      user,
      type,
      providerName,
      model,
      estimatedTokens: estimatedInputTokens,
      durationMs,
      success: false,
      error: normalizedError,
    });

    throw normalizedError;
  }
};

export const generateProjectAnalysis = (user, projectId) =>
  runAiWorkflow({
    type: "projectAnalysis",
    contextBuilder: buildProjectAnalysisContext,
    user,
    id: projectId,
  });

export const generateRiskAnalysis = (user, projectId) =>
  runAiWorkflow({
    type: "riskAnalysis",
    contextBuilder: buildRiskAnalysisContext,
    user,
    id: projectId,
  });

export const generateTeamAnalysis = (user, teamId) =>
  runAiWorkflow({
    type: "teamAnalysis",
    contextBuilder: buildTeamAnalysisContext,
    user,
    id: teamId,
  });

export const generateTaskSuggestions = (user, projectId) =>
  runAiWorkflow({
    type: "taskSuggestions",
    contextBuilder: buildTaskSuggestionContext,
    user,
    id: projectId,
  });

export const generateExecutiveSummary = (user) =>
  runAiWorkflow({
    type: "executiveSummary",
    contextBuilder: buildExecutiveSummaryContext,
    user,
  });

export const generateProjectHealth = (user, projectId) =>
  runAiWorkflow({
    type: "projectHealth",
    contextBuilder: buildProjectHealthContext,
    user,
    id: projectId,
  });

export const generateTaskAssignment = (user, projectId) =>
  runAiWorkflow({
    type: "taskAssignment",
    contextBuilder: buildSmartTaskAssignmentContext,
    user,
    id: projectId,
  });

export const generateSprintPlan = (user, projectId) =>
  runAiWorkflow({
    type: "sprintPlan",
    contextBuilder: buildSprintPlanContext,
    user,
    id: projectId,
  });

export const generateDailyStandup = (user, teamId) =>
  runAiWorkflow({
    type: "dailyStandup",
    contextBuilder: buildDailyStandupContext,
    user,
    id: teamId,
  });

export const generateWeeklyReport = (user, projectId) =>
  runAiWorkflow({
    type: "weeklyReport",
    contextBuilder: buildWeeklyReportContext,
    user,
    id: projectId,
  });

export const generateTeamCoaching = (user, teamId) =>
  runAiWorkflow({
    type: "teamCoaching",
    contextBuilder: buildTeamCoachingContext,
    user,
    id: teamId,
  });

export const generateRiskPrediction = (user, projectId) =>
  runAiWorkflow({
    type: "riskPrediction",
    contextBuilder: buildRiskPredictionContext,
    user,
    id: projectId,
  });

export const updateAIRecommendationStatus = async ({ user, insightId, status }) => {
  const insight = await prisma.aIInsight.findFirst({
    where: {
      id: insightId,
      organizationId: user.organizationId,
    },
  });

  if (!insight) {
    throw new ApiError(404, "AI insight not found");
  }

  const updatedInsight = await prisma.aIInsight.update({
    where: {
      id: insight.id,
    },
    data: {
      status,
    },
  });

  await logActivity({
    actorId: user.id,
    organizationId: user.organizationId,
    action: status === "ACCEPTED" ? "AI_RECOMMENDATION_ACCEPTED" : "AI_RECOMMENDATION_REJECTED",
    entityType: "AI_INSIGHT",
    entityId: insight.id,
    metadata: {
      type: insight.type,
      status,
    },
  });

  return updatedInsight;
};
