import ApiError from "./apiError.js";
import logger from "../config/logger.js";
import metrics from "./metrics.js";
import { getRequestLoggerMeta } from "./requestContext.js";
import { decryptSecret, encryptSecret } from "./secretCrypto.js";

const defaultGithubApiUrl = "https://api.github.com";
const githubOAuthAuthorizeUrl = "https://github.com/login/oauth/authorize";
const githubOAuthTokenUrl = "https://github.com/login/oauth/access_token";

const getGithubApiUrl = () => (process.env.GITHUB_API_URL || defaultGithubApiUrl).replace(/\/$/, "");

const assertOAuthConfig = () => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET || !process.env.GITHUB_CALLBACK_URL) {
    throw new ApiError(500, "GitHub OAuth is not configured");
  }
};

const getTokenKey = () => {
  if (!process.env.GITHUB_TOKEN_ENCRYPTION_KEY) {
    throw new ApiError(500, "GitHub token encryption key is not configured");
  }

  return process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
};

export const encryptGithubToken = (token) => {
  return encryptSecret({ value: token, key: getTokenKey() });
};

export const decryptGithubToken = (encryptedToken) => {
  if (!encryptedToken) {
    throw new ApiError(401, "GitHub account is not connected");
  }

  return decryptSecret({ encryptedValue: encryptedToken, key: getTokenKey() });
};

export const buildGithubOAuthUrl = (state) => {
  assertOAuthConfig();

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    // Private repository analytics require repo scope; reduce this if public-only analytics are enough.
    scope: "repo read:user user:email",
    state,
    allow_signup: "true",
  });

  // OAuth flow begins with a signed state value so the callback can safely identify the Forge user.
  return `${githubOAuthAuthorizeUrl}?${params.toString()}`;
};

export const exchangeCodeForToken = async (code) => {
  assertOAuthConfig();
  const start = performance.now();
  let latencyRecorded = false;

  try {
    const response = await fetch(githubOAuthTokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
      }),
    });
    const durationMs = Math.round(performance.now() - start);
    metrics.recordProviderLatency("github", durationMs);
    latencyRecorded = true;

    if (durationMs > 3000) {
      logger.warn({ ...getRequestLoggerMeta(), durationMs }, "Slow GitHub OAuth token exchange detected");
    }

    if (!response.ok) {
      metrics.recordProviderFailure("github");
      throw new ApiError(502, "GitHub OAuth token exchange failed");
    }

    const payload = await response.json();

    if (!payload.access_token) {
      metrics.recordProviderFailure("github");
      throw new ApiError(400, payload.error_description || "GitHub OAuth did not return an access token");
    }

    return {
      accessToken: payload.access_token,
      scope: payload.scope || "",
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    if (!latencyRecorded) {
      metrics.recordProviderLatency("github", durationMs);
    }
    metrics.recordProviderFailure("github");
    logger.error(
      {
        ...getRequestLoggerMeta(),
        status: "failed",
        durationMs,
        error: {
          message: error.message,
          statusCode: error.statusCode,
          code: error.code,
        },
      },
      "GitHub OAuth token exchange failed",
    );
    throw error;
  }
};

const parseNextLink = (linkHeader) => {
  if (!linkHeader) {
    return null;
  }

  const nextLink = linkHeader.split(",").find((part) => part.includes('rel="next"'));

  if (!nextLink) {
    return null;
  }

  const match = nextLink.match(/<([^>]+)>/);
  return match?.[1] || null;
};

export const githubRequest = async ({ token, path, method = "GET", body = null, query = null, absoluteUrl = null }) => {
  const start = performance.now();
  const baseUrl = absoluteUrl || `${getGithubApiUrl()}${path}`;
  const url = new URL(baseUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  try {
    // GitHub API requests always use the caller's OAuth token to enforce repository ownership.
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const durationMs = Math.round(performance.now() - start);
    metrics.recordProviderLatency("github", durationMs);

    if (durationMs > 3000) {
      logger.warn(
        {
          ...getRequestLoggerMeta(),
          method,
          path: url.pathname,
          status: response.status,
          durationMs,
        },
        "Slow GitHub API request detected",
      );
    }

    const remainingHeader = response.headers.get("x-ratelimit-remaining");

    if ((response.status === 403 && remainingHeader === "0") || response.status === 429) {
      metrics.recordGithubRateLimit();
      metrics.recordProviderFailure("github");
      logger.warn(
        {
          ...getRequestLoggerMeta(),
          method,
          path: url.pathname,
          status: response.status,
          remaining: remainingHeader,
        },
        "GitHub API rate limit event",
      );
      // Handle GitHub API rate limiting gracefully instead of surfacing provider internals.
      throw new ApiError(429, "GitHub API rate limit exceeded. Please try again later.");
    }

    if (response.status === 404) {
      metrics.recordProviderFailure("github");
      throw new ApiError(404, "GitHub resource not found or not accessible");
    }

    if (!response.ok) {
      metrics.recordProviderFailure("github");
      throw new ApiError(502, "GitHub API request failed");
    }

    const text = await response.text();

    return {
      data: text ? JSON.parse(text) : null,
      nextUrl: parseNextLink(response.headers.get("link")),
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);

    if (!error.statusCode) {
      metrics.recordProviderLatency("github", durationMs);
      metrics.recordProviderFailure("github");
    }

    logger.error(
      {
        ...getRequestLoggerMeta(),
        method,
        path: url.pathname,
        durationMs,
        error: {
          message: error.message,
          statusCode: error.statusCode,
          code: error.code,
        },
      },
      "GitHub API request failed",
    );

    throw error;
  }
};

export const githubPaginatedRequest = async ({ token, path, query = {}, maxPages = 5 }) => {
  const results = [];
  let page = 1;
  let nextUrl = null;

  do {
    const response = await githubRequest({
      token,
      path,
      query: {
        per_page: 100,
        ...query,
        page,
      },
      absoluteUrl: nextUrl,
    });

    if (Array.isArray(response.data)) {
      results.push(...response.data);
    }

    nextUrl = response.nextUrl;
    page += 1;
  } while (nextUrl && page <= maxPages);

  return results;
};
