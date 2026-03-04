import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ScheduleTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Standup Schedule</CardTitle>
        <CardDescription>Configure when your standups happen.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Schedule settings will be available here.</p>
      </CardContent>
    </Card>
  );
}
