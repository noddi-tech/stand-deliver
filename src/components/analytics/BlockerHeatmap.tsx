import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface HeatmapData {
  categories: string[];
  weeks: string[];
  values: number[][]; // [category][week]
}

interface BlockerHeatmapProps {
  data: HeatmapData;
  loading?: boolean;
}

export default function BlockerHeatmap({ data, loading }: BlockerHeatmapProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Blocker Heatmap</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  const maxVal = Math.max(...data.values.flat(), 1);

  const getIntensity = (val: number) => {
    if (val === 0) return "bg-muted";
    const ratio = val / maxVal;
    if (ratio > 0.7) return "bg-[hsl(var(--chart-red))] text-primary-foreground";
    if (ratio > 0.4) return "bg-[hsl(var(--chart-amber))] text-foreground";
    return "bg-[hsl(var(--chart-amber)/0.4)] text-foreground";
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Blocker Heatmap</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="grid gap-1" style={{ gridTemplateColumns: `8rem repeat(${data.weeks.length}, minmax(2.5rem, 1fr))` }}>
            <div />
            {data.weeks.map(w => (
              <div key={w} className="text-[10px] text-muted-foreground text-center truncate">{w}</div>
            ))}
            {data.categories.map((cat, ci) => (
              <>
                <div key={`label-${cat}`} className="text-xs text-muted-foreground truncate flex items-center capitalize">{cat.replace(/_/g, " ")}</div>
                {data.weeks.map((w, wi) => (
                  <div
                    key={`${cat}-${w}`}
                    className={cn("h-7 rounded-sm flex items-center justify-center text-[10px] font-medium", getIntensity(data.values[ci]?.[wi] ?? 0))}
                  >
                    {data.values[ci]?.[wi] || ""}
                  </div>
                ))}
              </>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
