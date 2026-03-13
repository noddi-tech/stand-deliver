import { useBadgeDefinitions } from "@/hooks/useBadges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Award } from "lucide-react";
import { useState } from "react";

export function BadgeLegend() {
  const { data: definitions } = useBadgeDefinitions();
  const [open, setOpen] = useState(false);

  if (!definitions?.length) return null;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Award className="h-4 w-4 text-muted-foreground" />
                Badge Guide
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {definitions.map((d) => (
                <div key={d.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <span className="text-2xl shrink-0">{d.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{d.name}</p>
                    <p className="text-xs text-muted-foreground leading-snug">{d.description}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1 capitalize">{d.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
