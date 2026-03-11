/**
 * Tests for GitHub sync activity logic.
 * 
 * We extract and test the pure filtering/matching logic that determines
 * whether a commit or PR should be attributed to a given user.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Pure functions extracted for testing ──

/** Check if a commit should be attributed to a user */
function isCommitByUser(commit: any, username: string): boolean {
  const userLower = username.toLowerCase();
  const authorLogin = commit.author?.login?.toLowerCase();
  const committerLogin = commit.committer?.login?.toLowerCase();
  const commitAuthorName = commit.commit?.author?.name?.toLowerCase();
  const commitCommitterName = commit.commit?.committer?.name?.toLowerCase();
  return (
    authorLogin === userLower ||
    committerLogin === userLower ||
    commitAuthorName === userLower ||
    commitCommitterName === userLower
  );
}

/** Check if a PR should be attributed to a user (author OR merger) */
function isPRByUser(pr: any, username: string): boolean {
  const userLower = username.toLowerCase();
  return (
    pr.user?.login?.toLowerCase() === userLower ||
    pr.merged_by?.login?.toLowerCase() === userLower
  );
}

/** Compute start date from daysBack */
function computeStartDate(daysBack: number): string {
  return new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0];
}

// ── Test Data: Lovable merge scenario ──
// Joachim (ClickUpBotGOAT) merges a PR authored by lovable-dev[bot].
// The commit metadata has author=lovable-dev[bot], committer=web-flow.
// Only the PR's merged_by field records ClickUpBotGOAT.

const lovableCommit = {
  sha: "abc123",
  html_url: "https://github.com/noddi-tech/repo/commit/abc123",
  author: { login: "lovable-dev[bot]" },
  committer: { login: "web-flow" },
  commit: {
    message: "feat: add new feature",
    author: { name: "lovable-dev[bot]", date: "2026-03-10T12:00:00Z" },
    committer: { name: "GitHub", date: "2026-03-10T12:00:00Z" },
  },
};

const lovablePR = {
  id: 999,
  number: 42,
  title: "feat: add new feature",
  user: { login: "lovable-dev[bot]" },
  merged_by: { login: "ClickUpBotGOAT" },
  merged_at: "2026-03-10T12:00:00Z",
  created_at: "2026-03-10T11:00:00Z",
  html_url: "https://github.com/noddi-tech/repo/pull/42",
};

const normalCommit = {
  sha: "def456",
  author: { login: "mattisaa" },
  committer: { login: "mattisaa" },
  commit: {
    message: "fix: something",
    author: { name: "mattisaa", date: "2026-03-10T12:00:00Z" },
    committer: { name: "mattisaa", date: "2026-03-10T12:00:00Z" },
  },
};

const normalPR = {
  id: 888,
  number: 41,
  title: "fix: something",
  user: { login: "mattisaa" },
  merged_by: { login: "mattisaa" },
  merged_at: "2026-03-10T12:00:00Z",
  created_at: "2026-03-10T10:00:00Z",
};

// ── Tests ──

Deno.test("Bug 2: Lovable commit is NOT attributed to ClickUpBotGOAT via commit metadata", () => {
  const result = isCommitByUser(lovableCommit, "ClickUpBotGOAT");
  assertEquals(result, false, "Lovable commits have bot author/committer, not the merger");
});

Deno.test("Normal commit IS attributed to mattisaa", () => {
  assertEquals(isCommitByUser(normalCommit, "mattisaa"), true);
});

Deno.test("Bug 3 FIXED: PR merged by ClickUpBotGOAT IS attributed via merged_by", () => {
  const result = isPRByUser(lovablePR, "ClickUpBotGOAT");
  assertEquals(result, true, "PR should match via merged_by.login");
});

Deno.test("PR authored by ClickUpBotGOAT still works", () => {
  const pr = { ...normalPR, user: { login: "ClickUpBotGOAT" } };
  assertEquals(isPRByUser(pr, "ClickUpBotGOAT"), true);
});

Deno.test("PR NOT attributed to unrelated user", () => {
  assertEquals(isPRByUser(lovablePR, "mattisaa"), false);
});

Deno.test("Normal PR IS attributed to author", () => {
  assertEquals(isPRByUser(normalPR, "mattisaa"), true);
});

Deno.test("Bug fix: date range - daysBack=1 should go back 1 full day", () => {
  const today = new Date().toISOString().split("T")[0];
  const startDate = computeStartDate(1);
  assertEquals(startDate < today, true, `startDate ${startDate} should be before today ${today}`);
});

Deno.test("Date range: daysBack=7 goes back 7 days", () => {
  const startDate = computeStartDate(7);
  const expected = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  assertEquals(startDate, expected);
});

Deno.test("isPRByUser is case-insensitive", () => {
  assertEquals(isPRByUser(lovablePR, "clickupbotgoat"), true);
  assertEquals(isPRByUser(lovablePR, "CLICKUPBOTGOAT"), true);
});

// ── ROOT CAUSE BUG: GitHub List endpoint returns merged_by=null ──

Deno.test("BUG REPRODUCTION: List endpoint PRs have merged_by=null — isPRByUser fails", () => {
  // This is what GET /repos/{owner}/{repo}/pulls?state=closed ACTUALLY returns
  const listEndpointPR = {
    id: 999,
    number: 42,
    title: "feat: add new feature",
    user: { login: "lovable-dev[bot]" },
    merged_by: null,  // <-- LIST ENDPOINT NEVER POPULATES THIS
    merged_at: "2026-03-10T12:00:00Z",
    created_at: "2026-03-10T11:00:00Z",
  };
  
  // isPRByUser correctly returns false — merged_by is null from list endpoint
  assertEquals(isPRByUser(listEndpointPR, "ClickUpBotGOAT"), false,
    "List endpoint PRs have merged_by=null, so isPRByUser cannot match the merger");
  
  // The DETAIL endpoint (GET /repos/{owner}/{repo}/pulls/{number}) returns the real merged_by
  const detailEndpointPR = {
    ...listEndpointPR,
    merged_by: { login: "ClickUpBotGOAT" },  // <-- ONLY available from detail endpoint
  };
  
  assertEquals(isPRByUser(detailEndpointPR, "ClickUpBotGOAT"), true,
    "Detail endpoint has merged_by populated, so isPRByUser matches");
});

Deno.test("Merged PR filtering: only date-range PRs need detail fetch", () => {
  // Simulate the filtering step before fetching individual PR details
  const closedPRs = [
    { number: 1, merged_at: "2026-03-10T12:00:00Z", merged_by: null },
    { number: 2, merged_at: null, merged_by: null },  // not merged, skip
    { number: 3, merged_at: "2026-02-01T12:00:00Z", merged_by: null },  // out of range
    { number: 4, merged_at: "2026-03-09T12:00:00Z", merged_by: null },
  ];
  
  const startDate = "2026-03-08";
  const endDate = "2026-03-11";
  
  const needDetailFetch = closedPRs.filter(pr => {
    if (!pr.merged_at) return false;
    const mergedDate = pr.merged_at.split("T")[0];
    return mergedDate >= startDate && mergedDate <= endDate;
  });
  
  assertEquals(needDetailFetch.length, 2, "Only PRs #1 and #4 are merged within date range");
  assertEquals(needDetailFetch.map(pr => pr.number), [1, 4]);
});
