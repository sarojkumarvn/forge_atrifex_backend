import prisma from "../config/prisma.js";
import { githubPaginatedRequest, githubRequest } from "../utils/githubClient.js";
import { buildCacheKey, deleteCacheByPrefix } from "./cache.service.js";

const syncPageLimit = 2;

const toIso = (value) => (value ? new Date(value).toISOString() : null);

const averageHoursBetween = (items, startField, endField) => {
  const durations = items
    .map((item) => {
      if (!item[startField] || !item[endField]) return null;
      return new Date(item[endField]).getTime() - new Date(item[startField]).getTime();
    })
    .filter((duration) => Number.isFinite(duration) && duration >= 0);

  if (!durations.length) return 0;

  return Math.round((durations.reduce((sum, duration) => sum + duration, 0) / durations.length / 36e5) * 10) / 10;
};

const groupByDate = (items, getDate) =>
  items.reduce((counts, item) => {
    const value = getDate(item);
    if (!value) return counts;
    const day = value.slice(0, 10);
    counts.set(day, (counts.get(day) || 0) + 1);
    return counts;
  }, new Map());

const groupByWeek = (items, getDate) =>
  items.reduce((counts, item) => {
    const value = getDate(item);
    if (!value) return counts;
    const date = new Date(value);
    const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const key = weekStart.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());

const trendFromMap = (counts, label) =>
  [...counts.entries()]
    .map(([period, count]) => ({
      [label]: period,
      count,
    }))
    .sort((a, b) => a[label].localeCompare(b[label]));

const paginate = (items, { page = 1, limit = 20 } = {}) => {
  const currentPage = Number(page) || 1;
  const pageSize = Number(limit) || 20;
  const start = (currentPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page: currentPage,
      limit: pageSize,
      total: items.length,
      totalPages: Math.ceil(items.length / pageSize) || 1,
    },
  };
};

const incrementContributor = (contributors, username, field, amount = 1, lastContribution = null) => {
  if (!username) return;

  const existing = contributors.get(username) || {
    username,
    commitCount: 0,
    prCount: 0,
    issuesClosed: 0,
    lastContribution: null,
  };

  existing[field] += amount;

  if (lastContribution && (!existing.lastContribution || new Date(lastContribution) > new Date(existing.lastContribution))) {
    existing.lastContribution = lastContribution;
  }

  contributors.set(username, existing);
};

class GitHubSyncService {
  async syncRepository({ token, project }) {
    deleteCacheByPrefix(buildCacheKey("github", project.githubRepositoryOwner, project.githubRepositoryName));

    const repositoryResponse = await githubRequest({
      token,
      path: `/repos/${project.githubRepositoryOwner}/${project.githubRepositoryName}`,
    });
    const repository = repositoryResponse.data;
    const [commits, pullRequests, issues] = await Promise.all([
      this.syncCommits({ token, project }),
      this.syncPullRequests({ token, project }),
      this.syncIssues({ token, project }),
    ]);

    await prisma.project.update({
      where: {
        id: project.id,
      },
      data: {
        repositoryUrl: repository.html_url,
        githubRepositoryId: String(repository.id),
        githubRepositoryOwner: repository.owner.login,
        githubRepositoryName: repository.name,
        githubDefaultBranch: repository.default_branch,
      },
    });

    return {
      commitsSynced: commits.length,
      pullRequestsSynced: pullRequests.length,
      issuesSynced: issues.length,
      syncedAt: new Date().toISOString(),
      repository: repository.full_name,
      defaultBranch: repository.default_branch,
    };
  }

  async syncCommits({ token, project }) {
    return githubPaginatedRequest({
      token,
      path: `/repos/${project.githubRepositoryOwner}/${project.githubRepositoryName}/commits`,
      maxPages: syncPageLimit,
    });
  }

  async syncPullRequests({ token, project }) {
    return githubPaginatedRequest({
      token,
      path: `/repos/${project.githubRepositoryOwner}/${project.githubRepositoryName}/pulls`,
      query: {
        state: "all",
      },
      maxPages: syncPageLimit,
    });
  }

  async syncIssues({ token, project }) {
    const issues = await githubPaginatedRequest({
      token,
      path: `/repos/${project.githubRepositoryOwner}/${project.githubRepositoryName}/issues`,
      query: {
        state: "all",
      },
      maxPages: syncPageLimit,
    });

    return issues.filter((issue) => !issue.pull_request);
  }

