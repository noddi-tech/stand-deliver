import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.208.0/encoding/hex.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifySlackRequest(req: Request, body: string): Promise<boolean> {
  const signingSecret = Deno.env.get("SLACK_SIGNING_SECRET");
  if (!signingSecret) return false;

  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  // Check timestamp freshness (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sigBasestring));
  const mySignature = `v0=${Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")}`;

  return mySignature === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    const verified = await verifySlackRequest(req, bodyText);
    if (!verified) {
      return new Response("Unauthorized", { status: 401 });
    }

    const params = new URLSearchParams(bodyText);
    const command = params.get("command");
    const text = params.get("text") || "";
    const slackUserId = params.get("user_id");
    const teamId = params.get("team_id"); // Slack workspace team ID

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the StandFlow member by slack_user_id
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("id, team_id, user_id")
      .eq("slack_user_id", slackUserId)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!member) {
      return new Response(
        JSON.stringify({
          response_type: "ephemeral",
          text: "❌ Your Slack account isn't linked to StandFlow. Ask your admin to set up the mapping in Settings > Integrations.",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    switch (command) {
      case "/standup": {
        // Trigger standup - call the send-reminder function
        await supabaseAdmin.functions.invoke("slack-send-reminder", {
          body: { team_id: member.team_id },
        });
        return new Response(
          JSON.stringify({
            response_type: "ephemeral",
            text: "🚀 Standup reminders sent to your team!",
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      case "/standup-status": {
        const { data: commitments } = await supabaseAdmin
          .from("commitments")
          .select("title, status, carry_count, priority")
          .eq("member_id", member.id)
          .in("status", ["active", "in_progress", "blocked", "carried"]);

        if (!commitments || commitments.length === 0) {
          return new Response(
            JSON.stringify({
              response_type: "ephemeral",
              text: "✨ You have no open commitments!",
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        const items = commitments.map((c: any) => {
          const statusIcon: Record<string, string> = {
            active: "🔵",
            in_progress: "🔄",
            blocked: "🚫",
            carried: "⚠️",
          };
          const carryBadge = c.carry_count >= 2 ? ` (carried ${c.carry_count}x)` : "";
          return `${statusIcon[c.status] || "•"} ${c.title}${carryBadge}`;
        });

        return new Response(
          JSON.stringify({
            response_type: "ephemeral",
            text: `📋 *Your open commitments:*\n${items.join("\n")}`,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      case "/standup-blocker": {
        if (!text.trim()) {
          return new Response(
            JSON.stringify({
              response_type: "ephemeral",
              text: "Usage: `/standup-blocker [description]`",
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        const { error } = await supabaseAdmin.from("blockers").insert({
          team_id: member.team_id,
          member_id: member.id,
          description: text.trim(),
          category: "other",
        });

        if (error) throw error;

        return new Response(
          JSON.stringify({
            response_type: "ephemeral",
            text: `🚫 Blocker logged: "${text.trim()}"`,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ response_type: "ephemeral", text: "Unknown command." }),
          { headers: { "Content-Type": "application/json" } }
        );
    }
  } catch (err) {
    console.error("Slash handler error:", err);
    return new Response(
      JSON.stringify({ response_type: "ephemeral", text: "Something went wrong." }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});
