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
      .select("api_token_encrypted")
      .eq("org_id", org_id)
      .single();

    if (!install) throw new Error("No GitHub installation found");
    const token = install.api_token_encrypted;
    const headers = GH_HEADERS(token);

    // Fetch commits
    const commitsRes = await fetch(
      `${GH_API}/search/commits?q=author:${github_username}+committer-date:${week_start}..${week_end}&per_page=100`,
      { headers: { ...headers, Accept: "application/vnd.github.cloak-preview+json" } }
    );
    const commitsData = commitsRes.ok ? await commitsRes.json() : { total_count: 0, items: [] };

    // Fetch PRs opened
    const prsRes = await fetch(
      `${GH_API}/search/issues?q=author:${github_username}+type:pr+created:${week_start}..${week_end}&per_page=100`,
      { headers }
    );
    const prsData = prsRes.ok ? await prsRes.json() : { total_count: 0, items: [] };

    // Fetch PRs merged (closed PRs by author that were merged)
    const mergedRes = await fetch(
      `${GH_API}/search/issues?q=author:${github_username}+type:pr+merged:${week_start}..${week_end}&per_page=100`,
      { headers }
    );
    const mergedData = mergedRes.ok ? await mergedRes.json() : { total_count: 0 };

    // Fetch reviews
    const reviewsRes = await fetch(
      `${GH_API}/search/issues?q=reviewed-by:${github_username}+type:pr+updated:${week_start}..${week_end}&per_page=100`,
      { headers }
    );
    const reviewsData = reviewsRes.ok ? await reviewsRes.json() : { total_count: 0 };

    // Extract top repos from commits
    const repoSet = new Set<string>();
    for (const item of commitsData.items || []) {
      const repoName = item.repository?.full_name?.split("/").pop();
      if (repoName) repoSet.add(repoName);
    }

    const activity = {
      commits: commitsData.total_count || 0,
      prs_opened: prsData.total_count || 0,
      prs_merged: mergedData.total_count || 0,
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
