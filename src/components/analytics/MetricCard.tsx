import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  loading?: boolean;
}

export default function MetricCard({ label, value, subtitle, icon, children, className, loading }: MetricCardProps) {
  if (loading) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="p-5">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-16 mb-1" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className="flex items-end gap-3">
          <span className="text-3xl font-bold tracking-tight text-foreground">{value}</span>
          {children}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
