import { githubPaginatedRequest, githubRequest } from "../utils/githubClient.js";
import { buildCacheKey, cacheTtl, getOrSetCache } from "./cache.service.js";

const githubAnalyticsPageLimit = 2;

const cacheGithubAnalytics = ({ owner, repo }, type, factory) =>
  // Reuse repository metadata to reduce GitHub API consumption during dashboard refreshes.
  getOrSetCache(buildCacheKey("github", owner, repo, type), cacheTtl.github, factory);

const oneWeekAgoIso = () => {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
};

const incrementContributor = (contributors, username, field, amount = 1) => {
  if (!username) {
    return;
  }

  const existing = contributors.get(username) || {
    username,
    commits: 0,
    pullRequests: 0,
    issuesClosed: 0,
  };

  existing[field] += amount;
  contributors.set(username, existing);
};

export const getRepositoryOverviewAnalytics = async ({ token, owner, repo }) => {
  return cacheGithubAnalytics({ owner, repo }, "overview", async () => {
  const [repositoryResponse, contributors, openIssues] = await Promise.all([
    githubRequest({
      token,
      path: `/repos/${owner}/${repo}`,
    }),
    githubPaginatedRequest({
      token,
      path: `/repos/${owner}/${repo}/contributors`,
      maxPages: 1,
    }),
    githubPaginatedRequest({
      token,
      path: `/repos/${owner}/${repo}/issues`,
      query: {
        state: "open",
      },
      maxPages: 1,
    }),
  ]);
  const data = repositoryResponse.data;

  return {
    repository: data.full_name,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: openIssues.filter((issue) => !issue.pull_request).length,
    contributors: contributors.length,
    defaultBranch: data.default_branch,
  };
  });
};

export const getCommitAnalytics = async ({ token, owner, repo }) => {
  return cacheGithubAnalytics({ owner, repo }, "commits", async () => {
  const commits = await githubPaginatedRequest({
    token,
    path: `/repos/${owner}/${repo}/commits`,
    maxPages: githubAnalyticsPageLimit,
  });
  const weeklyCommits = commits.filter((commit) => {
    const committedAt = commit.commit?.author?.date;
    return committedAt && new Date(committedAt) >= new Date(oneWeekAgoIso());
  }).length;
  const contributorCounts = commits.reduce((counts, commit) => {
    const username = commit.author?.login || commit.commit?.author?.name || "unknown";
    counts.set(username, (counts.get(username) || 0) + 1);
    return counts;
  }, new Map());

  return {
    totalCommits: commits.length,
    weeklyCommits,
    // Aggregate commit activity for contributor analytics and future AI productivity insights.
    topContributors: [...contributorCounts.entries()]
      .map(([username, commitsCount]) => ({
        username,
        commits: commitsCount,
      }))
      .sort((a, b) => b.commits - a.commits)
      .slice(0, 10),
  };
  });
};

export const getPullRequestAnalytics = async ({ token, owner, repo }) => {
  return cacheGithubAnalytics({ owner, repo }, "pull-requests", async () => {
  const pullRequests = await githubPaginatedRequest({
    token,
    path: `/repos/${owner}/${repo}/pulls`,
    query: {
      state: "all",
    },
    maxPages: githubAnalyticsPageLimit,
  });

  const openPRs = pullRequests.filter((pullRequest) => pullRequest.state === "open").length;
  const mergedPRs = pullRequests.filter((pullRequest) => pullRequest.merged_at).length;
  const closedPRs = pullRequests.filter(
    (pullRequest) => pullRequest.state === "closed" && !pullRequest.merged_at,
  ).length;

  return {
    totalPRs: pullRequests.length,
    // Pull request analytics separate merged work from closed-without-merge delivery friction.
    openPRs,
    mergedPRs,
    closedPRs,
  };
  });
};

export const getIssueAnalytics = async ({ token, owner, repo }) => {
  return cacheGithubAnalytics({ owner, repo }, "issues", async () => {
  const [openIssues, closedIssues] = await Promise.all([
    githubPaginatedRequest({
      token,
      path: `/repos/${owner}/${repo}/issues`,
      query: {
        state: "open",
      },
      maxPages: githubAnalyticsPageLimit,
    }),
    githubPaginatedRequest({
      token,
      path: `/repos/${owner}/${repo}/issues`,
      query: {
        state: "closed",
      },
      maxPages: githubAnalyticsPageLimit,
    }),
  ]);
  const openIssueCount = openIssues.filter((issue) => !issue.pull_request).length;
  const closedIssueCount = closedIssues.filter((issue) => !issue.pull_request).length;
  const totalIssues = openIssueCount + closedIssueCount;

  return {
    openIssues: openIssueCount,
    closedIssues: closedIssueCount,
    issueResolutionRate: totalIssues ? Math.round((closedIssueCount / totalIssues) * 100) : 0,
  };
  });
};

export const getContributorAnalytics = async ({ token, owner, repo }) => {
  return cacheGithubAnalytics({ owner, repo }, "contributors", async () => {
  const [commits, pullRequests, closedIssues] = await Promise.all([
    githubPaginatedRequest({
      token,
      path: `/repos/${owner}/${repo}/commits`,
      maxPages: githubAnalyticsPageLimit,
    }),
    githubPaginatedRequest({
      token,
      path: `/repos/${owner}/${repo}/pulls`,
      query: {
        state: "all",
      },
      maxPages: githubAnalyticsPageLimit,
    }),
    githubPaginatedRequest({
      token,
      path: `/repos/${owner}/${repo}/issues`,
      query: {
        state: "closed",
      },
      maxPages: githubAnalyticsPageLimit,
    }),
  ]);
  const contributors = new Map();

  commits.forEach((commit) => {
    incrementContributor(contributors, commit.author?.login || commit.commit?.author?.name, "commits");
  });

  pullRequests.forEach((pullRequest) => {
    incrementContributor(contributors, pullRequest.user?.login, "pullRequests");
  });

  closedIssues
    .filter((issue) => !issue.pull_request)
    .forEach((issue) => {
      incrementContributor(contributors, issue.closed_by?.login || issue.user?.login, "issuesClosed");
    });

  return {
    // Contributor aggregation prepares commit, PR, and issue activity for later AI performance analysis.
    contributors: [...contributors.values()].sort(
      (a, b) =>
        b.commits + b.pullRequests + b.issuesClosed - (a.commits + a.pullRequests + a.issuesClosed),
    ),
  };
  });
};
