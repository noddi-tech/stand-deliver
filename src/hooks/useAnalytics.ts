import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfWeek, format } from "date-fns";

export function useUserTeam() {
  return useQuery({
    queryKey: ["user-team"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("team_members")
        .select("id, team_id, role, team:teams(id, name)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();
      return data;
    },
  });
}

export function useAnalyticsMetrics(teamId: string | undefined) {
  return useQuery({
    queryKey: ["analytics-metrics", teamId],
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [commitments, blockers, sessions, responses] = await Promise.all([
        supabase.from("commitments").select("*").eq("team_id", teamId!),
        supabase.from("blockers").select("*").eq("team_id", teamId!),
        supabase.from("standup_sessions").select("*").eq("team_id", teamId!).order("session_date", { ascending: false }).limit(30),
        supabase.from("standup_responses").select("*, session:standup_sessions!inner(team_id)").eq("session.team_id", teamId!),
      ]);

      const allCommitments = commitments.data || [];
      const allBlockers = blockers.data || [];
      const allSessions = sessions.data || [];
      const allResponses = responses.data || [];

      const total = allCommitments.length;
      const done = allCommitments.filter(c => c.status === "done").length;
      const carried = allCommitments.filter(c => c.status === "carried" || c.carry_count > 0).length;
      const blocked = allBlockers.filter(b => !b.is_resolved).length;
      const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
      const carryRate = total > 0 ? Math.round((carried / total) * 100) : 0;
      const healthScore = Math.max(0, Math.min(100, completionRate - carryRate + 50 - blocked * 5));

      // Commitment flow funnel
      const funnel = [
        { label: "Created", value: total, color: "hsl(var(--chart-blue))" },
        { label: "Done", value: done, color: "hsl(var(--chart-emerald))" },
        { label: "Carried 1x", value: allCommitments.filter(c => c.carry_count === 1).length, color: "hsl(var(--chart-amber))" },
        { label: "Carried 2x", value: allCommitments.filter(c => c.carry_count === 2).length, color: "hsl(var(--chart-amber))" },
        { label: "Carried 3+", value: allCommitments.filter(c => c.carry_count >= 3).length, color: "hsl(var(--chart-red))" },
        { label: "Dropped", value: allCommitments.filter(c => c.status === "dropped").length, color: "hsl(var(--chart-slate))" },
      ];

      // Blocker heatmap
      const categories = ["dependency", "technical", "external", "resource", "unclear_requirements", "other"];
      const now = new Date();
      const weeks: string[] = [];
      const heatValues: number[][] = categories.map(() => []);
      for (let w = 7; w >= 0; w--) {
        const ws = startOfWeek(subDays(now, w * 7));
        weeks.push(format(ws, "MMM d"));
        categories.forEach((cat, ci) => {
          const count = allBlockers.filter(b => {
            const d = new Date(b.created_at);
            return b.category === cat && d >= ws && d < new Date(ws.getTime() + 7 * 86400000);
          }).length;
          heatValues[ci].push(count);
        });
      }

      // Participation by day of week
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const sessionsByDay: Record<string, { total: number; responded: number }> = {};
      dayNames.forEach(d => (sessionsByDay[d] = { total: 0, responded: 0 }));
      allSessions.forEach(s => {
        const day = dayNames[new Date(s.session_date).getDay()];
        sessionsByDay[day].total++;
        sessionsByDay[day].responded += allResponses.filter(r => r.session_id === s.id).length > 0 ? 1 : 0;
      });
      const participation = dayNames.map(d => ({
        day: d,
        rate: sessionsByDay[d].total > 0 ? Math.round((sessionsByDay[d].responded / sessionsByDay[d].total) * 100) : 0,
      }));

      // Trending themes from response text
      const texts = allResponses.flatMap(r => [r.today_text, r.yesterday_text, r.blockers_text].filter(Boolean) as string[]);
      const wordFreq: Record<string, number> = {};
      texts.forEach(t => {
        t.toLowerCase().split(/\s+/).filter(w => w.length > 4).forEach(w => {
          wordFreq[w] = (wordFreq[w] || 0) + 1;
        });
      });
      const themes = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word, count]) => ({ word, count }));

      // Work distribution (mock categories based on title keywords)
      const weeklyWork: { week: string; Feature: number; "Bug Fix": number; "Tech Debt": number; Other: number }[] = [];
      for (let w = 7; w >= 0; w--) {
        const ws = startOfWeek(subDays(now, w * 7));
        const we = new Date(ws.getTime() + 7 * 86400000);
        const weekCommits = allCommitments.filter(c => {
          const d = new Date(c.created_at);
          return d >= ws && d < we;
        });
        weeklyWork.push({
          week: format(ws, "MMM d"),
          Feature: weekCommits.filter(c => /feat|feature|add|new|build/i.test(c.title)).length,
          "Bug Fix": weekCommits.filter(c => /fix|bug|patch|issue/i.test(c.title)).length,
          "Tech Debt": weekCommits.filter(c => /refactor|clean|debt|migrate|upgrade/i.test(c.title)).length,
          Other: weekCommits.filter(c => !/feat|feature|add|new|build|fix|bug|patch|issue|refactor|clean|debt|migrate|upgrade/i.test(c.title)).length,
        });
      }

      return {
        healthScore,
        completionRate,
        activeBlockers: blocked,
        carryRate,
        funnel,
        heatmap: { categories, weeks, values: heatValues },
        participation,
        themes,
        weeklyWork,
      };
    },
  });
}

