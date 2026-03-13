import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GH_API = "https://api.github.com";
const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "StandFlow",
});

const BATCH_SIZE = 10;
const DETAIL_BATCH_SIZE = 5;
const REQUEST_TIMEOUT_MS = 5000;
const TIME_BUDGET_MS = 120_000;

const userIdCache: Record<string, number | null> = {};

async function resolveGitHubUserId(token: string, username: string): Promise<number | null> {
  const key = username.toLowerCase();
  if (key in userIdCache) return userIdCache[key];
  try {
    const res = await fetchWithTimeout(`${GH_API}/users/${username}`, { headers: GH_HEADERS(token) });
    if (!res.ok) {
      userIdCache[key] = null;
      return null;
    }
    const data = await res.json();
    const id = typeof data.id === "number" ? data.id : null;
    userIdCache[key] = id;
    return id;
  } catch {
    userIdCache[key] = null;
    return null;
  }
}

function isCoAuthorMatch(message: string, usernameLower: string, githubUserId: number | null): boolean {
  if (!message.includes("co-authored-by:")) return false;
  if (message.includes(usernameLower)) return true;
  if (githubUserId !== null && message.includes(`<${githubUserId}+`)) return true;
  return false;
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOrgRepos(token: string, orgName: string): Promise<string[]> {
  const repos: string[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${GH_API}/orgs/${orgName}/repos?per_page=100&page=${page}`, {
      headers: GH_HEADERS(token),
    });
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const r of data) repos.push(r.full_name);
    if (data.length < 100) break;
    page++;
  }
  return repos;
}

async function fetchCommitsPerRepo(
  token: string, repos: string[], username: string,
  since: string, until: string, githubUserId: number | null = null
): Promise<any[]> {
  const allCommits: any[] = [];
  const seenShas = new Set<string>();
  const userLower = username.toLowerCase();

  for (let i = 0; i < repos.length; i += BATCH_SIZE) {
    const batch = repos.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (repoFullName) => {
        try {
          const res = await fetchWithTimeout(
            `${GH_API}/repos/${repoFullName}/commits?since=${since}T00:00:00Z&until=${until}T23:59:59Z&per_page=100`,
            { headers: GH_HEADERS(token) }
          );
          if (!res.ok) return [];
          const commits = await res.json();
          if (!Array.isArray(commits)) return [];
          return commits
            .filter((c: any) => {
              const authorLogin = c.author?.login?.toLowerCase();
              const committerLogin = c.committer?.login?.toLowerCase();
              const authorId = c.author?.id;
              const committerId = c.committer?.id;
              const commitAuthorName = c.commit?.author?.name?.toLowerCase();
              const commitCommitterName = c.commit?.committer?.name?.toLowerCase();
              const message = (c.commit?.message || "").toLowerCase();
              // ID-first matching
              if (githubUserId !== null && (authorId === githubUserId || committerId === githubUserId)) return true;
              return (
                authorLogin === userLower || committerLogin === userLower ||
                commitAuthorName === userLower || commitCommitterName === userLower ||
                isCoAuthorMatch(message, userLower, githubUserId)
              );
            })
            .map((c: any) => ({
              sha: c.sha, html_url: c.html_url, commit: c.commit,
              repository: { full_name: repoFullName },
            }));
        } catch { return []; }
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const c of result.value) {
          if (c.sha && !seenShas.has(c.sha)) { seenShas.add(c.sha); allCommits.push(c); }
        }
      }
    }
  }
  return allCommits;
}

async function fetchPRsPerRepo(
  token: string, repos: string[], username: string,
  startDate: string, endDate: string, type: "opened" | "merged",
  githubUserId: number | null = null
): Promise<any[]> {
  const allPRs: any[] = [];
  const seenIds = new Set<number>();
  const userLower = username.toLowerCase();

  for (let i = 0; i < repos.length; i += BATCH_SIZE) {
    const batch = repos.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (repoFullName) => {
        try {
          const res = await fetchWithTimeout(
            `${GH_API}/repos/${repoFullName}/pulls?state=all&sort=updated&direction=desc&per_page=100`,
            { headers: GH_HEADERS(token) }
          );
          if (!res.ok) return [];
          const prs = await res.json();
          if (!Array.isArray(prs)) return [];

          if (type === "opened") {
            return prs
              .filter((pr: any) => {
                const prAuthorLogin = pr.user?.login?.toLowerCase();
                const prAuthorId = pr.user?.id;
                if (prAuthorLogin !== userLower && prAuthorId !== githubUserId) return false;
                const created = pr.created_at?.split("T")[0];
                return created >= startDate && created <= endDate;
              })
              .map((pr: any) => ({ ...pr, _repoFullName: repoFullName }));
          }

          const mergedInRange = prs.filter((pr: any) => {
            if (!pr.merged_at) return false;
            const merged = pr.merged_at.split("T")[0];
            return merged >= startDate && merged <= endDate;
          });

          const isUserPR = (pr: any) => {
            const login = pr.user?.login?.toLowerCase();
            const id = pr.user?.id;
            return login === userLower || (githubUserId !== null && id === githubUserId);
          };

          const authorPRs = mergedInRange
            .filter(isUserPR)
            .map((pr: any) => ({ ...pr, _repoFullName: repoFullName }));

          const nonAuthorPRs = mergedInRange.filter((pr: any) => !isUserPR(pr));

          const mergerPRs: any[] = [];
          for (let j = 0; j < nonAuthorPRs.length; j += DETAIL_BATCH_SIZE) {
            const detailBatch = nonAuthorPRs.slice(j, j + DETAIL_BATCH_SIZE);
            const detailResults = await Promise.allSettled(
              detailBatch.map(async (pr: any) => {
                try {
                  const detailRes = await fetchWithTimeout(
                    `${GH_API}/repos/${repoFullName}/pulls/${pr.number}`,
                    { headers: GH_HEADERS(token) }
                  );
                  if (!detailRes.ok) return null;
                  const detail = await detailRes.json();
                  if (detail.merged_by?.login?.toLowerCase() === userLower) {
                    return { ...detail, _repoFullName: repoFullName };
                  }
                  return null;
                } catch { return null; }
              })
            );
            for (const r of detailResults) {
              if (r.status === "fulfilled" && r.value) mergerPRs.push(r.value);
            }
          }
          return [...authorPRs, ...mergerPRs];
        } catch { return []; }
      })
    );
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const pr of result.value) {
        if (!seenIds.has(pr.id)) {
          seenIds.add(pr.id);
          allPRs.push({ ...pr, repository_url: `${GH_API}/repos/${pr._repoFullName}` });
        }
      }
    }
  }
  return allPRs;
}

async function fetchMergedPRCommits(
  token: string, repos: string[], username: string,
  startDate: string, endDate: string
): Promise<any[]> {
  const allCommits: any[] = [];
  const userLower = username.toLowerCase();

  for (let i = 0; i < repos.length; i += BATCH_SIZE) {
    const batch = repos.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (repoFullName) => {
        try {
          const res = await fetchWithTimeout(
            `${GH_API}/repos/${repoFullName}/pulls?state=closed&sort=updated&direction=desc&per_page=50`,
            { headers: GH_HEADERS(token) }
          );
          if (!res.ok) return [];
          const prs = await res.json();
          if (!Array.isArray(prs)) return [];

          const candidates = prs.filter((pr: any) => {
            if (!pr.merged_at) return false;
            const mergedDate = pr.merged_at.split("T")[0];
            if (mergedDate < startDate || mergedDate > endDate) return false;
            return pr.user?.login?.toLowerCase() !== userLower;
          });
          if (candidates.length === 0) return [];

          const mergedByUser: any[] = [];
          for (let j = 0; j < candidates.length; j += DETAIL_BATCH_SIZE) {
            const detailBatch = candidates.slice(j, j + DETAIL_BATCH_SIZE);
            const detailResults = await Promise.allSettled(
              detailBatch.map(async (pr: any) => {
                try {
                  const detailRes = await fetchWithTimeout(
                    `${GH_API}/repos/${repoFullName}/pulls/${pr.number}`,
                    { headers: GH_HEADERS(token) }
                  );
                  if (!detailRes.ok) return null;
                  const detail = await detailRes.json();
                  if (detail.merged_by?.login?.toLowerCase() === userLower) return detail;
                  return null;
                } catch { return null; }
              })
            );
            for (const r of detailResults) {
              if (r.status === "fulfilled" && r.value) mergedByUser.push(r.value);
            }
          }
          if (mergedByUser.length === 0) return [];

          const commits: any[] = [];
          for (const pr of mergedByUser) {
            try {
              const commitsRes = await fetchWithTimeout(
                `${GH_API}/repos/${repoFullName}/pulls/${pr.number}/commits?per_page=100`,
                { headers: GH_HEADERS(token) }
              );
              if (!commitsRes.ok) continue;
              const prCommits = await commitsRes.json();
              if (!Array.isArray(prCommits)) continue;
              for (const c of prCommits) {
                commits.push({
                  sha: c.sha,
                  html_url: c.html_url || `https://github.com/${repoFullName}/commit/${c.sha}`,
                  commit: c.commit,
                  repository: { full_name: repoFullName },
                  _mergedBy: username,
                });
              }
            } catch { /* skip */ }
          }
          return commits;
        } catch { return []; }
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") allCommits.push(...result.value);
    }
  }
  return allCommits;
}

