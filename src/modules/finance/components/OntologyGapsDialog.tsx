/**
 * Resolve the names this queue uses that CRM does not know.
 *
 * Rungs 2 and 3 of the markup ladder match `products.brand_company_id` and
 * `products.supplier_company_id`. A maker or an issuer with no company behind it means those
 * rungs are unreachable for every line carrying the name, so the ladder falls through to the
 * workspace default — measured on the live backlog, 988 lines blocked on 92 supplier names and
 * 203 on 88 makers, with the top ten of each clearing 62% and 43% of them.
 *
 * That concentration is the whole reason this screen is worth having: the list is ranked by how
 * many LINES a term blocks, so the work is a few dozen decisions rather than 1,734.
 *
 * ── What this screen may and may not do ───────────────────────────────────────────────────────
 * It never creates a CRM party as a side effect of resolving. A maker on an invoice line is as
 * likely to be a typo, an abbreviation or the distributor's own name, and CLAUDE.md forbids
 * minting a party silently — so "not in CRM" offers `QuickAddCompanyDialog`, which runs the
 * duplicate probe every other creation path runs, and the operator decides.
 *
 * A `candidate` is drawn as a QUESTION, never as an answer. It is a model's guess with a
 * confidence and its evidence attached; only `ontology_confirm_binding` — a workspace admin —
 * can move it to `confirmed`. Rendering the two alike would discard the only distinction that
 * makes an AI-assisted mapping safe to act on.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, Sparkles, UserPlus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { QuickAddCompanyDialog } from '@/components/business/crm/QuickAddCompanyDialog';
import {
  warehouseService, type OntologyGap, type OntologyConceptType,
} from '@/services/warehouseService';

interface CompanyHit { id: string; name: string }
interface CategoryOption { id: string; category_key: string; name: string }

const TYPE_LABEL: Record<OntologyConceptType, string> = {
  manufacturer: 'Manufacturer',
  supplier: 'Supplier',
  material_category: 'Category',
};

/** One row of the work list: the term, what it blocks, and the decision. */
const GapRow: React.FC<{
  gap: OntologyGap;
  workspaceId: string;
  categories: CategoryOption[];
  onResolved: (bindingId: string) => void;
}> = ({ gap, workspaceId, categories, onResolved }) => {
  const { toast } = useToast();
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<CompanyHit[]>([]);
  const [picked, setPicked] = useState<{ id?: string; key?: string; label: string } | null>(
    // A candidate arrives with the model's suggestion already in the box — as a suggestion.
    gap.status === 'candidate' && gap.target_label
      ? { id: gap.target_id ?? undefined, key: gap.target_key ?? undefined, label: gap.target_label }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const isParty = gap.concept_type === 'manufacturer' || gap.concept_type === 'supplier';

  // Party search, debounced. `CRM_SEARCH_COLUMN` is the one way to search a party — it holds the
  // folded text AND its Greek→Latin transliteration, so "ΜΕΓΑΒΑΤ" and "megavat" find each other.
  useEffect(() => {
    if (!isParty || term.trim().length < 2) { setHits([]); return; }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const { data } = await supabase
        .from('crm_companies').select('id, name')
        .eq('workspace_id', workspaceId)
        .ilike(CRM_SEARCH_COLUMN, foldedLike(term.trim()))
        .limit(8);
      if (!cancelled) setHits((data ?? []) as CompanyHit[]);
    }, 250);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [term, isParty, workspaceId]);

  const confirm = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const res = await warehouseService.ontologyConfirm(gap.binding_id, { id: picked.id, key: picked.key });
      toast({
        title: `“${gap.raw_term}” → ${picked.label}`,
        // The promotion note matters: confirming binds it for THIS workspace, and only a platform
        // operator turns one tenant's observation into platform-wide vocabulary.
        description: res.promoted_to_global_vocabulary
          ? 'Confirmed, and promoted to the global vocabulary.'
          : res.note ?? `${gap.occurrences} queued line${gap.occurrences === 1 ? '' : 's'} can now reach the markup rung.`,
      });
      onResolved(gap.binding_id);
    } catch (err) {
      toast({ title: 'Could not confirm', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const reject = async () => {
    setBusy(true);
    try {
      await warehouseService.ontologyReject(gap.binding_id, 'rejected from the intake resolver');
      // Rejected keeps the term and its evidence, so the next proposal run cannot suggest the
      // same wrong answer with nothing recording that a human already said no.
      toast({ title: `“${gap.raw_term}” left unresolved`, description: 'It will not be proposed again.' });
      onResolved(gap.binding_id);
    } catch (err) {
      toast({ title: 'Could not reject', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 border-b border-hairline px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant="neutral" className="text-[10px]">{TYPE_LABEL[gap.concept_type]}</Badge>
        <span className="text-sm font-medium">{gap.raw_term}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {gap.occurrences} queued line{gap.occurrences === 1 ? '' : 's'}
        </span>
        {gap.status === 'candidate' && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
            <Sparkles className="h-3 w-3" />
            suggested{gap.confidence != null ? ` · ${Math.round(gap.confidence * 100)}% sure` : ''}
            {/* Drawn as a question mark, on purpose. Nothing here is settled until a human says so. */}
            {gap.target_label ? ` — ${gap.target_label}?` : ''}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isParty ? (
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-7 text-xs"
              value={picked ? picked.label : term}
              onChange={(e) => { setPicked(null); setTerm(e.target.value); }}
              placeholder="Find the company in CRM…"
            />
            {!picked && hits.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-sm border border-hairline bg-card shadow-overlay">
                {hits.map((h) => (
                  <button key={h.id} type="button"
                    className="block w-full px-2 py-1.5 text-left text-xs hover:bg-surface-sunken"
                    onClick={() => { setPicked({ id: h.id, label: h.name }); setHits([]); }}>
                    {h.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Select
            value={picked?.key ?? ''}
            onValueChange={(v) => {
              const c = categories.find((x) => x.category_key === v);
              setPicked(c ? { key: c.category_key, label: c.name } : null);
            }}>
            <SelectTrigger className="h-8 min-w-[240px] flex-1 text-xs">
              <SelectValue placeholder="Pick the category…" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c.category_key} value={c.category_key}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Button size="sm" className="h-8 rounded-sm" disabled={!picked || busy} onClick={confirm}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          <span className="ml-1">Confirm</span>
        </Button>
        {isParty && (
          <Button size="sm" variant="outline" className="h-8 rounded-sm" disabled={busy} onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-1 h-3.5 w-3.5" /> Not in CRM
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 rounded-sm text-muted-foreground" disabled={busy} onClick={reject}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {addOpen && (
        <QuickAddCompanyDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          initialName={gap.raw_term}
          /*
           * Seed the VAT for a supplier, because it is the better outcome than the binding.
           * `_approve_pending_item_core` attributes a supplier by matching
           * `inbound_documents.issuer_vat` exactly — so a company created WITH that number
           * answers for every line that issuer will ever send, and this binding is never
           * consulted again. Seeding only the name would make the operator retype the one thing
           * the invoice already told us.
           */
          initialVat={gap.concept_type === 'supplier'
            ? ((gap.evidence?.issuer_vat as string | undefined) ?? undefined)
            : undefined}
          /* `manufacturer` is what makes the BRAND rung reachable — see the prop's own note. */
          role={gap.concept_type === 'manufacturer' ? 'manufacturer' : 'supplier'}
          workspaceId={workspaceId}
          onCreated={(company: { id: string; name: string }) => {
            // Created deliberately, through the duplicate probe — then bound. Never the reverse.
            setPicked({ id: company.id, label: company.name });
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
};

export const OntologyGapsDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  /** So the queue can re-read its own gap banner once names have been resolved. */
  onChanged?: () => void;
}> = ({ open, onOpenChange, workspaceId, onChanged }) => {
  const { toast } = useToast();
  const [gaps, setGaps] = useState<OntologyGap[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OntologyConceptType | 'all'>('all');

  const load = useCallback(async () => {
    if (!open) return;
    try {
      setLoading(true);
      const [g, cats] = await Promise.all([
        warehouseService.ontologyGaps(workspaceId, { limit: 200 }),
        supabase.from('material_categories').select('id, category_key, name')
          .eq('is_active', true).order('name')
          .then((r) => (r.data ?? []) as CategoryOption[], () => [] as CategoryOption[]),
      ]);
      setGaps(g);
      setCategories(cats);
    } catch (err) {
      toast({ title: 'Could not load the names', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [open, workspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(
    () => (filter === 'all' ? gaps : gaps.filter((g) => g.concept_type === filter)),
    [gaps, filter],
  );
  const blocked = useMemo(() => shown.reduce((a, g) => a + g.occurrences, 0), [shown]);

  const resolved = (bindingId: string) => {
    setGaps((prev) => prev.filter((g) => g.binding_id !== bindingId));
    onChanged?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Names this queue uses that CRM does not know</DialogTitle>
          <DialogDescription>
            Ranked by how many queued lines each name blocks. A line whose maker or supplier is
            unknown cannot reach the brand or supplier markup rung, so it prices at the workspace
            default.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as OntologyConceptType | 'all')}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everything</SelectItem>
              <SelectItem value="supplier">Suppliers</SelectItem>
              <SelectItem value="manufacturer">Manufacturers</SelectItem>
              <SelectItem value="material_category">Categories</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">
            {shown.length} name{shown.length === 1 ? '' : 's'} · {blocked} queued line{blocked === 1 ? '' : 's'} blocked
          </span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : shown.length === 0 ? (
            // The honest empty state: nothing to resolve is a real and good outcome here, and it
            // is NOT the same as "we never looked" — the queue scans on load.
            <p className="py-10 text-center text-sm text-muted-foreground">
              Every name in the queue resolves. Nothing to decide.
            </p>
          ) : (
            shown.map((g) => (
              <GapRow key={g.binding_id} gap={g} workspaceId={workspaceId}
                categories={categories} onResolved={resolved} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
