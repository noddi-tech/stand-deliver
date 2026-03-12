import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { org_id, api_token, action, github_org_name } = await req.json();
    if (!org_id) throw new Error("org_id required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Handle disconnect
    if (action === "disconnect") {
      await supabaseAdmin.from("github_user_mappings").delete().eq("org_id", org_id);
      await supabaseAdmin.from("github_installations").delete().eq("org_id", org_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle list-members (re-fetch org members)
    if (action === "list-members") {
      const { data: install } = await supabaseAdmin
        .from("github_installations")
        .select("api_token_encrypted, github_org_name")
        .eq("org_id", org_id)
        .single();

      if (!install) throw new Error("No GitHub installation found");

      const result = await fetchOrgMembers(install.api_token_encrypted, install.github_org_name);
      return new Response(JSON.stringify({ members: result.members, members_error: result.error || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Connect flow: validate token
    if (!api_token) throw new Error("api_token required");

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${api_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "StandFlow",
      },
    });

    if (!userRes.ok) {
      const body = await userRes.text();
      throw new Error(`Invalid GitHub token: ${userRes.status} ${body}`);
    }

    const ghUser = await userRes.json();

    // Upsert installation
    const { error: upsertErr } = await supabaseAdmin
      .from("github_installations")
      .upsert(
        {
          org_id,
          api_token_encrypted: api_token,
          github_org_name: github_org_name || null,
          installed_by: null, // Could extract from auth header if needed
        },
        { onConflict: "org_id" }
      );

    if (upsertErr) throw upsertErr;

    // Fetch org members if org name provided
    const result = await fetchOrgMembers(api_token, github_org_name);

    return new Response(
      JSON.stringify({
        username: ghUser.login,
        avatar_url: ghUser.avatar_url,
        members: result.members,
        members_error: result.error || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchOrgMembers(token: string, orgName: string | null): Promise<{ members: any[]; error?: string }> {
  if (!orgName) return { members: [] };
  try {
    const res = await fetch(`https://api.github.com/orgs/${orgName}/members?per_page=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "StandFlow",
      },
    });
    if (!res.ok) {
      const status = res.status;
      console.error(`GitHub org members fetch failed: ${status}`);
      if (status === 403 || status === 404) {
        return { members: [], error: "Token lacks Organization Members read permission" };
      }
      return { members: [], error: `GitHub API returned ${status}` };
    }
    const members = await res.json();
    return {
      members: members.map((m: any) => ({
        login: m.login,
        avatar_url: m.avatar_url,
        id: m.id,
      })),
    };
  } catch (e) {
    console.error("fetchOrgMembers error:", e);
    return { members: [], error: "Failed to fetch org members" };
  }
}

async function resolveGitHubUserId(token: string, username: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "StandFlow",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.id === "number" ? data.id : null;
  } catch {
    return null;
  }
}