// ─── ENRICHMENT: Fetch commit detail stats ───
async function fetchCommitStats(
  token: string, commits: { sha: string; repo: string }[]
): Promise<Record<string, { additions: number; deletions: number; files_changed: number }>> {
  const stats: Record<string, { additions: number; deletions: number; files_changed: number }> = {};
  for (let i = 0; i < commits.length; i += DETAIL_BATCH_SIZE) {
    const batch = commits.slice(i, i + DETAIL_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async ({ sha, repo }) => {
        try {
          const res = await fetchWithTimeout(
            `${GH_API}/repos/${repo}/commits/${sha}`,
            { headers: GH_HEADERS(token) }
          );
          if (!res.ok) return null;
          const data = await res.json();
          return {
            sha,
            additions: data.stats?.additions ?? 0,
            deletions: data.stats?.deletions ?? 0,
            files_changed: data.files?.length ?? 0,
          };
        } catch { return null; }
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        stats[r.value.sha] = { additions: r.value.additions, deletions: r.value.deletions, files_changed: r.value.files_changed };
      }
    }
  }
  return stats;
}

// ─── ENRICHMENT: Fetch PR detail stats + review data ───
async function fetchPRDetails(
  token: string, prs: { repo: string; number: number; id: string | number }[]
): Promise<Record<string, {
  additions: number; deletions: number; files_changed: number;
  created_at: string; merged_at: string | null;
  review_count: number; first_review_at: string | null;
  reviews: { user: string; submitted_at: string; state: string }[];
}>> {
  const details: Record<string, any> = {};
  for (let i = 0; i < prs.length; i += DETAIL_BATCH_SIZE) {
    const batch = prs.slice(i, i + DETAIL_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (pr) => {
        try {
          const [detailRes, reviewsRes] = await Promise.all([
            fetchWithTimeout(`${GH_API}/repos/${pr.repo}/pulls/${pr.number}`, { headers: GH_HEADERS(token) }),
            fetchWithTimeout(`${GH_API}/repos/${pr.repo}/pulls/${pr.number}/reviews`, { headers: GH_HEADERS(token) }),
          ]);
          const detail = detailRes.ok ? await detailRes.json() : {};
          const reviewsData = reviewsRes.ok ? await reviewsRes.json() : [];
          const reviews = Array.isArray(reviewsData) ? reviewsData : [];
          const actualReviews = reviews.filter((r: any) => r.state !== "PENDING");
          const firstReview = actualReviews.length > 0
            ? actualReviews.reduce((earliest: any, r: any) =>
                new Date(r.submitted_at) < new Date(earliest.submitted_at) ? r : earliest
              )
            : null;

          return {
            id: String(pr.id),
            additions: detail.additions ?? 0,
            deletions: detail.deletions ?? 0,
            files_changed: detail.changed_files ?? 0,
            created_at: detail.created_at || null,
            merged_at: detail.merged_at || null,
            review_count: actualReviews.length,
            first_review_at: firstReview?.submitted_at || null,
            reviews: actualReviews.map((r: any) => ({
              user: r.user?.login || "unknown",
              submitted_at: r.submitted_at,
              state: r.state,
            })),
          };
        } catch { return null; }
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) details[r.value.id] = r.value;
    }
  }
  return details;
}

