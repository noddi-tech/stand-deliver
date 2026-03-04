import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserTeam } from "@/hooks/useAnalytics";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Pause, Play, SkipForward, Plus, ArrowRight } from "lucide-react";

type Phase = "pre" | "speaking" | "blockers" | "summary";

const moodEmoji: Record<string, string> = {
  great: "🚀", good: "👍", okay: "😐", struggling: "😓", rough: "😰",
};

export default function MeetingMode() {
  const { data: teamData, isLoading: teamLoading } = useUserTeam();
  const teamId = teamData?.team_id;

  const [phase, setPhase] = useState<Phase>("pre");
  const [speakerOrder, setSpeakerOrder] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [paused, setPaused] = useState(false);
  const [timerDuration, setTimerDuration] = useState(120);
  const [meetingStart, setMeetingStart] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch team info for timer
  const { data: teamInfo } = useQuery({
    queryKey: ["team-info", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data } = await supabase.from("teams").select("timer_seconds_per_person").eq("id", teamId!).single();
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
    queryKey: ["meeting-responses", todaySession?.id],
    enabled: !!todaySession,
    queryFn: async () => {
      const { data } = await supabase
        .from("standup_responses")
        .select("*")
        .eq("session_id", todaySession!.id);
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
      setTimeLeft((t) => {
        if (t <= 1) {
          nextSpeaker();
          return timerDuration;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, paused, timerDuration]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== "speaking") return;
      if (e.code === "Space") { e.preventDefault(); setPaused((p) => !p); }
      if (e.code === "ArrowRight") { e.preventDefault(); nextSpeaker(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, currentIdx, speakerOrder]);

  const startMeeting = () => {
    const shuffled = [...members.map((m) => m.id)].sort(() => Math.random() - 0.5);
    setSpeakerOrder(shuffled);
    setCurrentIdx(0);
    setTimeLeft(timerDuration);
    setPaused(false);
    setMeetingStart(new Date());
    setPhase("speaking");
  };

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

  // Timer SVG
  const timerPercent = timerDuration > 0 ? timeLeft / timerDuration : 0;
  const timerColor = timerPercent > 0.5 ? "hsl(var(--chart-emerald))" : timerPercent > 0.25 ? "hsl(var(--chart-amber))" : "hsl(var(--chart-red))";
  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference * (1 - timerPercent);

  const currentSpeaker = phase === "speaking" ? speakerOrder[currentIdx] : null;
  const currentProfile = currentSpeaker ? getProfile(currentSpeaker) : null;
  const currentResponse = currentSpeaker ? getResponse(currentSpeaker) : null;

  const allBlockers = responses.filter((r) => r.blockers_text).map((r) => ({
    memberId: r.member_id,
    text: r.blockers_text!,
  }));

  if (teamLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // PRE-MEETING
  if (phase === "pre") {
    return (
      <div className="min-h-[calc(100vh-3rem)] bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <h1 className="text-3xl font-bold text-foreground text-center">Meeting Mode</h1>
          <p className="text-center text-muted-foreground">Review who's submitted, then start the meeting.</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {members.map((m) => {
              const profile = m.profile as any;
              const submitted = submittedMemberIds.has(m.id);
              const initials = (profile?.full_name || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2);
              return (
                <Card key={m.id} className={submitted ? "border-primary/30" : "opacity-60"}>
                  <CardContent className="p-4 flex flex-col items-center gap-2">
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={profile?.avatar_url} />
                        <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
                      </Avatar>
                      {submitted && (
                        <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-chart-emerald flex items-center justify-center" style={{ backgroundColor: "hsl(var(--chart-emerald))" }}>
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-medium text-foreground">{profile?.full_name || "Unknown"}</span>
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
              Start Meeting
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // SPEAKING PHASE
  if (phase === "speaking" && currentSpeaker) {
    const initials = (currentProfile?.full_name || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2);
    const upcoming = speakerOrder.slice(currentIdx + 1);

    return (
      <div className="min-h-[calc(100vh-3rem)] bg-background p-8 flex gap-8">
        <div className="flex-1 flex flex-col items-center gap-6">
          {/* Timer */}
          <div className="relative">
            <svg width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="70" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
              <circle
                cx="80" cy="80" r="70" fill="none" stroke={timerColor} strokeWidth="6"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                strokeLinecap="round" transform="rotate(-90 80 80)"
                className={`transition-all duration-1000 ${timerPercent < 0.1 ? "animate-pulse" : ""}`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl font-bold text-foreground font-mono">
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
              </span>
            </div>
          </div>

          {/* Speaker */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={currentProfile?.avatar_url} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">{initials}</AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-bold text-foreground">{currentProfile?.full_name || "Unknown"}</h2>
            {currentResponse?.mood && (
              <span className="text-3xl">{moodEmoji[currentResponse.mood] || ""}</span>
            )}
          </div>

          {/* Content */}
          <div className="w-full max-w-2xl space-y-4">
            {currentResponse ? (
              <>
                {currentResponse.yesterday_text && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="text-xs font-semibold text-muted-foreground mb-1">Yesterday</h3>
                      <p className="text-foreground whitespace-pre-line">{currentResponse.yesterday_text}</p>
                    </CardContent>
                  </Card>
                )}
                {currentResponse.today_text && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="text-xs font-semibold text-muted-foreground mb-1">Today</h3>
                      <p className="text-foreground whitespace-pre-line">{currentResponse.today_text}</p>
                    </CardContent>
                  </Card>
                )}
                {currentResponse.blockers_text && (
                  <Card className="border-destructive/30">
                    <CardContent className="p-4">
                      <h3 className="text-xs font-semibold text-destructive mb-1">Blockers</h3>
                      <p className="text-foreground whitespace-pre-line">{currentResponse.blockers_text}</p>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <p className="text-center text-muted-foreground">No standup submitted.</p>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button variant="outline" onClick={() => setTimeLeft((t) => t + 30)}>
              <Plus className="h-4 w-4 mr-1" /> 30s
            </Button>
            <Button onClick={nextSpeaker}>
              <ArrowRight className="h-4 w-4 mr-1" /> Next
            </Button>
            <Button variant="ghost" onClick={nextSpeaker}>
              <SkipForward className="h-4 w-4 mr-1" /> Skip
            </Button>
          </div>
        </div>

        {/* Queue */}
        <div className="w-48 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Up Next</h3>
          {upcoming.map((id) => {
            const p = getProfile(id);
            const initials = (p?.full_name || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2);
            return (
              <div key={id} className="flex items-center gap-2 p-2 rounded-lg border">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={p?.avatar_url} />
                  <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-foreground">{p?.full_name || "Unknown"}</span>
              </div>
            );
          })}
          {upcoming.length === 0 && <p className="text-xs text-muted-foreground">Last speaker</p>}
        </div>
      </div>
    );
  }

  // BLOCKERS BOARD
  if (phase === "blockers") {
    return (
      <div className="min-h-[calc(100vh-3rem)] bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold text-foreground text-center">Blockers Board</h1>
          {allBlockers.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No blockers raised today! 🎉</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allBlockers.map((b, i) => {
                const p = getProfile(b.memberId);
                return (
                  <Card key={i} className="border-destructive/20">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={p?.avatar_url} />
                          <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                            {(p?.full_name || "?")[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-foreground">{p?.full_name}</span>
                      </div>
                      <p className="text-sm text-foreground/80 whitespace-pre-line">{b.text}</p>
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
    <div className="min-h-[calc(100vh-3rem)] bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">Meeting Complete</h1>
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-foreground">{responses.length}</p>
              <p className="text-xs text-muted-foreground">Responses</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-foreground">{allBlockers.length}</p>
              <p className="text-xs text-muted-foreground">Blockers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-3xl font-bold text-foreground">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
              </p>
              <p className="text-xs text-muted-foreground">Duration</p>
            </CardContent>
          </Card>
        </div>
        <Button variant="outline" onClick={() => setPhase("pre")}>
          Back to Start
        </Button>
      </div>
    </div>
  );
}
