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
const TIME_BUDGET_MS = 120_000; // stop before 150s gateway timeout

// Cache for GitHub user ID resolution (username → numeric id)
const userIdCache: Record<string, number | null> = {};

async function resolveGitHubUserId(token: string, username: string): Promise<number | null> {
  const key = username.toLowerCase();
  if (key in userIdCache) return userIdCache[key];
  try {
    const res = await fetchWithTimeout(`${GH_API}/users/${username}`, { headers: GH_HEADERS(token) });
    if (!res.ok) { await res.text(); userIdCache[key] = null; return null; }
    const data = await res.json();
    const id = typeof data.id === "number" ? data.id : null;
    userIdCache[key] = id;
    console.log(`Resolved GitHub user ${username} → id ${id}`);
    return id;
  } catch {
    userIdCache[key] = null;
    return null;
  }
}

/** Check if a commit message has a Co-authored-by trailer matching by username OR numeric user id */
function isCoAuthorMatch(message: string, usernameLower: string, githubUserId: number | null): boolean {
  if (!message.includes("co-authored-by:")) return false;
  // Match by username text (works when username hasn't changed)
  if (message.includes(usernameLower)) return true;
  // Match by numeric user id in noreply email pattern: <{id}+...@users.noreply.github.com>
  if (githubUserId !== null && message.includes(`<${githubUserId}+`)) return true;
  return false;
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
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
  console.log(`fetchOrgRepos: found ${repos.length} repos for org ${orgName}`);
  return repos;
}

async function fetchCommitsPerRepo(
  token: string,
  repos: string[],
  username: string,
  since: string,
  until: string
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
              const commitAuthorName = c.commit?.author?.name?.toLowerCase();
              const commitCommitterName = c.commit?.committer?.name?.toLowerCase();
              const message = (c.commit?.message || "").toLowerCase();
              const isCoAuthor = message.includes("co-authored-by:") && message.includes(userLower);
              return (
                authorLogin === userLower ||
                committerLogin === userLower ||
                commitAuthorName === userLower ||
                commitCommitterName === userLower ||
                isCoAuthor
              );
            })
            .map((c: any) => ({
              sha: c.sha,
              html_url: c.html_url,
              commit: c.commit,
              repository: { full_name: repoFullName },
            }));
        } catch {
          return [];
        }
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const c of result.value) {
          if (c.sha && !seenShas.has(c.sha)) {
            seenShas.add(c.sha);
            allCommits.push(c);
          }
        }
      }
    }
  }
  return allCommits;
}

