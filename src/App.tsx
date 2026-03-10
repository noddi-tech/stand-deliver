import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Auth from "@/pages/Auth";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import MyStandup from "@/pages/MyStandup";
import TeamFeed from "@/pages/TeamFeed";
import MeetingMode from "@/pages/MeetingMode";
import Settings from "@/pages/Settings";
import Analytics from "@/pages/Analytics";
import MyAnalytics from "@/pages/MyAnalytics";
import TeamInsights from "@/pages/TeamInsights";
import WeeklyDigest from "@/pages/WeeklyDigest";
import Activity from "@/pages/Activity";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient(); // force rebuild

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/standup" element={<MyStandup />} />
                <Route path="/team" element={<TeamFeed />} />
                <Route path="/meeting" element={<MeetingMode />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/activity" element={<Activity />} />
                <Route path="/my-analytics" element={<MyAnalytics />} />
                <Route path="/team-insights" element={<TeamInsights />} />
                <Route path="/weekly-digest" element={<WeeklyDigest />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
