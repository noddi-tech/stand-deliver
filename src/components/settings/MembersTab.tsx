import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MembersTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Members</CardTitle>
        <CardDescription>Manage who's on your team.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Member management will be available here.</p>
      </CardContent>
    </Card>
  );
}
