import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GH_API = "https://api.github.com";
const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "StandFlow",
});

// Fetch all org repos (cached per org per invocation)
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

// Per-repo fallback: fetch commits from each repo's Commits API
async function fetchCommitsPerRepo(
  token: string,
  repos: string[],
  username: string,
  since: string,
  until: string
): Promise<any[]> {
  const allCommits: any[] = [];
  const seenShas = new Set<string>();
  for (const repoFullName of repos) {
    try {
      const res = await fetch(
        `${GH_API}/repos/${repoFullName}/commits?author=${username}&since=${since}T00:00:00Z&until=${until}T23:59:59Z&per_page=100`,
        { headers: GH_HEADERS(token) }
      );
      if (!res.ok) continue;
      const commits = await res.json();
      if (!Array.isArray(commits)) continue;
      for (const c of commits) {
        if (c.sha && !seenShas.has(c.sha)) {
          seenShas.add(c.sha);
          allCommits.push({
            sha: c.sha,
            html_url: c.html_url,
            commit: c.commit,
            repository: { full_name: repoFullName },
          });
        }
      }
    } catch { /* skip repo */ }
  }
  return allCommits;
}

// Per-repo fallback: fetch PRs from each repo's Pulls API
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
  for (const repoFullName of repos) {
    try {
      const res = await fetch(
        `${GH_API}/repos/${repoFullName}/pulls?state=all&sort=updated&direction=desc&per_page=100`,
        { headers: GH_HEADERS(token) }
      );
      if (!res.ok) continue;
      const prs = await res.json();
      if (!Array.isArray(prs)) continue;
      for (const pr of prs) {
        if (seenIds.has(pr.id)) continue;
        if (pr.user?.login?.toLowerCase() !== username.toLowerCase()) continue;
        if (type === "opened") {
          const created = pr.created_at?.split("T")[0];
          if (created >= startDate && created <= endDate) {
            seenIds.add(pr.id);
            allPRs.push({ ...pr, repository_url: `${GH_API}/repos/${repoFullName}` });
          }
        } else {
          if (!pr.merged_at) continue;
          const merged = pr.merged_at.split("T")[0];
          if (merged >= startDate && merged <= endDate) {
            seenIds.add(pr.id);
            allPRs.push({ ...pr, repository_url: `${GH_API}/repos/${repoFullName}` });
          }
        }
      }
    } catch { /* skip repo */ }
  }
  return allPRs;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse optional days_back from request body (default: 1)
    let daysBack = 1;
    try {
      const body = await req.json();
      if (body?.days_back && Number.isFinite(body.days_back)) {
        daysBack = Math.max(1, Math.min(body.days_back, 90));
      }
    } catch { /* no body or invalid JSON — use default */ }

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - (daysBack - 1) * 86400000).toISOString().split("T")[0];
    const dateRange = daysBack === 1 ? endDate : `${startDate}..${endDate}`;

    // Get all orgs with GitHub installed
    const { data: installations } = await supabaseAdmin
      .from("github_installations")
      .select("org_id, api_token_encrypted, github_org_name");

    if (!installations || installations.length === 0) {
      return new Response(JSON.stringify({ message: "No GitHub installations" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const install of installations) {
      const token = install.api_token_encrypted;
      const headers = GH_HEADERS(token);
      const orgName = install.github_org_name;

      // Get all user mappings for this org
      const { data: mappings } = await supabaseAdmin
        .from("github_user_mappings")
        .select("user_id, github_username, github_display_name")
        .eq("org_id", install.org_id);

      if (!mappings || mappings.length === 0) continue;

      const userIds = mappings.map((m) => m.user_id);
      const { data: teamMembers } = await supabaseAdmin
        .from("team_members")
        .select("id, user_id, team_id")
        .in("user_id", userIds)
        .eq("is_active", true);

      if (!teamMembers || teamMembers.length === 0) continue;

      // Cache org repos for fallback (fetched lazily)
      let orgRepos: string[] | null = null;

      for (const mapping of mappings) {
        const memberRecords = teamMembers.filter((tm) => tm.user_id === mapping.user_id);
        if (memberRecords.length === 0) continue;

        const username = mapping.github_username;
        if (username === '__none__') continue;

        try {
          // --- COMMITS ---
          const commitHeaders = { ...headers, Accept: "application/vnd.github.cloak-preview+json" };
          const [authorRes, committerRes] = await Promise.all([
            fetch(`${GH_API}/search/commits?q=author:${username}+committer-date:${dateRange}&per_page=50`, { headers: commitHeaders }),
            fetch(`${GH_API}/search/commits?q=committer:${username}+committer-date:${dateRange}&per_page=50`, { headers: commitHeaders }),
          ]);
          const authorData = authorRes.ok ? await authorRes.json() : { items: [] };
          const committerData = committerRes.ok ? await committerRes.json() : { items: [] };

          // Merge and deduplicate by SHA
          const seenShas = new Set<string>();
          let allCommits: any[] = [];
          for (const item of [...(authorData.items || []), ...(committerData.items || [])]) {
            if (item.sha && !seenShas.has(item.sha)) {
              seenShas.add(item.sha);
              allCommits.push(item);
            }
          }

          // FALLBACK: If Search API returned 0 commits, try per-repo approach
          if (allCommits.length === 0 && orgName) {
            console.log(`Search API returned 0 commits for ${username}, falling back to per-repo`);
            if (!orgRepos) orgRepos = await fetchOrgRepos(token, orgName);
            allCommits = await fetchCommitsPerRepo(token, orgRepos, username, startDate, endDate);
            console.log(`Per-repo fallback found ${allCommits.length} commits for ${username}`);
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
              } catch (e) { /* dedup conflict */ }
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

          // FALLBACK for PRs opened
          if (prsItems.length === 0 && orgName) {
            if (!orgRepos) orgRepos = await fetchOrgRepos(token, orgName);
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
              } catch (e) { /* dedup conflict */ }
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

          // FALLBACK for PRs merged
          if (mergedItems.length === 0 && orgName) {
            if (!orgRepos) orgRepos = await fetchOrgRepos(token, orgName);
            mergedItems = await fetchPRsPerRepo(token, orgRepos, username, startDate, endDate, "merged");
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
                      repo: item.repository_url?.split("/").slice(-2).join("/"),
                      number: item.number,
                    },
                    occurred_at: item.merged_at || item.closed_at || item.updated_at,
                  },
                  { onConflict: "external_id,activity_type,source" }
                );
              } catch (e) { /* dedup conflict */ }
            }
          }

          results.push({ org: orgName, user: username, commits: allCommits.length });
        } catch (e) {
          console.error(`GitHub sync error for ${username}:`, e);
        }
      }
    }

    return new Response(JSON.stringify({ results }), {
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
