import ApiError from "../utils/apiError.js";
import { buildAiPrompt } from "../utils/aiPrompts.js";
import { validateAiResponse } from "../utils/aiResponseValidator.js";
import logger from "../config/logger.js";
import metrics from "../utils/metrics.js";
import { getRequestLoggerMeta } from "../utils/requestContext.js";
import {
  buildExecutiveSummaryContext,
  buildProjectAnalysisContext,
  buildRiskAnalysisContext,
  buildTaskSuggestionContext,
  buildTeamAnalysisContext,
} from "./contextBuilder.service.js";

const groqChatCompletionsUrl = "https://api.groq.com/openai/v1/chat/completions";
const defaultModel = "llama-3.3-70b-versatile";

const callGroq = async ({ system, user }) => {
  if (!process.env.GROQ_API_KEY) {
    throw new ApiError(500, "AI service is not configured");
  }

  const response = await fetch(groqChatCompletionsUrl, {
    method: "POST",
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
  });

  if (!response.ok) {
    throw new ApiError(502, "AI provider request failed");
  }

  const payload = await response.json();
  return payload?.choices?.[0]?.message?.content || "";
};

const aiProviders = {
  groq: callGroq,
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

  // Prompt construction is centralized to keep JSON contracts consistent across endpoints.
  const prompt = buildAiPrompt(type, context);
  const provider = aiProviders[providerName];

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
    throw new ApiError(500, "AI provider is not supported");
  }

  try {
    const rawOutput = await provider(prompt);
    const durationMs = Math.round(performance.now() - start);
    metrics.recordProviderLatency("ai", durationMs);

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
    return validateAiResponse(type, rawOutput);
  } catch (error) {
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
        error: {
          message: error.message,
          statusCode: error.statusCode,
          code: error.code,
        },
      },
      "AI request failed",
    );

    throw error;
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
