import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";

export const LayoutContext = createContext<{ hideSidebar: boolean }>({ hideSidebar: false });
export const useLayout = () => useContext(LayoutContext);

function LayoutInner() {
  const { toggleSidebar, isMobile } = useSidebar();
  const navigate = useNavigate();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const el = document.activeElement;
      const isInput =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement)?.isContentEditable;
      if (isInput) return;

      if (e.key === "n" || e.key === "N") { navigate("/standup"); return; }
      if (e.key === "d" || e.key === "D") { navigate("/dashboard"); return; }
      if (e.key === "m" || e.key === "M") { navigate("/meeting"); return; }
      if (e.key === "?") { e.preventDefault(); setShortcutsOpen((o) => !o); }
    },
    [navigate]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

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
      <CommandPalette />
      <KeyboardShortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
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
