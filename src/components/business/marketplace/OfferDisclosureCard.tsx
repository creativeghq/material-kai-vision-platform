/**
 * What GPSR art. 19 makes every online offer display (#450).
 *
 * Four things, and the fourth is the one that gets left out: the warnings, in Greek, on the page
 * rather than only on the carton. Completeness is a publish gate at the write — this is where an
 * operator can see what is still missing before the storefront refuses them.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  productComplianceService,
  type OfferDisclosure, type OfferDisclosureRow, type SafetyWarning,
  type ResponsiblePersonSource,
} from '@/modules/finance/services/productComplianceService';

const EMPTY = (productId: string, workspaceId: string): OfferDisclosureRow => ({
  product_id: productId,
  workspace_id: workspaceId,
  manufacturer_name: null,
  manufacturer_postal_address: null,
  manufacturer_email: null,
  responsible_person_source: 'us',
  responsible_person_name: null,
  responsible_person_postal_address: null,
  responsible_person_email: null,
  product_identifier: null,
  product_type: null,
  safety_contact_email: null,
  accessibility_information: null,
});

const RP_LABEL: Record<ResponsiblePersonSource, string> = {
  us: 'We are the responsible person (we import it)',
  named: 'Someone else is named',
  manufacturer_is_eu: 'The manufacturer is established in the Union',
};

export const OfferDisclosureCard: React.FC<{
  productId: string;
  workspaceId: string | null | undefined;
  /** Bumped by the parent after a save elsewhere on the page. */
  refreshKey?: number;
}> = ({ productId, workspaceId, refreshKey = 0 }) => {
  const { toast } = useToast();
  const [row, setRow] = useState<OfferDisclosureRow | null>(null);
  const [verdict, setVerdict] = useState<OfferDisclosure | null>(null);
  const [warnings, setWarnings] = useState<SafetyWarning[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [r, v, w] = await Promise.all([
        productComplianceService.getDisclosureRow(productId),
        productComplianceService.offerDisclosure(productId, 'el'),
        productComplianceService.listWarnings(productId),
      ]);
      setRow(r ?? EMPTY(productId, workspaceId));
      setVerdict(v); setWarnings(w); setFailed(false);
    } catch {
      setRow(null); setVerdict(null); setWarnings([]); setFailed(true);
    } finally { setLoading(false); }
  }, [productId, workspaceId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const set = (patch: Partial<OfferDisclosureRow>) =>
    setRow((r) => (r ? { ...r, ...patch } : r));

  const save = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await productComplianceService.saveDisclosure(row);
      await load();
      toast({ title: 'Offer disclosure saved' });
    } catch (err: unknown) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  };

  const addWarning = async () => {
    if (!workspaceId || !draft.trim()) return;
    try {
      await productComplianceService.addWarning({
        product_id: productId, workspace_id: workspaceId, language_code: 'el',
        warning_text: draft.trim(),
        position: warnings.filter((w) => w.language_code === 'el').length,
      });
      setDraft('');
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not add the warning',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  const removeWarning = async (id: string) => {
    try { await productComplianceService.removeWarning(id); await load(); }
    catch (err: unknown) {
      toast({
        title: 'Could not remove the warning',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking the offer against GPSR art. 19…
      </p>
    );
  }

  if (failed || !row) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-destructive">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        The offer disclosure could not be checked just now. That is not a statement that it is
        complete.
      </p>
    );
  }

  const el = warnings.filter((w) => w.language_code === 'el');

  return (
    <div className="space-y-3">
      {verdict && (
        <div
          className={`flex items-start gap-1.5 rounded-md border p-2 text-[11px] ${
            verdict.status === 'incomplete'
              ? 'border-amber-500/40 bg-amber-500/5'
              : 'border-hairline bg-surface-sunken'
          }`}
        >
          {verdict.status === 'incomplete'
            ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
            : <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" />}
          <div>
            <p>{verdict.reason}</p>
            {(verdict.missing?.length ?? 0) > 0 && (
              <p className="mt-0.5 font-mono text-muted-foreground">
                {verdict.missing?.join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Manufacturer name (a)">
          <Input
            className="h-8 text-xs" value={row.manufacturer_name ?? ''}
            onChange={(e) => set({ manufacturer_name: e.target.value || null })}
          />
        </Field>
        <Field label="Manufacturer email (a)">
          <Input
            className="h-8 text-xs" value={row.manufacturer_email ?? ''}
            onChange={(e) => set({ manufacturer_email: e.target.value || null })}
          />
        </Field>
        <Field label="Manufacturer postal address (a)" className="sm:col-span-2">
          <Input
            className="h-8 text-xs" value={row.manufacturer_postal_address ?? ''}
            onChange={(e) => set({ manufacturer_postal_address: e.target.value || null })}
          />
        </Field>

        <Field label="Responsible person (b)" className="sm:col-span-2">
          <Select
            value={row.responsible_person_source}
            onValueChange={(v) => set({ responsible_person_source: v as ResponsiblePersonSource })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RP_LABEL) as ResponsiblePersonSource[]).map((k) => (
                <SelectItem key={k} value={k}>{RP_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {row.responsible_person_source === 'us' && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Filled from the business identity in Finance → Settings. A blank there is a gap in the
              business record, not in this product.
            </p>
          )}
        </Field>

        {row.responsible_person_source === 'named' && (
          <>
            <Field label="Responsible person name">
              <Input
                className="h-8 text-xs" value={row.responsible_person_name ?? ''}
                onChange={(e) => set({ responsible_person_name: e.target.value || null })}
              />
            </Field>
            <Field label="Responsible person email">
              <Input
                className="h-8 text-xs" value={row.responsible_person_email ?? ''}
                onChange={(e) => set({ responsible_person_email: e.target.value || null })}
              />
            </Field>
            <Field label="Responsible person postal address" className="sm:col-span-2">
              <Input
                className="h-8 text-xs" value={row.responsible_person_postal_address ?? ''}
                onChange={(e) => set({ responsible_person_postal_address: e.target.value || null })}
              />
            </Field>
          </>
        )}

        <Field label="Product identifier (c)">
          <Input
            className="h-8 text-xs" value={row.product_identifier ?? ''}
            onChange={(e) => set({ product_identifier: e.target.value || null })}
            placeholder="model, batch or serial"
          />
        </Field>
        <Field label="Product type (c)">
          <Input
            className="h-8 text-xs" value={row.product_type ?? ''}
            onChange={(e) => set({ product_type: e.target.value || null })}
          />
        </Field>

        <Field label="Safety-only contact email (art. 35(2))" className="sm:col-span-2">
          <Input
            className="h-8 text-xs" value={row.safety_contact_email ?? ''}
            onChange={(e) => set({ safety_contact_email: e.target.value || null })}
            placeholder="used for recalls and nothing else"
          />
        </Field>

        <Field label="Accessibility information (EAA Annex I IV(g)(i))" className="sm:col-span-2">
          <Textarea
            className="text-xs" rows={2} value={row.accessibility_information ?? ''}
            onChange={(e) => set({ accessibility_information: e.target.value || null })}
            placeholder="what the manufacturer publishes about accessibility, carried through to the offer"
          />
        </Field>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">Warnings and safety information, in Greek (d)</Label>
        {el.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            None recorded. Art 19(d) wants these on the offer itself — the carton is read after the
            purchase, not before it.
          </p>
        )}
        {el.map((w) => (
          <div key={w.id} className="flex items-start gap-2 rounded-md border border-hairline p-1.5 text-xs">
            <span className="flex-1">{w.warning_text}</span>
            <Button
              type="button" size="sm" variant="ghost" className="h-6 px-1.5"
              onClick={() => removeWarning(w.id)} aria-label="Remove this warning"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            className="h-8 text-xs" value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="π.χ. Προσοχή: αιχμηρές ακμές"
            aria-label="New warning in Greek"
          />
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={addWarning} disabled={!draft.trim()}>
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      <Button type="button" size="sm" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
        Save offer disclosure
      </Button>
    </div>
  );
};

const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> =
  ({ label, className, children }) => (
    <div className={className}>
      <Label className="text-[11px]">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
