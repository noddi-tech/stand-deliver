import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.test("detect-badges debug - check data conditions", async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  
  const teamId = "d921254a-c5d6-4eda-b346-01829c5872ca";
  
  const { data: members } = await supabase
    .from("team_members")
    .select("id, user_id")
    .eq("team_id", teamId)
    .eq("is_active", true);
  
  console.log("Members found:", members?.length);
  
  for (const member of (members || []).slice(0, 3)) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    
    const { data: activity, error } = await supabase
      .from("external_activity")
      .select("*")
      .eq("member_id", member.id)
      .eq("team_id", teamId)
      .gte("occurred_at", thirtyDaysAgo)
      .order("occurred_at", { ascending: false })
      .limit(500);
    
    if (error) {
      console.log(`Error fetching activity for ${member.id}:`, error);
      continue;
    }
    
    const acts = activity || [];
    console.log(`\n=== Member ${member.id} ===`);
    console.log(`Total activities: ${acts.length}`);
    
    // Type counts
    const typeCounts: Record<string, number> = {};
    for (const a of acts) typeCounts[a.activity_type] = (typeCounts[a.activity_type] || 0) + 1;
    console.log("Type counts:", JSON.stringify(typeCounts));
    
    // Architect check
    const prs = acts.filter((a: any) => a.activity_type === "pr_merged" || a.activity_type === "pr_opened");
    if (prs.length > 0) {
      const sample = prs[0];
      console.log("Sample PR metadata keys:", Object.keys(sample.metadata || {}));
      console.log("files_changed:", sample.metadata?.files_changed, "type:", typeof sample.metadata?.files_changed);
      
      const eligible = prs.filter((a: any) => typeof a.metadata?.files_changed === "number" && a.metadata.files_changed >= 5);
      console.log(`Architect eligible: ${eligible.length} / ${prs.length} PRs`);
    }
    
    // Shipper check
    const mergedWithTs = acts.filter((a: any) => 
      a.activity_type === "pr_merged" && a.metadata?.created_at && a.metadata?.merged_at
    );
    if (mergedWithTs.length > 0) {
      const pr = mergedWithTs[0];
      const hours = (new Date(pr.metadata.merged_at).getTime() - new Date(pr.metadata.created_at).getTime()) / 3600000;
      console.log(`Shipper: ${mergedWithTs.length} merged PRs with timestamps, sample hours: ${hours}`);
    }
    
    // Janitor check
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const weekCommits = acts.filter(
      (a: any) => a.activity_type === "commit" &&
        a.occurred_at >= sevenDaysAgo &&
        typeof a.metadata?.additions === "number" &&
        typeof a.metadata?.deletions === "number"
    );
    if (weekCommits.length > 0) {
      const netLOC = weekCommits.reduce(
        (sum: number, c: any) => sum + (c.metadata.additions - c.metadata.deletions), 0
      );
      console.log(`Janitor: ${weekCommits.length} commits, net LOC: ${netLOC}`);
    }
  }
  
  // Now call the actual function
  const res = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/detect-badges`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ team_id: teamId }),
    }
  );
  
  console.log("\nFunction response status:", res.status);
  const data = await res.json();
  console.log("Function response:", JSON.stringify(data));
  
  // We expect badges to be awarded
  console.log("Badges awarded:", data.badges_awarded);
});
