import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    // Read raw body for signature verification
    const bodyText = await req.text();

    // Verify Slack signature
    const verified = await verifySlackRequest(req, bodyText);
    if (!verified) {
      console.error("Slack signature verification failed");
      return new Response("Unauthorized", { status: 401 });
    }

    // Slack sends interactive payloads as application/x-www-form-urlencoded
    const params = new URLSearchParams(bodyText);
    const payloadStr = params.get("payload");
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
