import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function TeamTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Settings</CardTitle>
        <CardDescription>Manage your team and organization details.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Team settings will be available here.</p>
      </CardContent>
    </Card>
  );
}
