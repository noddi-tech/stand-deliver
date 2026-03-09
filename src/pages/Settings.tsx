import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { TeamTab } from "@/components/settings/TeamTab";
import { ScheduleTab } from "@/components/settings/ScheduleTab";
import { MembersTab } from "@/components/settings/MembersTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";

export default function Settings() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "team";

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold text-foreground mb-6">Settings</h1>
        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList className="bg-muted">
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>
          <TabsContent value="team"><TeamTab /></TabsContent>
          <TabsContent value="schedule"><ScheduleTab /></TabsContent>
          <TabsContent value="members"><MembersTab /></TabsContent>
          <TabsContent value="notifications"><NotificationsTab /></TabsContent>
          <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
