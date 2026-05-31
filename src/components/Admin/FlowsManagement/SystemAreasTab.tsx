import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Link2, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { flowService } from '@/services/flows';
import type { Flow, FlowAreaRegistryEntry } from '@/services/flows';
import { useToast } from '@/hooks/use-toast';

interface SystemAreasTabProps {
  flows: Flow[];
  onOpenBuilder: (flowId: string) => void;
  onRefresh: () => void;
}

const NONE = '__none__';

/**
 * System Areas — the coverage registry. Each row is a platform area (mapped to a
 * trigger_type) that should always have a flow pointed at it. The picker lets an
 * admin bind any matching flow; rows with no bound flow render as "empty" so a
 * required area is never silently left without a handler.
 */
export const SystemAreasTab: React.FC<SystemAreasTabProps> = ({ flows, onOpenBuilder, onRefresh }) => {
  const [areas, setAreas] = useState<FlowAreaRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const { toast } = useToast();

  const loadAreas = useCallback(async () => {
    try {
      setLoading(true);
      setAreas(await flowService.listAreas());
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load system areas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAreas();
  }, [loadAreas]);

  // Flows grouped by trigger_type so each area only offers compatible flows.
  const flowsByTrigger = useMemo(() => {
    const map = new Map<string, Flow[]>();
    for (const f of flows) {
      const arr = map.get(f.trigger_type) ?? [];
      arr.push(f);
      map.set(f.trigger_type, arr);
    }
    return map;
  }, [flows]);

  const handleBind = async (area: FlowAreaRegistryEntry, value: string) => {
    const flowId = value === NONE ? null : value;
    try {
      setSavingKey(area.area_key);
      await flowService.bindArea(area.area_key, flowId);
      setAreas((prev) =>
        prev.map((a) => (a.area_key === area.area_key ? { ...a, bound_flow_id: flowId } : a)),
      );
      toast({
        title: flowId ? 'Area linked' : 'Area cleared',
        description: flowId
          ? `"${area.title}" is now handled by the selected flow.`
          : `"${area.title}" has no flow — events will not be delivered.`,
        variant: flowId ? undefined : 'destructive',
      });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update area',
        variant: 'destructive',
      });
    } finally {
      setSavingKey(null);
    }
  };

  const grouped = useMemo(() => {
    const g = new Map<string, FlowAreaRegistryEntry[]>();
    for (const a of areas) {
      const arr = g.get(a.category) ?? [];
      arr.push(a);
      g.set(a.category, arr);
    }
    return Array.from(g.entries());
  }, [areas]);

  const emptyRequired = areas.filter((a) => a.required && !a.bound_flow_id).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Coverage summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {areas.length} platform areas · each should point to a flow so its notification is always delivered.
        </p>
        {emptyRequired > 0 ? (
          <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            {emptyRequired} required area{emptyRequired !== 1 ? 's' : ''} empty
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5" />
            All required areas covered
          </Badge>
        )}
      </div>

      {grouped.map(([category, rows]) => (
        <Card key={category}>
          <CardContent className="p-0">
            <div className="px-4 py-2 border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {category}
            </div>
            <div className="divide-y">
              {rows.map((area) => {
                const candidates = flowsByTrigger.get(area.trigger_type) ?? [];
                const isEmpty = !area.bound_flow_id;
                return (
                  <div key={area.area_key} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{area.title}</span>
                        {isEmpty ? (
                          <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-500">
                            <AlertTriangle className="h-3 w-3" />
                            Empty
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-500">
                            <Link2 className="h-3 w-3" />
                            Linked
                          </Badge>
                        )}
                      </div>
                      {area.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{area.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                        trigger: {area.trigger_type}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={area.bound_flow_id ?? NONE}
                        onValueChange={(v) => handleBind(area, v)}
                        disabled={savingKey === area.area_key}
                      >
                        <SelectTrigger className="h-8 text-sm w-[260px]">
                          <SelectValue placeholder="Select a flow…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>
                            <span className="text-muted-foreground">— Empty (no flow) —</span>
                          </SelectItem>
                          {candidates.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name} {f.status !== 'active' ? `(${f.status})` : ''}
                            </SelectItem>
                          ))}
                          {candidates.length === 0 && (
                            <SelectItem value="__noflows__" disabled>
                              No flows for this trigger yet
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {area.bound_flow_id && (
                        <button
                          onClick={() => onOpenBuilder(area.bound_flow_id!)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Open in builder"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
