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

      for (const mapping of mappings) {
        const memberRecords = teamMembers.filter((tm) => tm.user_id === mapping.user_id);
        if (memberRecords.length === 0) continue;

        const username = mapping.github_username;
        if (username === '__none__') continue;

        try {
          // Fetch commits - search both author: and committer: to catch bot-authored commits
          const commitHeaders = { ...headers, Accept: "application/vnd.github.cloak-preview+json" };
          const [authorRes, committerRes] = await Promise.all([
            fetch(`${GH_API}/search/commits?q=author:${username}+committer-date:${dateRange}&per_page=50`, { headers: commitHeaders }),
            fetch(`${GH_API}/search/commits?q=committer:${username}+committer-date:${dateRange}&per_page=50`, { headers: commitHeaders }),
          ]);
          const authorData = authorRes.ok ? await authorRes.json() : { items: [] };
          const committerData = committerRes.ok ? await committerRes.json() : { items: [] };

          // Merge and deduplicate by SHA
          const seenShas = new Set<string>();
          const allCommits: any[] = [];
          for (const item of [...(authorData.items || []), ...(committerData.items || [])]) {
            if (item.sha && !seenShas.has(item.sha)) {
              seenShas.add(item.sha);
              allCommits.push(item);
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
                      occurred_at: item.commit?.committer?.date || new Date().toISOString(),
                    },
                    { onConflict: "external_id,activity_type,source" }
                  );
                } catch (e) { /* dedup conflict */ }
              }
          }

          // Fetch PRs opened today
          const prsRes = await fetch(
            `${GH_API}/search/issues?q=author:${username}+type:pr+created:${dateRange}&per_page=50`,
            { headers }
          );
          if (prsRes.ok) {
            const data = await prsRes.json();
            for (const item of data.items || []) {
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
          }

          // Fetch PRs merged today
          const mergedRes = await fetch(
            `${GH_API}/search/issues?q=author:${username}+type:pr+merged:${today}&per_page=50`,
            { headers }
          );
          if (mergedRes.ok) {
            const data = await mergedRes.json();
            for (const item of data.items || []) {
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
                      occurred_at: item.closed_at || item.updated_at,
                    },
                    { onConflict: "external_id,activity_type,source" }
                  );
                } catch (e) { /* dedup conflict */ }
              }
            }
          }

          results.push({ org: install.github_org_name, user: username });
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
