/**
 * "What is this about?" — the subject of a meeting or an appointment (#378 N10 / C4).
 *
 * WHY THIS IS NOT `OrderLinkPicker`
 * ---------------------------------
 * That control answers a different question — "what is this COST or ORDER for?" — over filing
 * targets whose legality it enforces (a purchase line may not be appended to a customer's sales
 * order; a trip is a filing target and never a merge target). Its groups resolve to five different
 * COLUMNS on the documents that mount it.
 *
 * A calendar entry asks one question with one answer: the project, deal, property or order this
 * meeting is about, at most one, enforced by `*_single_subject_ck` on both tables. Bending the
 * order picker to that would mean switching four of its groups off and adding two it does not have.
 *
 * WHY IT EXISTS AT ALL
 * --------------------
 * C4 gave `appointments` four subject columns and the UI wrote two of them: `deal_id` and
 * `order_id` were declared, typed, CHECK-constrained and reachable from nothing. `crm_meetings` —
 * the calendar that owns the invites, the reminders and the reminder cron, and the one
 * `property_viewings` foreign-keys into — had no subject at all. One control, both surfaces, all
 * four kinds, so neither table can drift into holding columns nobody can fill.
 *
 * The WRITE is always an RPC (`set_appointment_subject` / `set_meeting_subject`), never a direct
 * column update: RLS can see the row's own tenancy but not the SUBJECT's, so "is this target in
 * the right workspace" has to be answered server-side.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, FolderKanban, Building2, Handshake, Receipt, X } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/core/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { dealsService } from '@/services/dealsService';
import { propertyLabel } from '@/utils/propertyLabel';

export type SubjectKind = 'project' | 'deal' | 'property' | 'order';

export interface SubjectValue {
  kind: SubjectKind;
  id: string;
  label: string;
}

const KIND_META: Record<SubjectKind, { icon: React.ComponentType<{ className?: string }>; heading: string }> = {
  project: { icon: FolderKanban, heading: 'Projects' },
  deal: { icon: Handshake, heading: 'Deals' },
  property: { icon: Building2, heading: 'Properties' },
  order: { icon: Receipt, heading: 'Orders' },
};

/**
 * One search per kind. Explicit rather than routed through a generic RPC: each table names its own
 * display column, and guessing that is how a picker renders a list of uuids.
 */
async function searchKind(kind: SubjectKind, workspaceId: string, q: string): Promise<SubjectValue[]> {
  const like = `%${q}%`;
  const term = q.trim();

  if (kind === 'project') {
    let b = supabase.from('projects').select('id, name, status').eq('workspace_id', workspaceId).limit(8);
    if (term) b = b.ilike('name', like);
    const { data } = await b;
    return (data ?? [])
      // An archived project is not where new work is scheduled — the same exclusion
      // `search_order_link_targets` makes, so the two controls offer the same jobs.
      .filter((r) => (r as { status?: string }).status !== 'archived')
      .map((r) => ({ kind, id: (r as { id: string }).id, label: (r as { name?: string }).name || 'Project' }));
  }

  if (kind === 'deal') {
    // Through the service, not a second query path: `crm_deals` is read in one place so the
    // workspace scope and the embed hints live in one place too.
    const rows = await dealsService.searchDeals(workspaceId, q);
    return rows.map((r) => ({ kind, id: r.id, label: r.title }));
  }

  if (kind === 'property') {
    let b = supabase.from('properties').select('id, title, address, reference_code')
      .eq('workspace_id', workspaceId).limit(8);
    if (term) b = b.or(`title.ilike.${like},address.ilike.${like},reference_code.ilike.${like}`);
    const { data } = await b;
    // `propertyLabel` is the ONE fallback chain for naming a building — re-rolling
    // title -> address -> reference_code here is how two controls start naming the same property
    // differently.
    return (data ?? []).map((r) => {
      const row = r as { id: string; title?: string | null; address?: string | null; reference_code?: string | null };
      return { kind, id: row.id, label: propertyLabel(row) };
    });
  }

  let b = supabase.from('orders').select('id, order_number').eq('workspace_id', workspaceId).limit(8);
  if (term) b = b.ilike('order_number', like);
  const { data } = await b;
  return (data ?? []).map((r) => ({
    kind: 'order' as const, id: (r as { id: string }).id, label: (r as { order_number?: string }).order_number || 'Order',
  }));
}

export const SubjectLinkField: React.FC<{
  workspaceId: string | null | undefined;
  /** The stored subject, already resolved to a label. `null` renders as unset. */
  value: SubjectValue | null;
  /** Called with the new subject, or `null` when the operator clears it. */
  onChange: (next: SubjectValue | null) => void | Promise<void>;
  /** Which kinds this surface may offer. All four by default. */
  kinds?: readonly SubjectKind[];
  disabled?: boolean;
  label?: string;
}> = ({
  workspaceId, value, onChange,
  kinds = ['project', 'deal', 'property', 'order'], disabled, label = 'About',
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SubjectValue[]>([]);
  const [loading, setLoading] = useState(false);

  const kindList = useMemo(() => [...kinds], [kinds]);

  const run = useCallback(async () => {
    if (!workspaceId) { setResults([]); return; }
    setLoading(true);
    try {
      const all = await Promise.all(kindList.map((k) => searchKind(k, workspaceId, q).catch(() => [])));
      setResults(all.flat());
    } finally {
      setLoading(false);
    }
  }, [workspaceId, q, kindList]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { void run(); }, 200);
    return () => clearTimeout(t);
  }, [open, run]);

  const ValueIcon = value ? KIND_META[value.kind].icon : ChevronsUpDown;

  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !workspaceId}
            className="w-full justify-start gap-2 font-normal"
          >
            <ValueIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {value
              ? <span className="truncate">{value.label}</span>
              : <span className="text-muted-foreground">Not linked</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search projects, deals, properties, orders…" value={q} onValueChange={setQ} />
            <CommandList>
              {loading && <div className="p-3 text-xs text-muted-foreground">Searching…</div>}
              {!loading && results.length === 0 && <CommandEmpty>Nothing matches.</CommandEmpty>}
              {/* Clearing has to be possible: a meeting filed against the wrong job is worse than
                  one filed against none, because the wrong job's timeline is then confidently
                  wrong. */}
              {value && (
                <CommandGroup>
                  <CommandItem
                    value="__clear__"
                    onSelect={() => { void onChange(null); setOpen(false); }}
                    className="cursor-pointer text-muted-foreground"
                  >
                    <X className="mr-2 h-3.5 w-3.5" /> Not about anything
                  </CommandItem>
                </CommandGroup>
              )}
              {kindList.map((k) => {
                const group = results.filter((r) => r.kind === k);
                if (group.length === 0) return null;
                const Icon = KIND_META[k].icon;
                return (
                  <CommandGroup key={k} heading={KIND_META[k].heading}>
                    {group.map((r) => (
                      <CommandItem
                        key={`${r.kind}:${r.id}`}
                        value={`${r.kind}:${r.id}`}
                        onSelect={() => { void onChange(r); setOpen(false); }}
                        className="cursor-pointer"
                      >
                        <Icon className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{r.label}</span>
                        {value?.kind === r.kind && value.id === r.id && (
                          <Check className="ml-auto h-3.5 w-3.5 text-primary" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
