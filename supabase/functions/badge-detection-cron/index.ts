import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get all active teams
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name");

    if (!teams?.length) {
      return new Response(JSON.stringify({ message: "No teams" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: { team_id: string; team_name: string; badges_awarded: number; error?: string }[] = [];

    for (const team of teams) {
      try {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/detect-badges`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ team_id: team.id }),
          }
        );

        if (!res.ok) {
          const body = await res.text();
          console.error(`detect-badges failed for ${team.name}: ${res.status} ${body}`);
          results.push({ team_id: team.id, team_name: team.name, badges_awarded: 0, error: `${res.status}` });
          continue;
        }

        const data = await res.json();
        console.log(`${team.name}: ${data.badges_awarded} badges awarded`, data.details || []);
        results.push({ team_id: team.id, team_name: team.name, badges_awarded: data.badges_awarded || 0 });
      } catch (e) {
        console.error(`Badge detection error for ${team.name}:`, e);
        results.push({ team_id: team.id, team_name: team.name, badges_awarded: 0, error: e.message });
      }
    }

    const totalAwarded = results.reduce((s, r) => s + r.badges_awarded, 0);
    console.log(`Badge detection cron complete: ${totalAwarded} total badges across ${teams.length} teams`);

    return new Response(JSON.stringify({ results, total_awarded: totalAwarded }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("badge-detection-cron error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
