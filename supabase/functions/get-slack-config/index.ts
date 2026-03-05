const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientId = Deno.env.get("SLACK_CLIENT_ID") || "";

  return new Response(
    JSON.stringify({ client_id: clientId }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
