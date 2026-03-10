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
const REQUEST_TIMEOUT_MS = 5000;

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

// Fetch all org repos
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

// Per-repo fallback for commits — no ?author= filter, match client-side
async function fetchCommitsPerRepo(
  token: string,
  repos: string[],
  username: string,
  since: string,
  until: string
): Promise<{ items: any[]; total_count: number }> {
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
              return (
                authorLogin === userLower ||
                committerLogin === userLower ||
                commitAuthorName === userLower ||
                commitCommitterName === userLower
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
  return { items: allCommits, total_count: allCommits.length };
}

// Per-repo fallback for PRs (returns count only)
async function fetchPRsPerRepo(
  token: string,
  repos: string[],
  username: string,
  startDate: string,
  endDate: string,
  type: "opened" | "merged"
): Promise<number> {
  let count = 0;
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
          if (!res.ok) return 0;
          const prs = await res.json();
          if (!Array.isArray(prs)) return 0;
          let repoCount = 0;
          for (const pr of prs) {
            if (pr.user?.login?.toLowerCase() !== userLower) continue;
            if (type === "opened") {
              const created = pr.created_at?.split("T")[0];
              if (created >= startDate && created <= endDate) repoCount++;
            } else {
              if (!pr.merged_at) continue;
              const merged = pr.merged_at.split("T")[0];
              if (merged >= startDate && merged <= endDate) repoCount++;
            }
          }
          return repoCount;
        } catch {
          return 0;
        }
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") count += result.value;
    }
  }
  return count;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { org_id, github_username, week_start, week_end } = await req.json();
    if (!org_id || !github_username || !week_start || !week_end) {
      throw new Error("org_id, github_username, week_start, week_end required");
    }
    if (github_username === '__none__') {
      return new Response(JSON.stringify({ commits: 0, prs_opened: 0, prs_merged: 0, reviews: 0, top_repos: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: install } = await supabaseAdmin
      .from("github_installations")
      .select("api_token_encrypted, github_org_name")
      .eq("org_id", org_id)
      .single();

    if (!install) throw new Error("No GitHub installation found");
    const token = install.api_token_encrypted;
    const orgName = install.github_org_name;
    const headers = GH_HEADERS(token);

    // Fetch commits via Search API
    const commitAccept = "application/vnd.github.cloak-preview+json";
    const [authorCommitsRes, committerCommitsRes] = await Promise.all([
      fetch(`${GH_API}/search/commits?q=author:${github_username}+committer-date:${week_start}..${week_end}&per_page=100`, { headers: { ...headers, Accept: commitAccept } }),
      fetch(`${GH_API}/search/commits?q=committer:${github_username}+committer-date:${week_start}..${week_end}&per_page=100`, { headers: { ...headers, Accept: commitAccept } }),
    ]);
    const authorData = authorCommitsRes.ok ? await authorCommitsRes.json() : { total_count: 0, items: [] };
    const committerData = committerCommitsRes.ok ? await committerCommitsRes.json() : { total_count: 0, items: [] };

    const seenShas = new Set<string>();
    const mergedCommitItems: any[] = [];
    for (const item of [...(authorData.items || []), ...(committerData.items || [])]) {
      if (item.sha && !seenShas.has(item.sha)) {
        seenShas.add(item.sha);
        mergedCommitItems.push(item);
      }
    }

    let commitsData = { total_count: mergedCommitItems.length, items: mergedCommitItems };

    // FALLBACK: per-repo with client-side author+committer matching
    if (commitsData.total_count === 0 && orgName) {
      console.log(`Search API returned 0 commits for ${github_username}, falling back to per-repo`);
      const orgRepos = await fetchOrgRepos(token, orgName);
      commitsData = await fetchCommitsPerRepo(token, orgRepos, github_username, week_start, week_end);
      console.log(`Per-repo fallback found ${commitsData.total_count} commits`);
    }

    // Fetch PRs opened
    const prsRes = await fetch(
      `${GH_API}/search/issues?q=author:${github_username}+type:pr+created:${week_start}..${week_end}&per_page=100`,
      { headers }
    );
    let prsOpened = 0;
    if (prsRes.ok) {
      const data = await prsRes.json();
      prsOpened = data.total_count || 0;
    }

    // Fetch PRs merged
    const mergedRes = await fetch(
      `${GH_API}/search/issues?q=author:${github_username}+type:pr+merged:${week_start}..${week_end}&per_page=100`,
      { headers }
    );
    let prsMerged = 0;
    if (mergedRes.ok) {
      const data = await mergedRes.json();
      prsMerged = data.total_count || 0;
    }

    // FALLBACK for PRs if search returned 0
    if ((prsOpened === 0 || prsMerged === 0) && orgName && commitsData.total_count > 0) {
      const orgRepos = await fetchOrgRepos(token, orgName);
      if (prsOpened === 0) prsOpened = await fetchPRsPerRepo(token, orgRepos, github_username, week_start, week_end, "opened");
      if (prsMerged === 0) prsMerged = await fetchPRsPerRepo(token, orgRepos, github_username, week_start, week_end, "merged");
    }

    // Fetch reviews
    const reviewsRes = await fetch(
      `${GH_API}/search/issues?q=reviewed-by:${github_username}+type:pr+updated:${week_start}..${week_end}&per_page=100`,
      { headers }
    );
    const reviewsData = reviewsRes.ok ? await reviewsRes.json() : { total_count: 0 };

    const repoSet = new Set<string>();
    for (const item of commitsData.items || []) {
      const repoName = item.repository?.full_name?.split("/").pop();
      if (repoName) repoSet.add(repoName);
    }

    const activity = {
      commits: commitsData.total_count || 0,
      prs_opened: prsOpened,
      prs_merged: prsMerged,
      reviews: reviewsData.total_count || 0,
      top_repos: Array.from(repoSet).slice(0, 5),
    };

    return new Response(JSON.stringify(activity), {
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
