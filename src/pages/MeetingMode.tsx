import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserTeam } from "@/hooks/useAnalytics";
import { format, addDays, getDay } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, Loader2, Pause, Play, SkipForward, Plus, ArrowRight, PartyPopper } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/EmptyState";

type Phase = "pre" | "speaking" | "blockers" | "summary";

const moodEmoji: Record<string, string> = {
  great: "🚀", good: "👍", okay: "😐", struggling: "😓", rough: "😰",
};

export default function MeetingMode() {
  const { data: teamData, isLoading: teamLoading } = useUserTeam();
  const teamId = teamData?.team_id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setOpen } = useSidebar();

  const [phase, setPhase] = useState<Phase>("pre");
  const [speakerOrder, setSpeakerOrder] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [paused, setPaused] = useState(false);
  const [timerDuration, setTimerDuration] = useState(120);
  const [meetingStart, setMeetingStart] = useState<Date | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hide sidebar on mount, restore on unmount
  useEffect(() => {
    setOpen(false);
    return () => setOpen(true);
  }, [setOpen]);

  // Fetch team info for timer
  const { data: teamInfo } = useQuery({
    queryKey: ["team-info", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("name, timer_seconds_per_person, standup_days").eq("id", teamId!).single();
      return data;
    },
  });

  useEffect(() => {
    if (teamInfo?.timer_seconds_per_person) {
      setTimerDuration(teamInfo.timer_seconds_per_person);
      setTimeLeft(teamInfo.timer_seconds_per_person);
    }
  }, [teamInfo]);

  // Fetch members
  const { data: members = [] } = useQuery({
    queryKey: ["meeting-members", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data } = await supabase
        .from("team_members")
        .select("id, user_id, profile:profiles(full_name, avatar_url)")
        .eq("team_id", teamId!)
        .eq("is_active", true);
      return data || [];
    },
  });

  // Fetch today's session + responses
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: todaySession } = useQuery({
    queryKey: ["meeting-session", teamId, today],
    enabled: !!teamId,
    queryFn: async () => {
      const { data } = await supabase
        .from("standup_sessions")
        .select("id")
        .eq("team_id", teamId!)
        .eq("session_date", today)
        .maybeSingle();
      return data;
    },
  });

  const { data: responses = [] } = useQuery({
    queryKey: ["meeting-responses", todaySession?.id || sessionId],
    enabled: !!(todaySession || sessionId),
    queryFn: async () => {
      const sid = todaySession?.id || sessionId;
      if (!sid) return [];
      const { data } = await supabase
        .from("standup_responses")
        .select("*")
        .eq("session_id", sid);
      return data || [];
    },
  });

  const submittedMemberIds = new Set(responses.map((r) => r.member_id));

  const getProfile = (memberId: string) => {
    const m = members.find((m) => m.id === memberId);
    return m?.profile as any;
  };

  const getResponse = (memberId: string) => responses.find((r) => r.member_id === memberId);

  // Timer logic
  useEffect(() => {
    if (phase !== "speaking" || paused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, paused]);

  const nextSpeaker = useCallback(() => {
    setCurrentIdx((prev) => {
      const next = prev + 1;
      if (next >= speakerOrder.length) {
        setPhase("blockers");
        return prev;
      }
      setTimeLeft(timerDuration);
      setPaused(false);
      return next;
    });
  }, [speakerOrder.length, timerDuration]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== "speaking") return;
      if (e.code === "Space") { e.preventDefault(); setPaused((p) => !p); }
      if (e.code === "ArrowRight") { e.preventDefault(); nextSpeaker(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, nextSpeaker]);

  // Complete session mutation
  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      const sid = sessionId || todaySession?.id;
      if (!sid) return;
      await supabase.from("standup_sessions").update({
        status: "completed" as any,
        completed_at: new Date().toISOString(),
      }).eq("id", sid);

      // Generate AI summary (stored in DB)
      await supabase.functions.invoke("ai-summarize-session", {
        body: { session_id: sid },
      });

      // Post formatted summary to Slack
      await supabase.functions.invoke("slack-post-summary", {
        body: { session_id: sid },
      });
    },
  });

  const startMeeting = async () => {
    const shuffled = [...members.map((m) => m.id)].sort(() => Math.random() - 0.5);
    setSpeakerOrder(shuffled);
    setCurrentIdx(0);
    setTimeLeft(timerDuration);
    setPaused(false);
    setMeetingStart(new Date());

    // Create session with type 'physical'
    if (!todaySession && teamId) {
      const { data } = await supabase
        .from("standup_sessions")
        .insert({
          team_id: teamId,
          session_date: today,
          session_type: "physical" as any,
          status: "in_progress" as any,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (data) setSessionId(data.id);
    }

    setPhase("speaking");
  };

  const finishMeeting = async () => {
    await completeSessionMutation.mutateAsync();
    toast.success("Standup session completed! Summary posted.");
    navigate("/dashboard");
  };

  // Timer SVG
  const timerPercent = timerDuration > 0 ? Math.max(0, timeLeft / timerDuration) : 0;
  const isOvertime = timeLeft < 0;
  const timerColor = isOvertime
    ? "hsl(var(--destructive))"
    : timerPercent > 0.5
    ? "hsl(142 76% 36%)"
    : timerPercent > 0.25
    ? "hsl(38 92% 50%)"
    : "hsl(var(--destructive))";
  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = isOvertime ? 0 : circumference * (1 - timerPercent);

  const currentSpeaker = phase === "speaking" ? speakerOrder[currentIdx] : null;
  const currentProfile = currentSpeaker ? getProfile(currentSpeaker) : null;
  const currentResponse = currentSpeaker ? getResponse(currentSpeaker) : null;

  const allBlockers = responses.filter((r) => r.blockers_text).map((r) => ({
    memberId: r.member_id,
    text: r.blockers_text!,
  }));

  const displayTime = Math.abs(timeLeft);
  const timeDisplay = `${isOvertime ? "+" : ""}${Math.floor(displayTime / 60)}:${String(displayTime % 60).padStart(2, "0")}`;

  if (teamLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // PRE-MEETING
  if (phase === "pre") {
    return (
      <div className="min-h-[calc(100vh-3rem)] bg-slate-950 text-white p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">Meeting Mode</h1>
            <p className="text-slate-400">{teamInfo?.name || "Your Team"} · {format(new Date(), "EEEE, MMM d")}</p>
            <p className="text-sm text-slate-500">
              Est. duration: {Math.ceil((members.length * timerDuration) / 60)} min ({members.length} members × {Math.floor(timerDuration / 60)}:{String(timerDuration % 60).padStart(2, "0")})
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {members.map((m) => {
              const profile = m.profile as any;
              const submitted = submittedMemberIds.has(m.id);
              const initials = (profile?.full_name || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2);
              return (
                <Card key={m.id} className={`bg-slate-900 border-slate-800 ${submitted ? "border-primary/30" : "opacity-60"}`}>
                  <CardContent className="p-4 flex flex-col items-center gap-2">
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={profile?.avatar_url} />
                        <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
                      </Avatar>
                      {submitted && (
                        <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-medium text-slate-200">{profile?.full_name || "Unknown"}</span>
                    <Badge variant={submitted ? "default" : "secondary"} className="text-[10px]">
                      {submitted ? "Submitted" : "Pending"}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-center">
            <Button size="lg" onClick={startMeeting} disabled={members.length === 0}>
              Begin Standup
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // SPEAKING PHASE
  if (phase === "speaking" && currentSpeaker) {
    const initials = (currentProfile?.full_name || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2);
    const upcoming = speakerOrder.slice(currentIdx + 1, currentIdx + 3);

    return (
      <div className="min-h-[calc(100vh-3rem)] bg-slate-950 text-white p-8 flex flex-col">
        {/* Progress bar */}
        <div className="mb-6 space-y-1">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>Speaker {currentIdx + 1} of {speakerOrder.length}</span>
          </div>
          <Progress value={((currentIdx + 1) / speakerOrder.length) * 100} className="h-1.5" />
        </div>

        <div className="flex-1 flex gap-8">
          <div className="flex-1 flex flex-col items-center gap-6">
            {/* Timer */}
            <div className="relative">
              <svg width="200" height="200" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="70" fill="none" stroke="hsl(215 20% 20%)" strokeWidth="6" />
                <circle
                  cx="100" cy="100" r="70" fill="none" stroke={timerColor} strokeWidth="6"
                  strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round" transform="rotate(-90 100 100)"
                  className={`transition-all duration-1000 ${timerPercent < 0.1 || isOvertime ? "animate-pulse" : ""}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-4xl font-bold font-mono ${isOvertime ? "text-destructive" : "text-white"}`}>
                  {timeDisplay}
                </span>
              </div>
            </div>

            {/* Speaker */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={currentProfile?.avatar_url} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">{initials}</AvatarFallback>
              </Avatar>
              <h2 className="text-3xl font-bold">{currentProfile?.full_name || "Unknown"}</h2>
              {currentResponse?.mood && (
                <span className="text-3xl">{moodEmoji[currentResponse.mood] || ""}</span>
              )}
            </div>

            {/* Content */}
            <div className="w-full max-w-2xl space-y-4">
              {currentResponse ? (
                <>
                  {currentResponse.yesterday_text && (
                    <Card className="bg-slate-900 border-slate-800">
                      <CardContent className="p-4">
                        <h3 className="text-xs font-semibold text-slate-400 mb-1">Yesterday</h3>
                        <p className="text-slate-200 whitespace-pre-line">{currentResponse.yesterday_text}</p>
                      </CardContent>
                    </Card>
                  )}
                  {currentResponse.today_text && (
                    <Card className="bg-slate-900 border-slate-800">
                      <CardContent className="p-4">
                        <h3 className="text-xs font-semibold text-slate-400 mb-1">Today</h3>
                        <p className="text-slate-200 whitespace-pre-line">{currentResponse.today_text}</p>
                      </CardContent>
                    </Card>
                  )}
                  {currentResponse.blockers_text && (
                    <Card className="bg-red-950/50 border-red-900/50">
                      <CardContent className="p-4">
                        <h3 className="text-xs font-semibold text-red-400 mb-1">Blockers</h3>
                        <p className="text-slate-200 whitespace-pre-line">{currentResponse.blockers_text}</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <p className="text-center text-slate-500">No standup submitted.</p>
              )}
            </div>

            {/* Controls */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setPaused((p) => !p)} className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800">
                {paused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
                {paused ? "Resume" : "Pause"}
              </Button>
              <Button variant="outline" onClick={() => setTimeLeft((t) => t + 30)} className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800">
                <Plus className="h-4 w-4 mr-1" /> 30s
              </Button>
              <Button onClick={nextSpeaker}>
                <ArrowRight className="h-4 w-4 mr-1" /> Next
              </Button>
              <Button variant="ghost" onClick={nextSpeaker} className="text-slate-400 hover:text-slate-200">
                <SkipForward className="h-4 w-4 mr-1" /> Skip
              </Button>
            </div>
          </div>

          {/* Queue */}
          <div className="w-48 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase">Up Next</h3>
            {upcoming.map((id) => {
              const p = getProfile(id);
              const ini = (p?.full_name || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2);
              return (
                <div key={id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-800 bg-slate-900">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={p?.avatar_url} />
                    <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">{ini}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-slate-300">{p?.full_name || "Unknown"}</span>
                </div>
              );
            })}
            {upcoming.length === 0 && <p className="text-xs text-slate-500">Last speaker</p>}
          </div>
        </div>
      </div>
    );
  }

  // BLOCKERS BOARD
  if (phase === "blockers") {
    return (
      <div className="min-h-[calc(100vh-3rem)] bg-slate-950 text-white p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold text-center">Blockers Board</h1>
          {allBlockers.length === 0 ? (
            <EmptyState icon={PartyPopper} title="No blockers raised this session" description="Great work! 🎉" iconClassName="text-emerald-400/60" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allBlockers.map((b, i) => {
                const p = getProfile(b.memberId);
                return (
                  <Card key={i} className="bg-red-950/30 border-red-900/30">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={p?.avatar_url} />
                          <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                            {(p?.full_name || "?")[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-slate-200">{p?.full_name}</span>
                      </div>
                      <p className="text-sm text-slate-300 whitespace-pre-line">{b.text}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          <div className="text-center">
            <Button onClick={() => setPhase("summary")}>View Summary</Button>
          </div>
        </div>
      </div>
    );
  }

  // SUMMARY
  const elapsed = meetingStart ? Math.round((Date.now() - meetingStart.getTime()) / 1000) : 0;
  return (
    <div className="min-h-[calc(100vh-3rem)] bg-slate-950 text-white p-8">
      <div className="max-w-2xl mx-auto space-y-6 text-center">
        <h1 className="text-2xl font-bold">Meeting Complete</h1>
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-white">{responses.length}</p>
              <p className="text-xs text-slate-400">Responses</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-white">{allBlockers.length}</p>
              <p className="text-xs text-slate-400">Blockers</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-white">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
              </p>
              <p className="text-xs text-slate-400">Duration</p>
            </CardContent>
          </Card>
        </div>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => setPhase("pre")} className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800">
            Back to Start
          </Button>
          <Button onClick={finishMeeting} disabled={completeSessionMutation.isPending}>
            {completeSessionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Finish
          </Button>
        </div>
      </div>
    </div>
  );
}
