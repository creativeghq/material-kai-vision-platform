import React from 'react';
import { FilePlus2, Loader2, Send, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import { invoicingSetupService, type RefRow } from '@/services/invoicingSetupService';
import { inboundService } from '@/modules/finance/services/inboundService';

const VAT_CATEGORIES: Array<{ code: number; label: string }> = [
  { code: 1, label: '24%' }, { code: 2, label: '13%' }, { code: 3, label: '6%' },
  { code: 4, label: '17%' }, { code: 5, label: '9%' }, { code: 6, label: '4%' },
  { code: 7, label: 'Without VAT' }, { code: 8, label: 'No VAT clause (art. 43b)' },
];

interface Props {
  workspaceId: string;
  onRecorded?: () => void;
}

export const RecordExpenseDocumentDialog: React.FC<Props> = ({ workspaceId, onRecorded }) => {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [types, setTypes] = React.useState<RefRow[]>([]);
  const [expTypes, setExpTypes] = React.useState<RefRow[]>([]);
  const [expCats, setExpCats] = React.useState<RefRow[]>([]);
  const [exemptions, setExemptions] = React.useState<RefRow[]>([]);

  const [form, setForm] = React.useState({
    docType: '16.1',
    series: 'A',
    aa: '',
    issueDate: todayLocalISO(),
    issuerVat: '',
    issuerName: '',
    issuerCountry: 'GR',
    net: '',
    vatCategory: '7',
    vatAmount: '0',
    vatExemption: '',
    classificationType: '',
    classificationCategory: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    if (!open) return;
    void Promise.all([
      invoicingSetupService.listReference('invoice_type'),
      invoicingSetupService.listReference('expense_classification_type'),
      invoicingSetupService.listReference('expense_classification_category'),
      invoicingSetupService.listReference('vat_exemption_category').catch(() => [] as RefRow[]),
    ]).then(([t, et, ec, ex]) => {
      setTypes(t.filter((r) => r.direction === 'received' || r.direction === 'entity'));
      setExpTypes(et); setExpCats(ec); setExemptions(ex);
    }).catch(() => undefined);
  }, [open]);

  const isEntity = form.docType.startsWith('17.');
  const needsExemption = form.vatCategory === '7';

  const checkRights = () => void (async () => {
    setBusy(true);
    try {
      const out = await inboundService.checkMydataSendRights(workspaceId);
      toast({
        title: out.canSend ? 'ΑΑΔΕ accepts filings from here' : 'ΑΑΔΕ will not accept filings',
        description: out.detail,
        variant: out.canSend ? undefined : 'destructive',
      });
    } catch (e) {
      toast({
        title: 'Could not reach ΑΑΔΕ',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  })();

  const save = async (andSend: boolean) => {
    setBusy(true);
    try {
      const doc = await inboundService.recordExpenseDocument(workspaceId, {
        docType: form.docType,
        series: form.series.trim(),
        aa: form.aa.trim(),
        issueDate: form.issueDate,
        issuerVat: isEntity ? null : form.issuerVat.trim(),
        issuerName: isEntity ? null : (form.issuerName.trim() || null),
        issuerCountry: isEntity ? 'GR' : form.issuerCountry.trim().toUpperCase(),
        net: Number(form.net || 0),
        vatCategory: Number(form.vatCategory),
        vatAmount: Number(form.vatAmount || 0),
        vatExemptionCategory: needsExemption && form.vatExemption ? Number(form.vatExemption) : null,
        classificationType: form.classificationType || null,
        classificationCategory: form.classificationCategory,
      });
      if (!andSend) {
        toast({ title: 'Recorded', description: 'It is in Expenses, and not filed with ΑΑΔΕ yet.' });
      } else {
        const out = await inboundService.sendToMydata(workspaceId, doc.id);
        if (!out.ok) {
          toast({
            title: 'ΑΑΔΕ refused it',
            description: out.errors?.join(' · ') ?? 'No reason given.',
            variant: 'destructive',
          });
        } else {
          toast({ title: 'Filed', description: `MARK ${out.mark}` });
        }
      }
      setOpen(false);
      onRecorded?.();
    } catch (e) {
      toast({
        title: 'Could not record it',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button size="sm" variant="outline" className="h-9" onClick={() => setOpen(true)}>
        <FilePlus2 className="mr-1.5 h-3.5 w-3.5" /> Record an expense document
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record an expense document</DialogTitle>
            <DialogDescription>
              Rent, a foreign purchase, a contract or your own payroll entry. These are yours to
              file, so they go straight to ΑΑΔΕ rather than through an e-invoicing provider.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="xd-type" className="text-[11px]">Document type</Label>
              <Select value={form.docType} onValueChange={(v) => set('docType', v)}>
                <SelectTrigger id="xd-type" className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="xd-series" className="text-[11px]">Series</Label>
              <Input id="xd-series" className="mt-1 h-9" value={form.series} onChange={(e) => set('series', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="xd-aa" className="text-[11px]">Number</Label>
              <Input id="xd-aa" className="mt-1 h-9" value={form.aa} onChange={(e) => set('aa', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="xd-date" className="text-[11px]">Issue date</Label>
              <Input id="xd-date" type="date" className="mt-1 h-9" value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="xd-ccy" className="text-[11px]">Net amount</Label>
              <Input id="xd-ccy" type="number" step="0.01" className="mt-1 h-9" value={form.net} onChange={(e) => set('net', e.target.value)} />
            </div>

            {!isEntity && (
              <>
                <div>
                  <Label htmlFor="xd-vat" className="text-[11px]">Supplier ΑΦΜ / VAT number</Label>
                  <Input id="xd-vat" className="mt-1 h-9" value={form.issuerVat} onChange={(e) => set('issuerVat', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="xd-name" className="text-[11px]">Supplier name</Label>
                  <Input id="xd-name" className="mt-1 h-9" value={form.issuerName} onChange={(e) => set('issuerName', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="xd-country" className="text-[11px]">Country</Label>
                  <Input id="xd-country" maxLength={2} className="mt-1 h-9" value={form.issuerCountry} onChange={(e) => set('issuerCountry', e.target.value)} />
                </div>
              </>
            )}

            <div>
              <Label htmlFor="xd-vatcat" className="text-[11px]">VAT category</Label>
              <Select value={form.vatCategory} onValueChange={(v) => set('vatCategory', v)}>
                <SelectTrigger id="xd-vatcat" className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VAT_CATEGORIES.map((c) => <SelectItem key={c.code} value={String(c.code)}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="xd-vatamt" className="text-[11px]">VAT amount</Label>
              <Input id="xd-vatamt" type="number" step="0.01" className="mt-1 h-9" value={form.vatAmount} onChange={(e) => set('vatAmount', e.target.value)} />
            </div>

            {needsExemption && (
              <div className="sm:col-span-2">
                <Label htmlFor="xd-exempt" className="text-[11px]">
                  Exemption article — ΑΑΔΕ refuses a 0% line that does not state one
                </Label>
                <Select value={form.vatExemption} onValueChange={(v) => set('vatExemption', v)}>
                  <SelectTrigger id="xd-exempt" className="mt-1 h-9"><SelectValue placeholder="Choose the article…" /></SelectTrigger>
                  <SelectContent>
                    {exemptions.map((e) => <SelectItem key={e.code} value={e.code}>{e.code} — {e.description}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="xd-ecls-type" className="text-[11px]">Expense classification type</Label>
              <Select value={form.classificationType} onValueChange={(v) => set('classificationType', v)}>
                <SelectTrigger id="xd-ecls-type" className="mt-1 h-9"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {expTypes.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="xd-ecls-cat" className="text-[11px]">Expense classification category</Label>
              <Select value={form.classificationCategory} onValueChange={(v) => set('classificationCategory', v)}>
                <SelectTrigger id="xd-ecls-cat" className="mt-1 h-9"><SelectValue placeholder="Required" /></SelectTrigger>
                <SelectContent>
                  {expCats.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.description}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={checkRights} disabled={busy} className="mr-auto">
              <ShieldQuestion className="mr-1 h-3.5 w-3.5" /> Check my ΑΑΔΕ rights
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="outline" onClick={() => void save(false)} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Record only
            </Button>
            <Button onClick={() => void save(true)} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
              Record and file with ΑΑΔΕ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