export function useWeeklyDigests(teamId: string | undefined) {
  return useQuery({
    queryKey: ["weekly-digests", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_weekly_digests")
        .select("*")
        .eq("team_id", teamId!)
        .order("week_start", { ascending: false })
        .limit(8);
      return data || [];
    },
  });
}

export function useMyAnalytics(memberId: string | undefined) {
  return useQuery({
    queryKey: ["my-analytics", memberId],
    enabled: !!memberId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

      const [commitments, responses] = await Promise.all([
        supabase.from("commitments").select("*").eq("member_id", memberId!).gte("created_at", thirtyDaysAgo),
        supabase.from("standup_responses").select("*").eq("member_id", memberId!).gte("submitted_at", thirtyDaysAgo).order("submitted_at"),
      ]);

      const allCommitments = commitments.data || [];
      const allResponses = responses.data || [];

      // Daily completion rate over 30 days
      const completionTrend: { date: string; rate: number }[] = [];
      for (let d = 29; d >= 0; d--) {
        const day = subDays(new Date(), d);
        const dayStr = format(day, "MMM d");
        const dayCommits = allCommitments.filter(c => format(new Date(c.created_at), "yyyy-MM-dd") <= format(day, "yyyy-MM-dd"));
        const done = dayCommits.filter(c => c.status === "done" && c.resolved_at && new Date(c.resolved_at) <= day).length;
        const total = dayCommits.length;
        completionTrend.push({ date: dayStr, rate: total > 0 ? Math.round((done / total) * 100) : 0 });
      }

      // Mood trend
      const moodMap: Record<string, number> = { great: 5, good: 4, okay: 3, struggling: 2, rough: 1 };
      const moodTrend = allResponses
        .filter(r => r.mood)
        .map(r => ({
          date: format(new Date(r.submitted_at), "MMM d"),
          mood: moodMap[r.mood!] || 3,
          label: r.mood!,
        }));

      // Carry-over patterns
      const carried = allCommitments.filter(c => c.carry_count > 0);
      const carryByType = [
        { type: "Feature", count: carried.filter(c => /feat|feature|add|new|build/i.test(c.title)).length },
        { type: "Bug Fix", count: carried.filter(c => /fix|bug|patch|issue/i.test(c.title)).length },
        { type: "Tech Debt", count: carried.filter(c => /refactor|clean|debt|migrate|upgrade/i.test(c.title)).length },
        { type: "Other", count: carried.filter(c => !/feat|feature|add|new|build|fix|bug|patch|issue|refactor|clean|debt|migrate|upgrade/i.test(c.title)).length },
      ];

      // Insight cards
      const totalCommits = allCommitments.length;
      const doneCount = allCommitments.filter(c => c.status === "done").length;
      const avgCarry = carried.length > 0 ? (carried.reduce((s, c) => s + c.carry_count, 0) / carried.length).toFixed(1) : "0";
      const mostCommonMood = allResponses.filter(r => r.mood).reduce<Record<string, number>>((acc, r) => {
        acc[r.mood!] = (acc[r.mood!] || 0) + 1;
        return acc;
      }, {});
      const topMood = Object.entries(mostCommonMood).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

      const insights = [
        { title: "Completion Rate", description: `You completed ${doneCount} of ${totalCommits} commitments (${totalCommits > 0 ? Math.round((doneCount / totalCommits) * 100) : 0}%) in the last 30 days.` },
        { title: "Carry Tendency", description: carried.length > 0 ? `You carry items an average of ${avgCarry} times before resolving.` : "Great job! No carried items in the last 30 days." },
        { title: "Usual Mood", description: `Your most common mood is "${topMood}".` },
      ];

      return { completionTrend, moodTrend, carryByType, insights };
    },
  });
}
