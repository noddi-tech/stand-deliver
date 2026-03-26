import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, CheckCircle2 } from "lucide-react";
import { useSimilarFocusAreas, type SimilarFocusArea } from "@/hooks/useFocusRecall";
import { format } from "date-fns";

interface FocusPredecessorPickerProps {
  teamId: string;
  excludeId?: string;
  selectedId: string | null;
  onSelect: (item: SimilarFocusArea | null) => void;
  prefilledTitle?: string;
}

export function FocusPredecessorPicker({
  teamId,
  excludeId,
  selectedId,
  onSelect,
  prefilledTitle,
}: FocusPredecessorPickerProps) {
  const [search, setSearch] = useState(prefilledTitle || "");
  const { data: results, isLoading } = useSimilarFocusAreas(teamId, search, excludeId);

  useEffect(() => {
    if (prefilledTitle) setSearch(prefilledTitle);
  }, [prefilledTitle]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search completed focus areas…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-sm"
        />
      </div>

      {search.length >= 3 && (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {isLoading && (
            <p className="text-xs text-muted-foreground text-center py-3">Searching…</p>
          )}

          {!isLoading && results && results.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">
              No matching completed focus areas found.
            </p>
          )}

          {results?.map((item) => {
            const isSelected = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(isSelected ? null : item)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      {item.label && (
                        <Badge variant="outline" className="text-[10px]">
                          {item.label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.completed_at && (
                        <span className="text-[10px] text-muted-foreground">
                          Completed {format(new Date(item.completed_at), "MMM d, yyyy")}
                        </span>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {Math.round(item.similarity * 100)}% match
                      </Badge>
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {search.length > 0 && search.length < 3 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Type at least 3 characters to search
        </p>
      )}
    </div>
  );
}
