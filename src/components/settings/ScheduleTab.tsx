import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const TIMEZONES = (Intl as any).supportedValuesOf("timeZone") as string[];

export function ScheduleTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);

  const [standupDays, setStandupDays] = useState<string[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [standupTime, setStandupTime] = useState("09:00");
  const [timezone, setTimezone] = useState("UTC");
  const [timerSeconds, setTimerSeconds] = useState(120);
  const [dayModes, setDayModes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }

      const { data: team } = await supabase
        .from("teams")
        .select("id, standup_days, standup_time, standup_timezone, timer_seconds_per_person")
        .eq("id", membership.team_id)
        .single();

      if (team) {
        setTeamId(team.id);
        setStandupDays(team.standup_days);
        setStandupTime(team.standup_time?.slice(0, 5) || "09:00");
        setTimezone(team.standup_timezone);
        setTimerSeconds(team.timer_seconds_per_person);
      }
      setLoading(false);
    })();
  }, [user]);

  const toggleDay = (day: string) => {
    setStandupDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    if (!teamId) return;
    setSaving(true);
    const { error } = await supabase
      .from("teams")
      .update({
        standup_days: standupDays,
        standup_time: standupTime + ":00",
        standup_timezone: timezone,
        timer_seconds_per_person: timerSeconds,
      })
      .eq("id", teamId);

    setSaving(false);
    if (error) {
      toast({ title: "Error saving schedule", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Schedule updated" });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Standup Schedule</CardTitle>
        <CardDescription>Configure when your standups happen and how long each person gets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Days */}
        <div className="space-y-2">
          <Label>Standup Days</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                  standupDays.includes(day.value)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-accent"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div className="space-y-2">
          <Label htmlFor="standup-time">Standup Time</Label>
          <Input
            id="standup-time"
            type="time"
            value={standupTime}
            onChange={(e) => setStandupTime(e.target.value)}
            className="w-40"
          />
        </div>

        {/* Timezone */}
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Timer */}
        <div className="space-y-2">
          <Label>Timer per Person: {timerSeconds}s ({Math.floor(timerSeconds / 60)}m {timerSeconds % 60}s)</Label>
          <Slider
            value={[timerSeconds]}
            onValueChange={([v]) => setTimerSeconds(v)}
            min={30}
            max={300}
            step={15}
            className="w-72"
          />
        </div>

        <Button onClick={handleSave} disabled={saving || standupDays.length === 0}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Schedule
        </Button>
      </CardContent>
    </Card>
  );
}
