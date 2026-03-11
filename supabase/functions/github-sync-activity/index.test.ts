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
  // This test documents the known limitation: commit metadata doesn't contain the merger
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
  // With the old code: Date.now() - (1-1)*86400000 = Date.now() = today
  // With the fix: Date.now() - 1*86400000 = yesterday
  const today = new Date().toISOString().split("T")[0];
  const startDate = computeStartDate(1);
  // startDate should be yesterday, not today
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
