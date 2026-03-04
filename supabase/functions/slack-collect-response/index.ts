import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Slack sends interactive payloads as application/x-www-form-urlencoded
    const formData = await req.formData();
    const payloadStr = formData.get("payload") as string;
    if (!payloadStr) throw new Error("No payload");

    const payload = JSON.parse(payloadStr);
    if (payload.type !== "block_actions") {
      return new Response("", { status: 200 });
    }

    const action = payload.actions?.[0];
    if (!action) return new Response("", { status: 200 });

    const actionId = action.action_id;
    const value = JSON.parse(action.value || "{}");
    const { team_id, member_id, commitment_id } = value;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let responseText = "";

    switch (actionId) {
      case "start_standup": {
        responseText = "✅ Great! Head to StandFlow to complete your standup.";
        break;
      }
      case "snooze_standup": {
        responseText = "⏰ Snoozed! I'll remind you in 30 minutes.";
        break;
      }
      case "skip_standup": {
        responseText = "⏭️ Skipped today's standup.";
        break;
      }
      case "mark_done": {
        if (commitment_id) {
          await supabaseAdmin
            .from("commitments")
            .update({ status: "done", resolved_at: new Date().toISOString() })
            .eq("id", commitment_id);
          responseText = "✅ Marked as done!";
        }
        break;
      }
      case "mark_blocked": {
        if (commitment_id) {
          await supabaseAdmin
            .from("commitments")
            .update({ status: "blocked" })
            .eq("id", commitment_id);
          responseText = "🚫 Marked as blocked.";
        }
        break;
      }
      default:
        responseText = "Action received.";
    }

    // Update the original message
    return new Response(
      JSON.stringify({
        replace_original: true,
        text: responseText,
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: responseText },
          },
        ],
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ text: "Something went wrong." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
