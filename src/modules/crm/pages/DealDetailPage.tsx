/**
 * Deal record page (#311 Phase 2) — `/crm/deals/:id`.
 *
 * The board answers "what is in the pipeline". This answers "what is happening on THIS deal", and
 * it is the reason a deal card can be clicked at all: before it existed, every non-property deal
 * had a title styled as a link that went nowhere.
 *
 * Activity-first, like the contact and company records. The stage control writes through
 * `dealsService.moveToStage`, so a winning stage wins the deal from here exactly as it does on the
 * board — which stage wins is the deal type's data, never a string in this file.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Trophy, XCircle, Building2, User, Home, FolderKanban, Percent, CalendarClock } from 'lucide-react';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CrmRecordActivity } from '@/components/business/crm/CrmRecordActivity';
import { DealTeamCard } from '@/components/business/crm/DealTeamCard';
import {
  dealsService, getDeal, type Deal, type DealStage, type DealType,
} from '@/services/dealsService';

export const DealDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();

  const [deal, setDeal] = useState<Deal | null | 'missing'>(null);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [type, setType] = useState<DealType | null>(null);
  const [busy, setBusy] = useState(false);
  const [activityKey, setActivityKey] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    const d = await getDeal(id).catch(() => null);
    if (!d) { setDeal('missing'); return; }
    setDeal(d);
    const [s, types] = await Promise.all([
      dealsService.listStages(d.deal_type_id).catch(() => [] as DealStage[]),
      activeWorkspaceId ? dealsService.listTypes(activeWorkspaceId).catch(() => [] as DealType[]) : Promise.resolve([]),
    ]);
    setStages(s);
    setType(types.find((t) => t.id === d.deal_type_id) ?? null);
  }, [id, activeWorkspaceId]);

  useEffect(() => { void load(); }, [load]);

  const label = useMemo(() => {
    if (!deal || deal === 'missing') return 'Deal';
    return deal.title?.trim() || deal.property?.title || deal.company?.name || deal.contact?.name || 'Deal';
  }, [deal]);

  if (deal === null) return <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  // 404 rather than 403 — a deal you may not see is a deal that does not exist (invariant 1).
  if (deal === 'missing') {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-display text-lg">Deal not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or belong to a listing you cannot see.</p>
        <Button variant="ghost" className="mt-4 rounded-full" onClick={() => navigate('/crm?tab=pipeline')}>Back to the pipeline</Button>
      </div>
    );
  }

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); setActivityKey((k) => k + 1); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const money = (n: number | null) => formatMoney(n, deal.currency || 'EUR', { decimals: 0, fallback: '—' });
  const stageLabel = stages.find((s) => s.key === deal.stage)?.label ?? deal.stage;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate('/crm?tab=pipeline')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Pipeline
        </Button>
        <h1 className="font-display text-xl">{label}</h1>
        {type && <Badge className="rounded-full border-0 bg-muted text-[11px]">{type.label}</Badge>}
        {deal.status === 'won' && <span className="text-xs font-medium text-emerald-600">Won</span>}
        {deal.status === 'lost' && <span className="text-xs font-medium text-muted-foreground">Lost{deal.lost_reason ? ` · ${deal.lost_reason}` : ''}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b border-border/60 px-5 py-3">
              <CardTitle className="text-base">Stage</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {deal.status === 'open' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={deal.stage}
                    onValueChange={(v) => {
                      const s = stages.find((x) => x.key === v);
                      if (s) void act(() => dealsService.moveToStage(deal.id, s));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[220px] text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.key} className="text-sm">{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {stages.findIndex((s) => s.key === deal.stage) + 1} of {stages.length}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  {deal.status === 'won' ? <Trophy className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  <span>{stageLabel}</span>
                  <Button size="sm" variant="ghost" className="ml-auto rounded-full text-xs" disabled={busy}
                    onClick={() => act(() => dealsService.updateDeal(deal.id, { status: 'open', lost_reason: null }))}>
                    Reopen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {activeWorkspaceId && (
            <CrmRecordActivity
              target={{ kind: 'deal', id: deal.id }}
              workspaceId={activeWorkspaceId}
              // Typed against TimelinePerson rather than cast: the cast hid whether the shape
              // was right at all, and `kind` is what decides who can be a meeting attendee.
              people={deal.contact?.id
                ? [{ id: deal.contact.id, name: deal.contact.name ?? 'Contact', kind: 'contact' as const }]
                : deal.company?.id
                  ? [{ id: deal.company.id, name: deal.company.name ?? 'Company', kind: 'company' as const }]
                  : []}
              recordLabel={label}
              refreshKey={activityKey}
            />
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 p-4 text-sm">
              <Row icon={User} label="Contact" value={deal.contact?.name}
                onClick={deal.contact_id ? () => navigate(`/crm/contacts/${deal.contact_id}`) : undefined} />
              <Row icon={Building2} label="Company" value={deal.company?.name}
                onClick={deal.company_id ? () => navigate(`/crm/companies/${deal.company_id}`) : undefined} />
              {deal.property_id && (
                <Row icon={Home} label="Property" value={deal.property?.title ?? 'Listing'}
                  onClick={() => navigate(`/properties/${deal.property_id}`)} />
              )}
              {deal.project_id && (
                <Row icon={FolderKanban} label="Project" value="Open project"
                  onClick={() => navigate(`/projects/${deal.project_id}`)} />
              )}
              <Row label="Value" value={money(deal.value)} />
              <Row icon={Percent} label="Probability" value={deal.probability != null ? `${deal.probability}%` : 'From stage'} />
              <Row icon={CalendarClock} label="Expected close" value={deal.expected_close_date ? formatDate(deal.expected_close_date) : '—'} />
            </CardContent>
          </Card>

          <DealTeamCard dealId={deal.id} workspaceId={activeWorkspaceId} />

          {deal.notes && (
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent className="p-4 text-sm whitespace-pre-wrap">{deal.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ icon?: React.ElementType; label: string; value?: string | null; onClick?: () => void }> = ({ icon: Icon, label, value, onClick }) => (
  <div className="flex items-center gap-2">
    {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
    {onClick && value ? (
      <button type="button" onClick={onClick} className="min-w-0 flex-1 truncate text-left hover:underline">{value}</button>
    ) : (
      <span className="min-w-0 flex-1 truncate">{value || '—'}</span>
    )}
  </div>
);

export default DealDetailPage;
