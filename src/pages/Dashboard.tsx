import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Welcome back, {user?.email}
      </p>
    </div>
  );
}
