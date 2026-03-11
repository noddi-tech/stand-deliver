import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dev-secret, x-sandbox-origin",
};

const ALLOWED_SANDBOX_EMAIL = "joachim@noddi.no";
const BLOCKED_ORIGINS = ["https://standup-flow-app.lovable.app"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, sandbox } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Path 1: Sandbox one-click (no secret needed, restricted email + origin) ---
    if (sandbox === true) {
      const origin = req.headers.get("x-sandbox-origin") || req.headers.get("origin") || "";
      if (BLOCKED_ORIGINS.includes(origin)) {
        return new Response(JSON.stringify({ error: "Forbidden on production" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (email !== ALLOWED_SANDBOX_EMAIL) {
        return new Response(JSON.stringify({ error: "Only the preset sandbox user is allowed without a secret" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // --- Path 2: Manual impersonation (requires DEV_MODE_SECRET) ---
      const devSecret = req.headers.get("x-dev-secret");
      const expectedSecret = Deno.env.get("DEV_MODE_SECRET");
      if (!expectedSecret || devSecret !== expectedSecret) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenHash = data.properties?.hashed_token;
    if (!tokenHash) {
      return new Response(JSON.stringify({ error: "Failed to generate token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ token_hash: tokenHash, email }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
