import { useCallback, useEffect, useState } from 'react';
import { Users, UserCheck, CalendarOff, Briefcase, ClipboardList, Building2, Plane } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Skeleton } from '@/components/core/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { hrService, type HrAnalytics, APP_STAGE_LABELS, ABSENCE_TYPE_LABELS } from '../services/hrService';
import { HrStat, EmptyState } from './_shared';

export function OverviewSection({ workspaceId }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<HrAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try { setData((await hrService.analytics(workspaceId)).analytics); }
    catch (e) { toast({ title: 'Failed to load HR analytics', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!data) return <EmptyState title="No data yet" />;

  const funnel = Object.entries(data.recruitment_funnel ?? {});
  const byDept = Object.entries(data.headcount_by_department ?? {});
  const byType = Object.entries(data.absence_by_type ?? {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <HrStat icon={Users} label="Headcount" value={data.headcount} />
        <HrStat icon={UserCheck} label="Active" value={data.active} />
        <HrStat icon={CalendarOff} label="On leave today" value={data.on_leave_today} />
        <HrStat icon={Briefcase} label="Open positions" value={data.open_positions} />
        <HrStat icon={ClipboardList} label="Onboarding tasks" value={data.onboarding_pending} hint="pending" />
        <HrStat icon={Plane} label="Absence days" value={data.total_absence_days} hint="approved, all types" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Headcount by department</CardTitle></CardHeader>
          <CardContent>
            {byDept.length === 0 ? (
              // Distinguish "no staff at all" from "staff exist but none are assigned to a department"
              // — the latter previously showed a misleading "No employees yet" while headcount ≥ 1.
              <EmptyState title={data.headcount > 0 ? 'No department assignments yet' : 'No employees yet'} />
            ) : (
              <div className="space-y-2">
                {byDept.sort((a, b) => b[1] - a[1]).map(([name, n]) => {
                  const pct = data.headcount ? Math.round((n / data.headcount) * 100) : 0;
                  return (
                    <div key={name}>
                      <div className="flex items-center justify-between text-sm"><span className="truncate">{name}</span><span className="text-muted-foreground">{n}</span></div>
                      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> Recruitment funnel</CardTitle></CardHeader>
          <CardContent>
            {funnel.length === 0 ? <EmptyState title="No applications yet" hint="Post a job to start tracking candidates" /> : (
              <div className="flex flex-wrap gap-2">
                {funnel.map(([stage, n]) => (
                  <Badge key={stage} variant="secondary">{APP_STAGE_LABELS[stage as keyof typeof APP_STAGE_LABELS] ?? stage}: {n}</Badge>
                ))}
              </div>
            )}
            {data.last_payroll && (
              <div className="mt-4 pt-3 border-t border-border/40 text-sm">
                <span className="text-muted-foreground">Last payroll </span>
                <span className="font-medium">{data.last_payroll.period}</span>
                <span className="text-muted-foreground"> — {Number(data.last_payroll.total_net).toLocaleString()} {data.last_payroll.currency} net </span>
                <Badge variant="outline" className="ml-1">{data.last_payroll.status}</Badge>
              </div>
            )}
            {byType.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/40">
                <div className="text-xs text-muted-foreground mb-2">Absence by type</div>
                <div className="flex flex-wrap gap-2">
                  {byType.map(([t, n]) => <Badge key={t} variant="outline">{ABSENCE_TYPE_LABELS[t as keyof typeof ABSENCE_TYPE_LABELS] ?? t}: {n}</Badge>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
