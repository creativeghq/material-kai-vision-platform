import { useCallback, useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { Plus, Loader2, FileText, Download, Trash2, Wand2, ScanLine, Receipt, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Skeleton } from '@/components/core/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { statusTone } from '@/utils/statusTone';
import {
  hrService, type AccountingDoc, type Reconciliation, ACCT_KIND_GROUP_LABELS,
} from '../services/hrService';
import { SectionHeader, EmptyState, fileToBase64 } from './_shared';

const money = (n: number | null | undefined, c: string) => formatMoney(n, c);
const thisMonth = () => new Date().toISOString().slice(0, 7);

export function AccountingSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [period, setPeriod] = useState(thisMonth());
  const [docs, setDocs] = useState<AccountingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try { setDocs((await hrService.listAccountingDocs(workspaceId, period)).documents); }
    catch (e) { toast({ title: 'Failed to load documents', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, period, toast]);
  useEffect(() => { void load(); setRecon(null); }, [load]);

  const onFile = async (file: File | null) => {
    if (!file || !workspaceId) return; setBusy('upload');
    try {
      const b64 = await fileToBase64(file);
      await hrService.uploadAccountingDoc(workspaceId, { period, name: file.name, content_base64: b64, content_type: file.type || undefined });
      toast({ title: 'Document uploaded', description: 'Run “Analyze” to extract the payment details.' }); load();
    } catch (e) { toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };
  const analyze = async (d: AccountingDoc) => {
    if (!workspaceId) return; setBusy(d.id);
    try { const r = await hrService.analyzeAccountingDoc(workspaceId, d.id); toast({ title: 'Analyzed', description: `Extracted payment details · ${r.credits_used} credits.` }); load(); }
    catch (e) { toast({ title: 'Analysis failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const view = async (d: AccountingDoc) => {
    if (!workspaceId) return; setBusy(d.id + ':v');
    try { const { url } = await hrService.signAccountingDoc(workspaceId, d.id); window.open(url, '_blank'); }
    catch (e) { toast({ title: 'Could not open', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const del = async (d: AccountingDoc) => {
    if (!workspaceId) return;
    try { await hrService.deleteAccountingDoc(workspaceId, d.id); load(); }
    catch (e) { toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' }); }
  };
  const prepare = async () => {
    if (!workspaceId) return; setBusy('prepare');
    try { const r = await hrService.prepareAccountingPeriod(workspaceId, period); setRecon(r.reconciliation); toast({ title: 'Reconciled', description: `${r.stamped_finance_lines} Finance line(s) stamped · ${r.credits_used} credits.` }); }
    catch (e) { toast({ title: 'Reconciliation failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const analyzedCount = docs.filter((d) => d.status === 'analyzed').length;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Accounting Documents"
        subtitle="Upload the month's statutory payment docs (EFKA / Tax / APD) — AI reads the Payment ID & amounts"
        actions={
          <div className="flex items-center gap-2">
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 w-40" />
            {canManage && (
              <>
                <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                <Button size="sm" disabled={busy === 'upload'} onClick={() => fileRef.current?.click()}>{busy === 'upload' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Upload</Button>
              </>
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? <div className="p-4"><Skeleton className="h-40 w-full" /></div> : docs.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={`No documents for ${period}`}
              hint={canManage ? 'Upload this month’s EFKA, tax and APD payment slips — the AI reads the Payment ID and amounts off them.' : undefined}
              action={canManage ? (
                <Button size="sm" disabled={busy === 'upload'} onClick={() => fileRef.current?.click()}>
                  {busy === 'upload' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Upload document
                </Button>
              ) : undefined}
            />
          ) : (
            <div className="divide-y divide-border/40">
              {docs.map((d) => (
                <div key={d.id} className="p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.doc_kind || 'Not analyzed'}{d.extracted?.kind_group ? ` · ${ACCT_KIND_GROUP_LABELS[d.extracted.kind_group] ?? d.extracted.kind_group}` : ''}{d.status === 'analyzed' && d.ai_confidence != null ? ` · ${Math.round((d.ai_confidence || 0) * 100)}% confidence` : ''}</div>
                    </div>
                    <span className={`text-xs capitalize ${statusTone(d.status)}`}>{d.status}</span>
                    {canManage && d.status !== 'analyzed' && (
                      <Button size="sm" variant="outline" className="h-8" disabled={busy === d.id} onClick={() => analyze(d)} title="AI OCR — credits charged by actual usage">
                        {busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ScanLine className="h-4 w-4 mr-1" />Analyze</>}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-8" disabled={busy === d.id + ':v'} onClick={() => view(d)} title="View"><Download className="h-4 w-4" /></Button>
                    {canManage && <Button size="sm" variant="ghost" className="h-8" onClick={() => del(d)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </div>
                  {d.status === 'analyzed' && d.extracted && (
                    <div className="mt-2 ml-7 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                      <Field label="Payment ID" value={d.extracted.payment_id} mono />
                      <Field label="Reference #" value={d.extracted.payment_number} mono />
                      <Field label="Amount" value={money(d.extracted.amount, d.extracted.currency)} />
                      <Field label="Payee" value={d.extracted.payee} />
                      {d.extracted.due_date && <Field label="Due" value={d.extracted.due_date} />}
                      {d.ai_notes && <div className="col-span-2 sm:col-span-4 text-muted-foreground italic">{d.ai_notes}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && analyzedCount > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground">Reconcile the analyzed documents against the {period} payroll run — the AI matches each obligation to its payment and stamps the Payment IDs onto Finance.</p>
          <Button size="sm" variant="outline" disabled={busy === 'prepare'} onClick={prepare} title="AI reconciliation — credits charged by actual usage">
            {busy === 'prepare' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}Prepare &amp; reconcile
          </Button>
        </div>
      )}

      {recon && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">{recon.ready_to_pay ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />} Reconciliation — {period}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{recon.summary}</p>
            {recon.matches?.length > 0 && (
              <div className="space-y-1">
                {recon.matches.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs border-b border-border/30 py-1">
                    <span className="capitalize">{m.obligation?.replace('_', ' ')}</span>
                    <span className="text-muted-foreground">{m.document_name || '—'}{m.payment_id ? ` · ${m.payment_id}` : ''}</span>
                    <span className={`text-xs capitalize ${statusTone(m.status === 'matched' ? 'match' : m.status)}`}>{m.status}</span>
                  </div>
                ))}
              </div>
            )}
            {recon.discrepancies && recon.discrepancies.length > 0 && (
              <div className="text-xs text-amber-600 dark:text-amber-400">
                {recon.discrepancies.map((d, i) => <div key={i}>⚠ {d}</div>)}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return <div><span className="text-muted-foreground">{label}: </span><span className={mono ? 'font-mono' : ''}>{value || '—'}</span></div>;
}
