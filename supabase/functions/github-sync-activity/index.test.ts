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

/** Check if a commit message has a Co-authored-by trailer matching by username OR numeric user id */
function isCoAuthorMatch(message: string, usernameLower: string, githubUserId: number | null): boolean {
  if (!message.includes("co-authored-by:")) return false;
  if (message.includes(usernameLower)) return true;
  if (githubUserId !== null && message.includes(`<${githubUserId}+`)) return true;
  return false;
}

// ── Test Data: Lovable merge scenario ──
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
  const listEndpointPR = {
    id: 999, number: 42, title: "feat: add new feature",
    user: { login: "lovable-dev[bot]" },
    merged_by: null,
    merged_at: "2026-03-10T12:00:00Z",
    created_at: "2026-03-10T11:00:00Z",
  };
  assertEquals(isPRByUser(listEndpointPR, "ClickUpBotGOAT"), false);
  const detailEndpointPR = { ...listEndpointPR, merged_by: { login: "ClickUpBotGOAT" } };
  assertEquals(isPRByUser(detailEndpointPR, "ClickUpBotGOAT"), true);
});

Deno.test("Merged PR filtering: only date-range PRs need detail fetch", () => {
  const closedPRs = [
    { number: 1, merged_at: "2026-03-10T12:00:00Z", merged_by: null },
    { number: 2, merged_at: null, merged_by: null },
    { number: 3, merged_at: "2026-02-01T12:00:00Z", merged_by: null },
    { number: 4, merged_at: "2026-03-09T12:00:00Z", merged_by: null },
  ];
  const startDate = "2026-03-08";
  const endDate = "2026-03-11";
  const needDetailFetch = closedPRs.filter(pr => {
    if (!pr.merged_at) return false;
    const mergedDate = pr.merged_at.split("T")[0];
    return mergedDate >= startDate && mergedDate <= endDate;
  });
  assertEquals(needDetailFetch.length, 2);
  assertEquals(needDetailFetch.map(pr => pr.number), [1, 4]);
});

// ── RENAME-PROOF CO-AUTHOR DETECTION TESTS ──

Deno.test("Co-author: matches by numeric user ID in noreply email (renamed account)", () => {
  // Commit trailer uses old username "ClickUpBotGOAT", but current username is "Jokkos1337"
  const message = "feat: add feature\n\nCo-authored-by: ClickUpBotGOAT <164879107+ClickUpBotGOAT@users.noreply.github.com>".toLowerCase();
  // Should NOT match by username "jokkos1337" (not in trailer)
  assertEquals(isCoAuthorMatch(message, "jokkos1337", null), false, "Username alone should not match renamed account");
  // SHOULD match by numeric user ID 164879107
  assertEquals(isCoAuthorMatch(message, "jokkos1337", 164879107), true, "Numeric ID should match renamed account");
});

Deno.test("Co-author: still matches by current username when not renamed", () => {
  const message = "feat: something\n\nCo-authored-by: mattisaa <12345+mattisaa@users.noreply.github.com>".toLowerCase();
  assertEquals(isCoAuthorMatch(message, "mattisaa", 12345), true, "Should match by username");
  assertEquals(isCoAuthorMatch(message, "mattisaa", null), true, "Should match by username even without userId");
});

Deno.test("Co-author: does NOT match unrelated user", () => {
  const message = "feat: add feature\n\nCo-authored-by: ClickUpBotGOAT <164879107+ClickUpBotGOAT@users.noreply.github.com>".toLowerCase();
  assertEquals(isCoAuthorMatch(message, "someoneelse", 99999), false);
});

Deno.test("Co-author: no trailer means no match", () => {
  const message = "feat: simple commit with no co-authors".toLowerCase();
  assertEquals(isCoAuthorMatch(message, "jokkos1337", 164879107), false);
});

Deno.test("Co-author: multiple trailers, matches correct user by ID", () => {
  const message = `feat: collaborative work

Co-authored-by: OldBot <164879107+OldBot@users.noreply.github.com>
Co-authored-by: AnotherUser <999999+AnotherUser@users.noreply.github.com>`.toLowerCase();
  assertEquals(isCoAuthorMatch(message, "jokkos1337", 164879107), true, "Should match first trailer by ID");
  assertEquals(isCoAuthorMatch(message, "newname", 999999), true, "Should match second trailer by ID");
  assertEquals(isCoAuthorMatch(message, "nobody", 111111), false, "Should not match unrelated ID");
});
