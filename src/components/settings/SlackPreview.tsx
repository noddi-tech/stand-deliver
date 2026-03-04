import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SlackPreview() {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Slack Message Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* DM Reminder Preview */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">DM Reminder</p>
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">SF</div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">StandFlow</span>
                <span className="text-xs text-muted-foreground">9:00 AM</span>
              </div>
              <p className="text-sm text-foreground">🌅 Good morning! Time for your standup.</p>
              <div className="rounded border bg-muted/50 p-3 space-y-2 border-l-4 border-l-warning">
                <p className="text-xs font-semibold text-foreground">📋 Your open commitments:</p>
                <div className="space-y-1">
                  <p className="text-sm text-foreground">• Fix login redirect bug <span className="text-xs text-warning font-medium">⚠️ carried 2x</span></p>
                  <p className="text-sm text-foreground">• Review PR #142</p>
                  <p className="text-sm text-foreground">• Update API documentation</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="inline-flex items-center rounded-md bg-success/20 text-success px-3 py-1 text-xs font-medium">▶️ Start Standup</span>
                <span className="inline-flex items-center rounded-md bg-warning/20 text-warning px-3 py-1 text-xs font-medium">⏰ Snooze 30m</span>
                <span className="inline-flex items-center rounded-md bg-muted text-muted-foreground px-3 py-1 text-xs font-medium">⏭️ Skip Today</span>
              </div>
            </div>
          </div>
        </div>

        {/* Channel Summary Preview */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Channel Summary</p>
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">SF</div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">StandFlow</span>
                <span className="text-xs text-muted-foreground">9:15 AM</span>
              </div>
              <p className="text-sm font-semibold text-foreground">📊 Standup Summary — March 4, 2026</p>

              <div className="rounded border bg-muted/50 p-3 space-y-1 border-l-4 border-l-success">
                <p className="text-sm font-semibold text-foreground">👤 Sarah Chen — 🚀 Great</p>
                <p className="text-sm text-foreground">✅ Fixed login redirect bug</p>
                <p className="text-sm text-foreground">🎯 Implement OAuth flow</p>
              </div>

              <div className="rounded border bg-muted/50 p-3 space-y-1 border-l-4 border-l-destructive">
                <p className="text-sm font-semibold text-foreground">👤 Alex Kim — 😓 Struggling</p>
                <p className="text-sm text-foreground">🔄 Review PR #142 (in progress)</p>
                <p className="text-sm text-foreground">🎯 Deploy staging build</p>
                <p className="text-sm text-destructive">🚫 Blocked: Waiting on design assets</p>
              </div>

              <p className="text-xs text-muted-foreground">4 of 6 members responded · 3 items done · 1 blocker</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
