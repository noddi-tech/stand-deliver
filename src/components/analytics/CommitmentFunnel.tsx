import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface FunnelData {
  label: string;
  value: number;
  color: string;
}

interface CommitmentFunnelProps {
  data: FunnelData[];
  loading?: boolean;
}

export default function CommitmentFunnel({ data, loading }: CommitmentFunnelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Commitment Flow</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Commitment Flow</CardTitle></CardHeader>
      <CardContent className="space-y-2.5">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">{item.label}</span>
            <div className="flex-1 h-7 rounded bg-muted overflow-hidden">
              <div
                className="h-full rounded flex items-center px-2 text-xs font-medium text-primary-foreground transition-all duration-500"
                style={{
                  width: `${Math.max((item.value / max) * 100, 8)}%`,
                  backgroundColor: item.color,
                }}
              >
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