  async getCommitTimeline({ token, project, pagination }) {
    const commits = await this.syncCommits({ token, project });
    const orderedCommits = commits.sort(
      (a, b) => new Date(b.commit?.author?.date || 0) - new Date(a.commit?.author?.date || 0),
    );
    const contributorCounts = commits.reduce((counts, commit) => {
      const username = commit.author?.login || commit.commit?.author?.name || "unknown";
      counts.set(username, (counts.get(username) || 0) + 1);
      return counts;
    }, new Map());
    const paginated = paginate(orderedCommits, pagination);

    return {
      dailyCommits: trendFromMap(groupByDate(commits, (commit) => commit.commit?.author?.date), "date"),
      weeklyCommits: trendFromMap(groupByWeek(commits, (commit) => commit.commit?.author?.date), "weekStart"),
      topContributors: [...contributorCounts.entries()]
        .map(([username, commitCount]) => ({ username, commitCount }))
        .sort((a, b) => b.commitCount - a.commitCount)
        .slice(0, 10),
      commitFrequency: commits.length,
      commits: paginated.items.map((commit) => ({
        sha: commit.sha,
        message: commit.commit?.message,
        author: commit.author?.login || commit.commit?.author?.name || "unknown",
        committedAt: toIso(commit.commit?.author?.date),
        url: commit.html_url,
      })),
      pagination: paginated.pagination,
    };
  }

  async getPullRequestInsights({ token, project }) {
    const pullRequests = await this.syncPullRequests({ token, project });
    const mergedPullRequests = pullRequests.filter((pullRequest) => pullRequest.merged_at);
    const reviewActivity = pullRequests.reduce(
      (activity, pullRequest) => {
        if (pullRequest.requested_reviewers?.length) activity.requestedReviews += pullRequest.requested_reviewers.length;
        if (pullRequest.review_comments) activity.reviewComments += pullRequest.review_comments;
        return activity;
      },
      { requestedReviews: 0, reviewComments: 0 },
    );

    return {
      openPRs: pullRequests.filter((pullRequest) => pullRequest.state === "open").length,
      mergedPRs: mergedPullRequests.length,
      averageMergeTimeHours: averageHoursBetween(mergedPullRequests, "created_at", "merged_at"),
      reviewActivity,
      prTrend: trendFromMap(groupByDate(pullRequests, (pullRequest) => pullRequest.created_at), "date"),
    };
  }

  async getIssueInsights({ token, project }) {
    const issues = await this.syncIssues({ token, project });
    const closedIssues = issues.filter((issue) => issue.state === "closed");

    return {
      openIssues: issues.filter((issue) => issue.state === "open").length,
      closedIssues: closedIssues.length,
      averageResolutionTimeHours: averageHoursBetween(closedIssues, "created_at", "closed_at"),
      issueTrend: trendFromMap(groupByDate(issues, (issue) => issue.created_at), "date"),
    };
  }

  async getContributorInsights({ token, project }) {
    const [commits, pullRequests, issues] = await Promise.all([
      this.syncCommits({ token, project }),
      this.syncPullRequests({ token, project }),
      this.syncIssues({ token, project }),
    ]);
    const contributors = new Map();

    commits.forEach((commit) => {
      incrementContributor(
        contributors,
        commit.author?.login || commit.commit?.author?.name,
        "commitCount",
        1,
        commit.commit?.author?.date,
      );
    });

    pullRequests.forEach((pullRequest) => {
      incrementContributor(contributors, pullRequest.user?.login, "prCount", 1, pullRequest.created_at);
    });

    issues
      .filter((issue) => issue.state === "closed")
      .forEach((issue) => {
        incrementContributor(contributors, issue.closed_by?.login || issue.user?.login, "issuesClosed", 1, issue.closed_at);
      });

    return {
      contributors: [...contributors.values()]
        .map((contributor) => ({
          ...contributor,
          contributionScore: contributor.commitCount + contributor.prCount * 3 + contributor.issuesClosed * 2,
        }))
        .sort((a, b) => b.contributionScore - a.contributionScore),
    };
  }
}

export default new GitHubSyncService();
