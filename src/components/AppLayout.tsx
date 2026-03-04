import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { createContext, useContext } from "react";

// Context to allow pages (like MeetingMode) to hide the sidebar
export const LayoutContext = createContext<{ hideSidebar: boolean }>({ hideSidebar: false });
export const useLayout = () => useContext(LayoutContext);

function LayoutInner() {
  const { toggleSidebar, isMobile } = useSidebar();

  return (
    <div className="min-h-screen flex w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center border-b border-border shrink-0">
          <SidebarTrigger className="ml-3 hidden md:flex" />
          {isMobile && (
            <Button variant="ghost" size="icon" className="ml-3 md:hidden" onClick={toggleSidebar}>
              <Menu className="h-5 w-5" />
            </Button>
          )}
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const defaultOpen = typeof window !== "undefined"
    ? localStorage.getItem("sidebar-open") !== "false"
    : true;

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      onOpenChange={(open) => localStorage.setItem("sidebar-open", String(open))}
    >
      <LayoutInner />
    </SidebarProvider>
  );
}