async function fetchPRsPerRepo(
  token: string,
  repos: string[],
  username: string,
  startDate: string,
  endDate: string,
  type: "opened" | "merged"
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
                if (pr.user?.login?.toLowerCase() !== userLower) return false;
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

          const authorPRs = mergedInRange
            .filter((pr: any) => pr.user?.login?.toLowerCase() === userLower)
            .map((pr: any) => ({ ...pr, _repoFullName: repoFullName }));

          const nonAuthorPRs = mergedInRange.filter(
            (pr: any) => pr.user?.login?.toLowerCase() !== userLower
          );

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
                } catch {
                  return null;
                }
              })
            );
            for (const r of detailResults) {
              if (r.status === "fulfilled" && r.value) mergerPRs.push(r.value);
            }
          }

          return [...authorPRs, ...mergerPRs];
        } catch {
          return [];
        }
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
  token: string,
  repos: string[],
  username: string,
  startDate: string,
  endDate: string
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
            const isAuthor = pr.user?.login?.toLowerCase() === userLower;
            return !isAuthor;
          });

          if (candidates.length === 0) return [];
          console.log(`${repoFullName}: ${candidates.length} merged non-author PRs in range, fetching details`);

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
                  if (detail.merged_by?.login?.toLowerCase() === userLower) {
                    return detail;
                  }
                  return null;
                } catch {
                  return null;
                }
              })
            );
            for (const r of detailResults) {
              if (r.status === "fulfilled" && r.value) mergedByUser.push(r.value);
            }
          }

          if (mergedByUser.length === 0) return [];
          console.log(`${repoFullName}: ${mergedByUser.length} PRs confirmed merged by ${username}`);

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
        } catch {
          return [];
        }
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        allCommits.push(...result.value);
      }
    }
  }
  console.log(`fetchMergedPRCommits: found ${allCommits.length} commits from PRs merged by ${username}`);
  return allCommits;
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
    let limitUsers = 2;
    try {
      const body = await req.json();
      if (body?.days_back && Number.isFinite(body.days_back)) {
        daysBack = Math.max(1, Math.min(body.days_back, 90));
      }
      if (body?.org_id) orgIdFilter = body.org_id;
      if (body?.offset && Number.isFinite(body.offset)) offset = Math.max(0, body.offset);
      if (body?.limit_users && Number.isFinite(body.limit_users)) limitUsers = Math.max(1, Math.min(body.limit_users, 10));
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

    // Build flat user list across installations for pagination
    const allUserEntries: { install: typeof installations[0]; mapping: any; memberRecords: any[] }[] = [];

    for (const install of installations) {
      const { data: mappings } = await supabaseAdmin
        .from("github_user_mappings")
        .select("user_id, github_username, github_display_name")
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
          if (item.sha && !seenShas.has(item.sha)) {
            seenShas.add(item.sha);
            allCommits.push(item);
          }
        }

        // ALWAYS run per-repo scan (catches co-authored commits that Search API misses)
        let orgRepos: string[] | null = orgReposCache[install.org_id] || null;
        if (orgName) {
          if (!orgRepos) {
            orgRepos = await fetchOrgRepos(token, orgName);
            orgReposCache[install.org_id] = orgRepos;
          }
          const perRepoCommits = await fetchCommitsPerRepo(token, orgRepos, username, startDate, endDate);
          for (const c of perRepoCommits) {
            if (c.sha && !seenShas.has(c.sha)) {
              seenShas.add(c.sha);
              allCommits.push(c);
            }
          }
          console.log(`Per-repo scan found ${perRepoCommits.length} additional commits for ${username} (total: ${allCommits.length})`);
        }

        // ALWAYS: Fetch commits from PRs merged by this user (captures Lovable bot PRs)
        if (orgName) {
          if (!orgRepos) {
            orgRepos = await fetchOrgRepos(token, orgName);
            orgReposCache[install.org_id] = orgRepos;
          }
          const mergedPRCommits = await fetchMergedPRCommits(token, orgRepos, username, startDate, endDate);
          for (const c of mergedPRCommits) {
            if (c.sha && !seenShas.has(c.sha)) {
              seenShas.add(c.sha);
              allCommits.push(c);
            }
          }
        }

        for (const item of allCommits) {
          const sha = item.sha;
          const repo = item.repository?.full_name || "";
          const message = item.commit?.message?.split("\n")[0] || "Commit";
          for (const member of memberRecords) {
            try {
              await supabaseAdmin.from("external_activity").upsert(
                {
                  team_id: member.team_id,
                  member_id: member.id,
                  source: "github",
                  activity_type: "commit",
                  title: message,
                  external_id: sha,
                  external_url: item.html_url || `https://github.com/${repo}/commit/${sha}`,
                  metadata: { repo, sha: sha.slice(0, 7) },
                  occurred_at: item.commit?.committer?.date || item.commit?.author?.date || new Date().toISOString(),
                },
                { onConflict: "external_id,activity_type,source" }
              );
            } catch (e) { /* dedup */ }
          }
        }

        // --- PRs OPENED ---
        const prsRes = await fetch(
          `${GH_API}/search/issues?q=author:${username}+type:pr+created:${dateRange}&per_page=50`,
          { headers }
        );
        let prsItems: any[] = [];
        if (prsRes.ok) {
          const data = await prsRes.json();
          prsItems = data.items || [];
        }

        if (prsItems.length === 0 && orgName) {
          if (!orgRepos) {
            orgRepos = await fetchOrgRepos(token, orgName);
            orgReposCache[install.org_id] = orgRepos;
          }
          prsItems = await fetchPRsPerRepo(token, orgRepos, username, startDate, endDate, "opened");
        }

        for (const item of prsItems) {
          for (const member of memberRecords) {
            try {
              await supabaseAdmin.from("external_activity").upsert(
                {
                  team_id: member.team_id,
                  member_id: member.id,
                  source: "github",
                  activity_type: "pr_opened",
                  title: item.title,
                  external_id: String(item.id),
                  external_url: item.html_url,
                  metadata: {
                    repo: item.repository_url?.split("/").slice(-2).join("/"),
                    number: item.number,
                  },
                  occurred_at: item.created_at,
                },
                { onConflict: "external_id,activity_type,source" }
              );
            } catch (e) { /* dedup */ }
          }
        }

        // --- PRs MERGED ---
        const mergedRes = await fetch(
          `${GH_API}/search/issues?q=author:${username}+type:pr+merged:${dateRange}&per_page=50`,
          { headers }
        );
        let mergedItems: any[] = [];
        if (mergedRes.ok) {
          const data = await mergedRes.json();
          mergedItems = data.items || [];
        }

        if (orgName) {
          if (!orgRepos) {
            orgRepos = await fetchOrgRepos(token, orgName);
            orgReposCache[install.org_id] = orgRepos;
          }
          const perRepoMerged = await fetchPRsPerRepo(token, orgRepos, username, startDate, endDate, "merged");
          const existingIds = new Set(mergedItems.map((item: any) => item.id));
          for (const pr of perRepoMerged) {
            if (!existingIds.has(pr.id)) {
              mergedItems.push(pr);
            }
          }
        }

        for (const item of mergedItems) {
          for (const member of memberRecords) {
            try {
              await supabaseAdmin.from("external_activity").upsert(
                {
                  team_id: member.team_id,
                  member_id: member.id,
                  source: "github",
                  activity_type: "pr_merged",
                  title: item.title,
                  external_id: `merged-${item.id}`,
                  external_url: item.html_url,
                  metadata: {
                    repo: item.repository_url?.split("/").slice(-2).join("/") || item._repoFullName,
                    number: item.number,
                  },
                  occurred_at: item.merged_at || item.closed_at || item.updated_at,
                },
                { onConflict: "external_id,activity_type,source" }
              );
            } catch (e) { /* dedup */ }
          }
        }

        results.push({ org: orgName, user: username, commits: allCommits.length, prs_merged: mergedItems.length });
        processedCount++;
      } catch (e) {
        console.error(`GitHub sync error for ${username}:`, e);
        processedCount++;
      }
    }

    const nextOffset = offset + processedCount;
    const hasMore = timeBudgetExceeded || nextOffset < totalUsers;

    return new Response(JSON.stringify({
      results,
      processed_users: processedCount,
      total_users: totalUsers,
      offset,
      next_offset: nextOffset,
      has_more: hasMore,
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
