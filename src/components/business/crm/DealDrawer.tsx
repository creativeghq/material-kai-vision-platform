import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  ExternalLink,
  History,
  Loader2,
  Pencil,
  StickyNote,
  Trophy,
  User,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/core/ui/sheet';
import { Textarea } from '@/components/core/ui/textarea';
import { HubEmptyState, HubProperty, HubPropertyList } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { crmActivitiesService, type CrmDealNote } from '@/services/crmActivitiesService';
import {
  dealsService,
  listDealStageEvents,
  type Deal,
  type DealStage,
  type DealStageEvent,
} from '@/services/dealsService';
import { formatDate, formatTime, timeAgo } from '@/utils/datetime';
import { formatMoney } from '@/utils/decimal';

interface Props {
  deal: Deal;
  stages: DealStage[];
  canManage: boolean;
  onClose: () => void;
  /** Something was written — the board reloads. */
  onChanged: () => void;
  /** Opens the full edit form; the drawer is for reading and for adding notes. */
  onEdit: () => void;
}

/**
 * DEAL DRAWER — everything about one deal without leaving the board.
 *
 * A pipeline card can hold a title, a party and a number. Everything else a person needs before
 * they pick up the phone — what was agreed last time, where it has been, what it is worth, who
 * owns it — used to require navigating away to the deal page and losing the board. A side drawer
 * keeps the column in view, which is what makes it usable while working a list.
 *
 * ── The note rule ───────────────────────────────────────────────────────────────────────────
 * A note typed here is written against the deal's CONTACT or COMPANY, with `deal_id` recording
 * where it was typed. One row, not two. That means it shows up on that party's CRM record page
 * automatically — `crm_record_timeline` already reads `crm_notes`, so nothing there had to change
 * — while the deal can still show the subset written against it.
 *
 * The tempting alternative is a `deal_notes` table plus a copy onto the party. That gives you two
 * rows that say the same thing until somebody edits one, and then a permanent question about
 * which is true. The drawer says out loud where the note is going, because a note that silently
 * lands on someone's CRM record is a surprise the first time it is discovered.
 */
