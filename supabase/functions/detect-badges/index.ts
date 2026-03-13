import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { team_id, member_id } = await req.json();
    if (!team_id) throw new Error("team_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get members to evaluate
    const memberFilter = member_id
      ? { column: "id", value: member_id }
      : null;

    let membersQuery = supabase
      .from("team_members")
      .select("id, user_id")
      .eq("team_id", team_id)
      .eq("is_active", true);

    if (memberFilter) {
      membersQuery = membersQuery.eq("id", memberFilter.value);
    }

    const { data: members } = await membersQuery;
    if (!members?.length) {
      return new Response(JSON.stringify({ badges_awarded: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get existing badges to avoid duplicates (same badge_id + member_id on same day)
    const today = new Date().toISOString().slice(0, 10);
    const { data: existingBadges } = await supabase
      .from("member_badges")
      .select("member_id, badge_id, earned_at")
      .eq("team_id", team_id);

    const existingSet = new Set(
      (existingBadges || []).map((b: any) => `${b.member_id}:${b.badge_id}:${b.earned_at.slice(0, 10)}`)
    );

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

    let badgesAwarded = 0;
    const newBadges: any[] = [];

    for (const member of members) {
      // Fetch external activity for this member (last 30 days)
      const { data: activity } = await supabase
        .from("external_activity")
        .select("*")
        .eq("member_id", member.id)
        .eq("team_id", team_id)
        .gte("occurred_at", thirtyDaysAgo)
        .order("occurred_at", { ascending: false })
        .limit(500);

      const acts = activity || [];

      // Debug: log activity counts per type
      const typeCounts: Record<string, number> = {};
      for (const a of acts) typeCounts[a.activity_type] = (typeCounts[a.activity_type] || 0) + 1;
      console.log(`Member ${member.id}: ${acts.length} activities`, JSON.stringify(typeCounts));

      // Debug: check architect eligibility
      const prWithFiles = acts.filter((a: any) => 
        (a.activity_type === "pr_merged" || a.activity_type === "pr_opened") && a.metadata?.files_changed !== undefined
      );
      const archEligible = prWithFiles.filter((a: any) => {
        const fc = a.metadata?.files_changed;
        const fcType = typeof fc;
        return fcType === "number" && fc >= 5;
      });
      console.log(`  PRs with files_changed: ${prWithFiles.length}, architect-eligible: ${archEligible.length}`);
      if (prWithFiles.length > 0) {
        const sample = prWithFiles[0];
        console.log(`  Sample PR metadata:`, JSON.stringify({ files_changed: sample.metadata?.files_changed, type: typeof sample.metadata?.files_changed }));
      }

      // Fetch commitments for this member (last 30 days)
      const { data: commitments } = await supabase
        .from("commitments")
        .select("*")
        .eq("member_id", member.id)
        .eq("team_id", team_id)
        .gte("created_at", thirtyDaysAgo)
        .limit(500);

      const comms = commitments || [];

      // Fetch standup responses for this member (last 30 days)
      const { data: responses } = await supabase
        .from("standup_responses")
        .select("submitted_at, session_id")
        .eq("member_id", member.id)
        .gte("submitted_at", thirtyDaysAgo)
        .order("submitted_at", { ascending: true })
        .limit(100);

      const resps = responses || [];

      function tryAward(badgeId: string, metadata: any = {}) {
        const key = `${member.id}:${badgeId}:${today}`;
        if (existingSet.has(key)) return;
        existingSet.add(key);
        newBadges.push({
          member_id: member.id,
          team_id,
          badge_id: badgeId,
          earned_at: now.toISOString(),
          metadata,
        });
        badgesAwarded++;
      }

      // === SURGEON: PR merged bugfix with <10 lines ===
      const bugfixPRs = acts.filter(
        (a) => (a.activity_type === "pr_merged" || a.activity_type === "pr_opened") &&
          a.metadata?.work_type === "bugfix" &&
          typeof a.metadata?.additions === "number" &&
          typeof a.metadata?.deletions === "number" &&
          (a.metadata.additions + a.metadata.deletions) < 10
      );
      if (bugfixPRs.length > 0) {
        tryAward("surgeon", { pr: bugfixPRs[0].title });
      }

      // === JANITOR: Net negative LOC in last 7 days ===
      const weekCommits = acts.filter(
        (a) => a.activity_type === "commit" &&
          a.occurred_at >= sevenDaysAgo &&
          typeof a.metadata?.additions === "number" &&
          typeof a.metadata?.deletions === "number"
      );
      if (weekCommits.length > 0) {
        const netLOC = weekCommits.reduce(
          (sum: number, c: any) => sum + (c.metadata.additions - c.metadata.deletions), 0
        );
        if (netLOC < 0) {
          tryAward("janitor", { net_loc: netLOC });
        }
      }

      // === SHIPPER: PR open->merged in <4 hours ===
      const fastPRs = acts.filter((a) => {
        if (a.activity_type !== "pr_merged" && a.activity_type !== "pr_opened") return false;
        const created = a.metadata?.created_at;
        const merged = a.metadata?.merged_at;
        if (!created || !merged) return false;
        const hours = (new Date(merged).getTime() - new Date(created).getTime()) / 3600000;
        return hours > 0 && hours < 4;
      });
      if (fastPRs.length > 0) {
        tryAward("shipper", { pr: fastPRs[0].title, hours: Math.round((new Date(fastPRs[0].metadata?.merged_at).getTime() - new Date(fastPRs[0].metadata?.created_at).getTime()) / 3600000 * 10) / 10 });
      }

      // === STREAK: Committed every workday for 2 weeks ===
      const commitDates = new Set(
        acts
          .filter((a) => a.activity_type === "commit" && a.occurred_at >= fourteenDaysAgo)
          .map((a) => a.occurred_at.slice(0, 10))
      );
      // Count workdays in last 14 days
      const workdays: string[] = [];
      for (let d = 0; d < 14; d++) {
        const date = new Date(now.getTime() - d * 86400000);
        const dow = date.getDay();
        if (dow !== 0 && dow !== 6) workdays.push(date.toISOString().slice(0, 10));
      }
      if (workdays.length >= 10 && workdays.every((d) => commitDates.has(d))) {
        tryAward("streak", { days: workdays.length });
      }

      // === PROMISE KEEPER: 5 consecutive days all commitments completed ===
      // Group commitments by the date they were created
      const commitmentsByDate: Record<string, { total: number; done: number }> = {};
      for (const c of comms) {
        const date = c.created_at.slice(0, 10);
        if (!commitmentsByDate[date]) commitmentsByDate[date] = { total: 0, done: 0 };
        commitmentsByDate[date].total++;
        if (c.status === "done") commitmentsByDate[date].done++;
      }
      const sortedDates = Object.keys(commitmentsByDate).sort().reverse();
      let consecutivePerfect = 0;
      for (const d of sortedDates) {
        const { total, done } = commitmentsByDate[d];
        if (total > 0 && done === total) {
          consecutivePerfect++;
        } else {
          break;
        }
      }
      if (consecutivePerfect >= 5) {
        tryAward("promise_keeper", { consecutive_days: consecutivePerfect });
      }

      // === SPEED REVIEWER: 3+ reviews given within 2 hours of PR creation ===
      const fastReviews = acts.filter((a) => {
        if (a.activity_type !== "pr_review") return false;
        const prCreated = a.metadata?.pr_created_at;
        const reviewedAt = a.metadata?.reviewed_at || a.occurred_at;
        if (!prCreated) return false;
        const hours = (new Date(reviewedAt).getTime() - new Date(prCreated).getTime()) / 3600000;
        return hours > 0 && hours <= 2;
      });
      if (fastReviews.length >= 3) {
        tryAward("speed_reviewer", { fast_review_count: fastReviews.length });
      }

      // === ARCHITECT: PR with 5+ files changed (structural change) ===
      const architectPRs = acts.filter(
        (a) => (a.activity_type === "pr_merged" || a.activity_type === "pr_opened") &&
          typeof a.metadata?.files_changed === "number" &&
          a.metadata.files_changed >= 5
      );
      if (architectPRs.length > 0) {
        tryAward("architect", { pr: architectPRs[0].title, files: architectPRs[0].metadata.files_changed });
      }

      // === GUARDIAN: Review that led to changes (commits after review, before merge) ===
      const prReviews = acts.filter((a) => a.activity_type === "pr_review");
      for (const review of prReviews) {
        const prNumber = review.metadata?.pr_number;
        const repo = review.metadata?.repo;
        const reviewedAt = review.metadata?.reviewed_at || review.occurred_at;
        if (!prNumber || !repo || !reviewedAt) continue;
        // Find if a PR was merged after this review AND had commits after the review
        const relatedMerge = acts.find(
          (a) => (a.activity_type === "pr_merged") &&
            a.metadata?.pr_number === prNumber &&
            a.metadata?.repo === repo &&
            a.metadata?.merged_at &&
            new Date(a.metadata.merged_at).getTime() > new Date(reviewedAt).getTime()
        );
        if (relatedMerge) {
          // Check for commits on same repo after review but before merge
          const commitAfterReview = acts.find(
            (a) => a.activity_type === "commit" &&
              a.metadata?.repo === repo &&
              new Date(a.occurred_at).getTime() > new Date(reviewedAt).getTime() &&
              new Date(a.occurred_at).getTime() < new Date(relatedMerge.metadata.merged_at).getTime()
          );
          if (commitAfterReview) {
            tryAward("guardian", { pr: relatedMerge.title, repo });
            break;
          }
        }
        // Fallback: reviewer left 2+ review comments (metadata.review_comments >= 2)
        if (typeof review.metadata?.review_comments === "number" && review.metadata.review_comments >= 2) {
          tryAward("guardian", { pr: review.metadata?.pr_title || review.title, comments: review.metadata.review_comments });
          break;
        }
      }

      // === COLLABORATOR: Co-authored with 3+ people in 30 days ===
      const coauthors = new Set<string>();
      for (const a of acts) {
        if (a.activity_type === "commit" && a.metadata?.co_authored) {
          // Count unique repos as a proxy for collaborators
          coauthors.add(a.metadata.repo || "unknown");
        }
      }
      // Also check review interactions
      const reviewedPRAuthors = new Set<string>();
      for (const a of acts) {
        if (a.activity_type === "pr_review" && a.metadata?.pr_author) {
          reviewedPRAuthors.add(a.metadata.pr_author);
        }
      }
      if (reviewedPRAuthors.size >= 3) {
        tryAward("collaborator", { collaborators: reviewedPRAuthors.size });
      }

      // === FIRST COMMIT: First contribution to a new repository ===
      // Check if any commit is to a repo they haven't committed to before the 30-day window
      const recentRepos = new Set(
        acts.filter((a) => a.activity_type === "commit").map((a) => a.metadata?.repo).filter(Boolean)
      );
      if (recentRepos.size > 0) {
        // Check if any of these repos had no prior activity
        const { data: olderActivity } = await supabase
          .from("external_activity")
          .select("metadata")
          .eq("member_id", member.id)
          .eq("activity_type", "commit")
          .lt("occurred_at", thirtyDaysAgo)
          .limit(500);

        const oldRepos = new Set(
          (olderActivity || []).map((a: any) => a.metadata?.repo).filter(Boolean)
        );
        for (const repo of recentRepos) {
          if (!oldRepos.has(repo)) {
            tryAward("first_commit", { repo });
            break;
          }
        }
      }
    }

    // Bulk insert new badges
    if (newBadges.length > 0) {
      const { error } = await supabase.from("member_badges").insert(newBadges);
      if (error) {
        console.error("Failed to insert badges:", error);
        // Try one by one for partial success
        for (const badge of newBadges) {
          await supabase.from("member_badges").insert(badge);
        }
      }
    }

    return new Response(
      JSON.stringify({ badges_awarded: badgesAwarded, details: newBadges.map((b) => b.badge_id) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("detect-badges error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
