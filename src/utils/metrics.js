const emptyLatency = () => ({
  count: 0,
  totalMs: 0,
  averageMs: 0,
  maxMs: 0,
});

const state = {
  requests: {
    total: 0,
    errors: 0,
    byStatus: {},
    latency: emptyLatency(),
  },
  providers: {
    ai: { failures: 0, latency: emptyLatency() },
    github: { failures: 0, latency: emptyLatency(), rateLimitEvents: 0 },
  },
  database: {
    failures: 0,
    latency: emptyLatency(),
  },
};

const recordLatency = (bucket, durationMs) => {
  bucket.count += 1;
  bucket.totalMs += durationMs;
  bucket.averageMs = Math.round(bucket.totalMs / bucket.count);
  bucket.maxMs = Math.max(bucket.maxMs, durationMs);
};

const metrics = {
  recordRequest({ statusCode, durationMs }) {
    state.requests.total += 1;
    state.requests.byStatus[statusCode] = (state.requests.byStatus[statusCode] || 0) + 1;

    if (statusCode >= 500) {
      state.requests.errors += 1;
    }

    recordLatency(state.requests.latency, durationMs);
  },

  recordProviderLatency(provider, durationMs) {
    if (!state.providers[provider]) return;
    recordLatency(state.providers[provider].latency, durationMs);
  },

  recordProviderFailure(provider) {
    if (!state.providers[provider]) return;
    state.providers[provider].failures += 1;
  },

  recordGithubRateLimit() {
    state.providers.github.rateLimitEvents += 1;
  },

  recordDatabaseQuery({ durationMs, failed = false }) {
    recordLatency(state.database.latency, durationMs);

    if (failed) {
      state.database.failures += 1;
    }
  },

  snapshot() {
    return JSON.parse(JSON.stringify(state));
  },

  reset() {
    state.requests.total = 0;
    state.requests.errors = 0;
    state.requests.byStatus = {};
    state.requests.latency = emptyLatency();
    state.providers.ai = { failures: 0, latency: emptyLatency() };
    state.providers.github = { failures: 0, latency: emptyLatency(), rateLimitEvents: 0 };
    state.database.failures = 0;
    state.database.latency = emptyLatency();
  },
};

export default metrics;