export const DealDrawer: React.FC<Props> = ({ deal, stages, canManage, onClose, onChanged, onEdit }) => {
  const { toast } = useToast();
  const [notes, setNotes] = useState<CrmDealNote[] | null>(null);
  const [events, setEvents] = useState<DealStageEvent[] | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // The empty state's action focuses the composer rather than opening a second one:
  // two places to type the same note is how a surface ends up with two of everything.
  const noteFieldRef = React.useRef<HTMLTextAreaElement>(null);

  // Which CRM record a note written here lands on. A deal always has at least one of the two
  // (`crm_deals_party_check`), and the contact is the more specific answer when both are set.
  const noteTarget = useMemo(() => {
    if (deal.contact_id) return { kind: 'contact' as const, id: deal.contact_id, name: deal.contact?.name ?? 'this contact' };
    if (deal.company_id) return { kind: 'company' as const, id: deal.company_id, name: deal.company?.name ?? 'this company' };
    return null;
  }, [deal.contact_id, deal.company_id, deal.contact?.name, deal.company?.name]);

  const load = useCallback(async () => {
    const [n, e] = await Promise.all([
      crmActivitiesService.listDealNotes(deal.id).catch(() => [] as CrmDealNote[]),
      listDealStageEvents(deal.id).catch(() => [] as DealStageEvent[]),
    ]);
    setNotes(n);
    setEvents(e);
  }, [deal.id]);

  useEffect(() => { void load(); }, [load]);

  const stageLabel = (key: string | null) =>
    (key ? stages.find((s) => s.key === key)?.label : null) ?? key ?? '—';

  const addNote = async () => {
    const body = draft.trim();
    if (!body || !noteTarget) return;
    setSaving(true);
    try {
      await crmActivitiesService.addNote({ kind: noteTarget.kind, id: noteTarget.id }, body, deal.id);
      setDraft('');
      await load();
      toast({
        title: 'Note saved',
        description: `Also on ${noteTarget.name}'s record.`,
      });
    } catch (err) {
      toast({ title: 'Could not save the note', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const moveStage = async (key: string) => {
    const s = stages.find((x) => x.key === key);
    if (!s) return;
    try {
      await dealsService.moveToStage(deal.id, s);
      onChanged();
      await load();
    } catch (err) {
      toast({ title: 'Could not move the deal', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const partyHref = deal.contact_id
    ? `/crm/contacts/${deal.contact_id}`
    : deal.company_id
      ? `/crm/companies/${deal.company_id}`
      : null;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b border-hairline px-4 py-3 text-left">
          <SheetTitle className="font-sans text-base">
            {deal.title?.trim() || deal.property?.title || deal.company?.name || deal.contact?.name || 'Deal'}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant={deal.status === 'won' ? 'success' : deal.status === 'lost' ? 'error' : 'info'}>
              {deal.status === 'open' ? stageLabel(deal.stage) : deal.status}
            </Badge>
            {deal.value != null && (
              <span className="tabular-nums text-foreground">{formatMoney(deal.value, deal.currency || 'EUR', { decimals: 0 })}</span>
            )}
            <span>· updated {timeAgo(deal.updated_at)}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="scroll-y-clean flex-1 space-y-4 px-4 py-3">
          {canManage && (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Label className="text-[11px] text-muted-foreground" htmlFor="drawer-stage">Stage</Label>
                <Select value={deal.stage} onValueChange={moveStage}>
                  <SelectTrigger id="drawer-stage" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.key} className="text-xs">
                        {s.label}
                        {s.is_won && ' 🏆'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" variant="outline" className="mt-4 shrink-0" onClick={onEdit}>
                <Pencil /> Edit
              </Button>
            </div>
          )}

          <section>
            <h3 className="mb-1 font-sans text-xs font-semibold text-muted-foreground">Details</h3>
            <HubPropertyList>
              <HubProperty label="Contact" layout="inline">
                {deal.contact?.name ?? null}
              </HubProperty>
              <HubProperty label="Company" layout="inline">
                {deal.company?.name ?? null}
              </HubProperty>
              {deal.property?.title && (
                <HubProperty label="Property" layout="inline">{deal.property.title}</HubProperty>
              )}
              <HubProperty label="Value" layout="inline">
                {deal.value != null ? formatMoney(deal.value, deal.currency || 'EUR', { decimals: 0 }) : null}
              </HubProperty>
              <HubProperty label="Probability" layout="inline">
                {deal.probability != null ? `${deal.probability}%` : null}
              </HubProperty>
              <HubProperty label="Expected close" layout="inline">
                {deal.expected_close_date ? formatDate(deal.expected_close_date) : null}
              </HubProperty>
              {deal.status === 'lost' && (
                <HubProperty label="Lost because" layout="inline">{deal.lost_reason}</HubProperty>
              )}
            </HubPropertyList>

            {partyHref && (
              <Button asChild size="sm" variant="outline" className="mt-2 w-full">
                <Link to={partyHref} onClick={onClose}>
                  {deal.contact_id ? <User /> : <Building2 />}
                  Open the CRM record
                  <ExternalLink className="ml-auto h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </section>

          {/* ── Notes ───────────────────────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-1 flex items-center gap-1.5 font-sans text-xs font-semibold text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5" /> Notes
            </h3>

            {canManage && noteTarget && (
              <div className="space-y-1.5">
                <Textarea
                  ref={noteFieldRef}
                  rows={3}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="What happened? What did they say? What is next?"
                  aria-label="New note"
                />
                <div className="flex items-center justify-between gap-2">
                  {/* Said out loud, because a note that silently appears on someone's CRM record
                      is a surprise the first time somebody finds it there. */}
                  <p className="text-[11px] text-muted-foreground">
                    Saves to <span className="font-semibold text-foreground">{noteTarget.name}</span>&rsquo;s record too.
                  </p>
                  <Button size="sm" onClick={addNote} disabled={saving || !draft.trim()}>
                    {saving && <Loader2 className="animate-spin" />} Add note
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-2 space-y-1.5">
              {notes === null && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {notes?.length === 0 && (
                <HubEmptyState
                  icon={StickyNote}
                  title="No notes on this deal yet"
                  description={
                    noteTarget
                      ? `Write what was agreed, and it lands here and on ${noteTarget.name}'s CRM record at the same time.`
                      : 'Link a contact or a company to this deal and notes written here reach their record too.'
                  }
                  action={
                    canManage && noteTarget
                      ? <Button size="sm" onClick={() => noteFieldRef.current?.focus()}><StickyNote /> Write the first note</Button>
                      : undefined
                  }
                />
              )}
              {notes?.map((n) => (
                <article key={n.id} className="rounded-sm border border-hairline bg-card p-2.5">
                  <p className="whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDate(n.created_at)} {formatTime(n.created_at)}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* ── Stage history ───────────────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-1 flex items-center gap-1.5 font-sans text-xs font-semibold text-muted-foreground">
              <History className="h-3.5 w-3.5" /> History
            </h3>
            {events === null && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {events?.length === 0 && <p className="py-2 text-xs text-muted-foreground">Nothing recorded yet.</p>}
            <ol className="space-y-1">
              {events?.map((e) => (
                <li key={e.id} className="flex items-center gap-1.5 text-xs">
                  {e.to_status === 'won' ? (
                    <Trophy className="h-3 w-3 shrink-0 text-[hsl(var(--success))]" />
                  ) : e.to_status === 'lost' ? (
                    <XCircle className="h-3 w-3 shrink-0 text-[hsl(var(--error))]" />
                  ) : (
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {e.from_stage ? (
                      <>
                        {stageLabel(e.from_stage)} <span className="text-muted-foreground">→</span> {stageLabel(e.to_stage)}
                      </>
                    ) : (
                      <>Created in {stageLabel(e.to_stage)}</>
                    )}
                    {/* A reconstructed row is labelled as one. It records where the deal stood when
                        history was switched on, not a move anybody made. */}
                    {e.source === 'backfill' && (
                      <span className="ml-1 text-muted-foreground">(recorded retrospectively)</span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatDate(e.occurred_at)}</span>
                </li>
              ))}
            </ol>
          </section>

          {!noteTarget && (
            <HubEmptyState
              icon={User}
              title="No party linked"
              description="A deal is always attached to a contact or a company. Edit it to link one, and notes written here will reach their record."
              action={canManage ? <Button size="sm" onClick={onEdit}><Pencil /> Edit deal</Button> : undefined}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