// ─── ENRICHMENT: AI-classify commit messages in batch ───
async function classifyCommits(
  titles: string[]
): Promise<Record<number, string>> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || titles.length === 0) return {};

  // Limit to 50 titles per batch to avoid token limits
  const batch = titles.slice(0, 50);
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Classify each commit message into exactly one category: feature, bugfix, refactor, chore, or infra. Use the classify_commits tool to return your results.`,
          },
          {
            role: "user",
            content: batch.map((t, i) => `${i}: ${t}`).join("\n"),
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_commits",
              description: "Return category for each commit by index",
              parameters: {
                type: "object",
                properties: {
                  classifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number" },
                        category: { type: "string", enum: ["feature", "bugfix", "refactor", "chore", "infra"] },
                      },
                      required: ["index", "category"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["classifications"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_commits" } },
      }),
    });

    if (!response.ok) {
      console.error(`AI classify error: ${response.status}`);
      return {};
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return {};

    const result = JSON.parse(toolCall.function.arguments);
    const map: Record<number, string> = {};
    for (const c of result.classifications || []) {
      if (typeof c.index === "number" && typeof c.category === "string") {
        map[c.index] = c.category;
      }
    }
    return map;
  } catch (e) {
    console.error("AI classify exception:", e);
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestStart = Date.now();

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let daysBack = 1;
    let orgIdFilter: string | null = null;
    let offset = 0;
    let limitUsers = 50;
    let isCronTrigger = false;
    try {
      const body = await req.json();
      if (body?.days_back && Number.isFinite(body.days_back)) {
        daysBack = Math.max(1, Math.min(body.days_back, 90));
      }
      if (body?.org_id) orgIdFilter = body.org_id;
      if (body?.offset && Number.isFinite(body.offset)) offset = Math.max(0, body.offset);
      if (body?.limit_users && Number.isFinite(body.limit_users)) limitUsers = Math.max(1, Math.min(body.limit_users, 50));
      if (body?.is_cron) isCronTrigger = true;
    } catch { /* no body */ }

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0];
    const dateRange = `${startDate}..${endDate}`;

    let installQuery = supabaseAdmin
      .from("github_installations")
      .select("org_id, api_token_encrypted, github_org_name");
    if (orgIdFilter) installQuery = installQuery.eq("org_id", orgIdFilter);

    const { data: installations } = await installQuery;

    if (!installations || installations.length === 0) {
      return new Response(JSON.stringify({ message: "No GitHub installations", has_more: false, total_users: 0, processed_users: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allUserEntries: { install: typeof installations[0]; mapping: any; memberRecords: any[] }[] = [];

    for (const install of installations) {
      const { data: mappings } = await supabaseAdmin
        .from("github_user_mappings")
        .select("user_id, github_username, github_display_name, github_user_id")
        .eq("org_id", install.org_id)
        .order("user_id");

      if (!mappings || mappings.length === 0) continue;

      const userIds = mappings.map((m) => m.user_id);
      const { data: teamMembers } = await supabaseAdmin
        .from("team_members")
        .select("id, user_id, team_id")
        .in("user_id", userIds)
        .eq("is_active", true);

      if (!teamMembers || teamMembers.length === 0) continue;

      for (const mapping of mappings) {
        const memberRecords = teamMembers.filter((tm) => tm.user_id === mapping.user_id);
        if (memberRecords.length === 0) continue;
        if (mapping.github_username === '__none__') continue;
        allUserEntries.push({ install, mapping, memberRecords });
      }
    }

    const totalUsers = allUserEntries.length;
    const chunk = allUserEntries.slice(offset, offset + limitUsers);
    const results: any[] = [];
    let processedCount = 0;
    let timeBudgetExceeded = false;
    const orgReposCache: Record<string, string[]> = {};

    // Collect all commit titles across users for batch AI classification
    const allCommitTitlesForAI: { userIdx: number; commitIdx: number; title: string }[] = [];

    for (const entry of chunk) {
      if (Date.now() - requestStart > TIME_BUDGET_MS) {
        console.log(`Time budget exceeded after ${processedCount} users, stopping early`);
        timeBudgetExceeded = true;
        break;
      }

      const { install, mapping, memberRecords } = entry;
      const token = install.api_token_encrypted;
      const headers = GH_HEADERS(token);
      const orgName = install.github_org_name;
      const username = mapping.github_username;

      let githubUserId: number | null = mapping.github_user_id ?? null;
      if (githubUserId === null) {
        githubUserId = await resolveGitHubUserId(token, username);
        if (githubUserId !== null) {
          await supabaseAdmin
            .from("github_user_mappings")
            .update({ github_user_id: githubUserId })
            .eq("user_id", mapping.user_id)
            .eq("org_id", install.org_id);
        }
      }
      console.log(`Syncing ${username} (github_user_id=${githubUserId})`);

      try {
        // --- COMMITS ---
        const commitHeaders = { ...headers, Accept: "application/vnd.github.cloak-preview+json" };
        const [authorRes, committerRes] = await Promise.all([
          fetch(`${GH_API}/search/commits?q=author:${username}+committer-date:${dateRange}&per_page=50`, { headers: commitHeaders }),
          fetch(`${GH_API}/search/commits?q=committer:${username}+committer-date:${dateRange}&per_page=50`, { headers: commitHeaders }),
        ]);
        const authorData = authorRes.ok ? await authorRes.json() : { items: [] };
        const committerData = committerRes.ok ? await committerRes.json() : { items: [] };

    const seenShas = new Set<string>();
    let allCommits: any[] = [];
    for (const item of [...(authorData.items || []), ...(committerData.items || [])]) {
      if (item.sha && !seenShas.has(item.sha)) { seenShas.add(item.sha); allCommits.push(item); }
    }

    // Also search by numeric GitHub user ID if available (catches renamed accounts)
    if (githubUserId) {
      const [authorIdRes, committerIdRes] = await Promise.all([
        fetch(`${GH_API}/search/commits?q=author-id:${githubUserId}+committer-date:${dateRange}&per_page=50`, { headers: commitHeaders }).catch(() => null),
        fetch(`${GH_API}/search/commits?q=committer-id:${githubUserId}+committer-date:${dateRange}&per_page=50`, { headers: commitHeaders }).catch(() => null),
      ]);
      const authorIdData = authorIdRes?.ok ? await authorIdRes.json() : { items: [] };
      const committerIdData = committerIdRes?.ok ? await committerIdRes.json() : { items: [] };
      for (const item of [...(authorIdData.items || []), ...(committerIdData.items || [])]) {
        if (item.sha && !seenShas.has(item.sha)) { seenShas.add(item.sha); allCommits.push(item); }
      }

      // Update username if GitHub login changed
      const currentLogin = allCommits[0]?.author?.login || allCommits[0]?.committer?.login;
      if (currentLogin && currentLogin.toLowerCase() !== username.toLowerCase()) {
        console.log(`GitHub username changed: ${username} → ${currentLogin}, updating mapping`);
        await supabaseAdmin
          .from("github_user_mappings")
          .update({ github_username: currentLogin })
          .eq("user_id", mapping.user_id)
          .eq("org_id", install.org_id);
      }
    }

        // Per-repo scan (catches co-authored commits)
        let orgRepos: string[] | null = orgReposCache[install.org_id] || null;
        if (orgName) {
          if (!orgRepos) {
            orgRepos = await fetchOrgRepos(token, orgName);
            orgReposCache[install.org_id] = orgRepos;
          }
          const perRepoCommits = await fetchCommitsPerRepo(token, orgRepos, username, startDate, endDate, githubUserId);
          for (const c of perRepoCommits) {
            if (c.sha && !seenShas.has(c.sha)) { seenShas.add(c.sha); allCommits.push(c); }
          }
        }

        // Merged PR commits (Lovable bot PRs)
        if (orgName) {
          if (!orgRepos) { orgRepos = await fetchOrgRepos(token, orgName); orgReposCache[install.org_id] = orgRepos; }
          const mergedPRCommits = await fetchMergedPRCommits(token, orgRepos, username, startDate, endDate);
          for (const c of mergedPRCommits) {
            if (c.sha && !seenShas.has(c.sha)) { seenShas.add(c.sha); allCommits.push(c); }
          }
        }

        // ─── ENRICH: Fetch commit stats (additions/deletions/files) ───
        const commitsToEnrich = allCommits
          .map((item) => ({
            sha: item.sha,
            repo: item.repository?.full_name || "",
          }))
          .filter((c) => c.repo);

        let commitStats: Record<string, { additions: number; deletions: number; files_changed: number }> = {};
        if (commitsToEnrich.length > 0 && Date.now() - requestStart < TIME_BUDGET_MS - 15_000) {
          commitStats = await fetchCommitStats(token, commitsToEnrich);
          console.log(`Enriched ${Object.keys(commitStats).length}/${commitsToEnrich.length} commit stats for ${username}`);
        }

        // Collect titles for AI classification
        const userCommitIdx = results.length;
        for (let ci = 0; ci < allCommits.length; ci++) {
          const message = allCommits[ci].commit?.message?.split("\n")[0] || "Commit";
          allCommitTitlesForAI.push({ userIdx: userCommitIdx, commitIdx: ci, title: message });
        }

        // Upsert commits with enriched metadata
        for (const item of allCommits) {
          const sha = item.sha;
          const repo = item.repository?.full_name || "";
          const message = item.commit?.message?.split("\n")[0] || "Commit";
          const stats = commitStats[sha];
          for (const member of memberRecords) {
            try {
              await supabaseAdmin.from("external_activity").upsert(
                {
                  team_id: member.team_id, member_id: member.id,
                  source: "github", activity_type: "commit",
                  title: message, external_id: sha,
                  external_url: item.html_url || `https://github.com/${repo}/commit/${sha}`,
                  metadata: {
                    repo, sha: sha.slice(0, 7),
                    ...(stats ? { additions: stats.additions, deletions: stats.deletions, files_changed: stats.files_changed } : {}),
                  },
                  occurred_at: item.commit?.committer?.date || item.commit?.author?.date || new Date().toISOString(),
                },
                { onConflict: "team_id,member_id,external_id,activity_type,source" }
              );
            } catch { /* dedup */ }
          }
        }

        // --- PRs OPENED ---
        const prsRes = await fetch(
          `${GH_API}/search/issues?q=author:${username}+type:pr+created:${dateRange}&per_page=50`,
          { headers }
        );
        let prsItems: any[] = [];
        if (prsRes.ok) { const data = await prsRes.json(); prsItems = data.items || []; }

        if (prsItems.length === 0 && orgName) {
          if (!orgRepos) { orgRepos = await fetchOrgRepos(token, orgName); orgReposCache[install.org_id] = orgRepos; }
          prsItems = await fetchPRsPerRepo(token, orgRepos, username, startDate, endDate, "opened", githubUserId);
        }

        // --- PRs MERGED ---
        const mergedRes = await fetch(
          `${GH_API}/search/issues?q=author:${username}+type:pr+merged:${dateRange}&per_page=50`,
          { headers }
        );
        let mergedItems: any[] = [];
        if (mergedRes.ok) { const data = await mergedRes.json(); mergedItems = data.items || []; }

        if (orgName) {
          if (!orgRepos) { orgRepos = await fetchOrgRepos(token, orgName); orgReposCache[install.org_id] = orgRepos; }
          const perRepoMerged = await fetchPRsPerRepo(token, orgRepos, username, startDate, endDate, "merged", githubUserId);
          const existingIds = new Set(mergedItems.map((item: any) => item.id));
          for (const pr of perRepoMerged) { if (!existingIds.has(pr.id)) mergedItems.push(pr); }
        }

        // ─── ENRICH: Fetch PR detail stats + reviews ───
        const allPRItems = [...prsItems, ...mergedItems];
        const uniquePRs = new Map<string, { repo: string; number: number; id: string | number }>();
        for (const item of allPRItems) {
          const prId = String(item.id);
          if (!uniquePRs.has(prId)) {
            uniquePRs.set(prId, {
              repo: item.repository_url?.split("/").slice(-2).join("/") || item._repoFullName || "",
              number: item.number,
              id: item.id,
            });
          }
        }

        let prDetails: Record<string, any> = {};
        if (uniquePRs.size > 0 && Date.now() - requestStart < TIME_BUDGET_MS - 15_000) {
          prDetails = await fetchPRDetails(token, Array.from(uniquePRs.values()));
          console.log(`Enriched ${Object.keys(prDetails).length}/${uniquePRs.size} PR details for ${username}`);
        }

        // Upsert PRs opened with enriched metadata
        for (const item of prsItems) {
          const prId = String(item.id);
          const detail = prDetails[prId];
          const repo = item.repository_url?.split("/").slice(-2).join("/") || item._repoFullName || "";
          for (const member of memberRecords) {
            try {
              await supabaseAdmin.from("external_activity").upsert(
                {
                  team_id: member.team_id, member_id: member.id,
                  source: "github", activity_type: "pr_opened",
                  title: item.title, external_id: prId,
                  external_url: item.html_url,
                  metadata: {
                    repo, number: item.number,
                    ...(detail ? {
                      additions: detail.additions, deletions: detail.deletions,
                      files_changed: detail.files_changed,
                      created_at: detail.created_at,
                      review_count: detail.review_count,
                      first_review_at: detail.first_review_at,
                    } : {}),
                  },
                  occurred_at: item.created_at,
                },
                { onConflict: "external_id,activity_type,source" }
              );
            } catch { /* dedup */ }
          }
        }

        // Upsert PRs merged with enriched metadata
        for (const item of mergedItems) {
          const prId = String(item.id);
          const detail = prDetails[prId];
          const repo = item.repository_url?.split("/").slice(-2).join("/") || item._repoFullName || "";
          for (const member of memberRecords) {
            try {
              await supabaseAdmin.from("external_activity").upsert(
                {
                  team_id: member.team_id, member_id: member.id,
                  source: "github", activity_type: "pr_merged",
                  title: item.title, external_id: `merged-${item.id}`,
                  external_url: item.html_url,
                  metadata: {
                    repo, number: item.number,
                    ...(detail ? {
                      additions: detail.additions, deletions: detail.deletions,
                      files_changed: detail.files_changed,
                      created_at: detail.created_at,
                      merged_at: detail.merged_at,
                      review_count: detail.review_count,
                      first_review_at: detail.first_review_at,
                    } : {}),
                  },
                  occurred_at: item.merged_at || item.closed_at || item.updated_at,
                },
                { onConflict: "external_id,activity_type,source" }
              );
            } catch { /* dedup */ }
          }

          // ─── ENRICH: Store PR reviews as separate activity items ───
          if (detail?.reviews) {
            for (const review of detail.reviews) {
              if (review.user.toLowerCase() === username.toLowerCase()) continue; // skip self-reviews
              // Find team members for the reviewer
              const reviewerMapping = allUserEntries.find(
                (e) => e.mapping.github_username.toLowerCase() === review.user.toLowerCase()
              );
              if (!reviewerMapping) continue;
              for (const reviewerMember of reviewerMapping.memberRecords) {
                try {
                  await supabaseAdmin.from("external_activity").upsert(
                    {
                      team_id: reviewerMember.team_id, member_id: reviewerMember.id,
                      source: "github", activity_type: "pr_review",
                      title: `Reviewed: ${item.title}`,
                      external_id: `review-${item.id}-${review.user}-${review.submitted_at}`,
                      external_url: item.html_url,
                      metadata: {
                        repo, number: item.number,
                        review_state: review.state,
                        pr_author: username,
                        reviewed_at: review.submitted_at,
                      },
                      occurred_at: review.submitted_at,
                    },
                    { onConflict: "external_id,activity_type,source" }
                  );
                } catch { /* dedup */ }
              }
            }
          }
        }

        results.push({ org: orgName, user: username, commits: allCommits.length, prs_merged: mergedItems.length });
        processedCount++;
      } catch (e) {
        console.error(`GitHub sync error for ${username}:`, e);
        processedCount++;
      }
    }

    // ─── AI CLASSIFY: Batch classify all commit titles ───
    if (allCommitTitlesForAI.length > 0 && Date.now() - requestStart < TIME_BUDGET_MS - 10_000) {
      const titles = allCommitTitlesForAI.map((t) => t.title);
      const classifications = await classifyCommits(titles);
      if (Object.keys(classifications).length > 0) {
        console.log(`AI classified ${Object.keys(classifications).length}/${titles.length} commits`);
        // Update metadata with work_type for classified commits
        // We need to re-query and update — build a map of title → work_type
        const titleToType: Record<string, string> = {};
        for (const [idxStr, cat] of Object.entries(classifications)) {
          const idx = Number(idxStr);
          if (idx < titles.length) titleToType[titles[idx]] = cat;
        }

        // Batch update external_activity metadata for commits with work_type
        for (const entry of chunk) {
          for (const member of entry.memberRecords) {
            // Fetch recent commits for this member to update
            const { data: recentCommits } = await supabaseAdmin
              .from("external_activity")
              .select("id, title, metadata")
              .eq("member_id", member.id)
              .eq("source", "github")
              .eq("activity_type", "commit")
              .order("occurred_at", { ascending: false })
              .limit(50);

            if (!recentCommits) continue;
            for (const commit of recentCommits) {
              const existingMeta = (commit.metadata as any) || {};
              if (existingMeta.work_type) continue; // already classified
              const workType = titleToType[commit.title];
              if (workType) {
                await supabaseAdmin
                  .from("external_activity")
                  .update({ metadata: { ...existingMeta, work_type: workType } })
                  .eq("id", commit.id);
              }
            }
          }
        }
      }
    }

    const nextOffset = offset + processedCount;
    const hasMore = timeBudgetExceeded || nextOffset < totalUsers;

    // Trigger badge detection for all teams that had activity
    const teamsWithActivity = new Set<string>();
    for (const entry of chunk.slice(0, processedCount || chunk.length)) {
      for (const mr of entry.memberRecords) {
        teamsWithActivity.add(mr.team_id);
      }
    }
    const badgeResults: string[] = [];
    for (const tid of teamsWithActivity) {
      try {
        const badgeRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/detect-badges`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ team_id: tid }),
          }
        );
        if (!badgeRes.ok) {
          const errBody = await badgeRes.text();
          console.error(`detect-badges HTTP ${badgeRes.status} for team ${tid}: ${errBody}`);
          badgeResults.push(`${tid}: ERROR ${badgeRes.status}`);
          continue;
        }
        const badgeData = await badgeRes.json();
        badgeResults.push(`${tid}: ${badgeData.badges_awarded || 0} badges (${(badgeData.details || []).join(", ")})`);
      } catch (e) {
        console.error(`Badge detection failed for team ${tid}:`, e);
        badgeResults.push(`${tid}: EXCEPTION ${e.message}`);
      }
    }
    console.log("Badge detection results:", badgeResults);

    // If triggered by cron and there are more users, self-invoke to continue
    if (isCronTrigger && hasMore && nextOffset < totalUsers) {
      console.log(`Cron continuation: processed ${nextOffset}/${totalUsers}, invoking next batch`);
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/github-sync-activity`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              days_back: daysBack,
              org_id: orgIdFilter,
              offset: nextOffset,
              limit_users: limitUsers,
              is_cron: true,
            }),
          }
        );
      } catch (e) {
        console.error("Cron continuation call failed:", e);
      }
    }

    return new Response(JSON.stringify({
      results,
      processed_users: processedCount,
      total_users: totalUsers,
      offset,
      next_offset: nextOffset,
      has_more: hasMore,
      badge_detection: badgeResults,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
