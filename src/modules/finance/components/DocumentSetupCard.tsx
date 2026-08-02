/**
 * Document setup (images 5 & 6): which myDATA document types this business issues,
 * each type's default income classification, and its numbering series.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { invoicingSetupService, type RefRow, type DocTypeSetting, type DocSeries, type FinanceBranch } from '@/services/invoicingSetupService';

export const DocumentSetupCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [types, setTypes] = useState<RefRow[]>([]);
  const [incTypes, setIncTypes] = useState<RefRow[]>([]);
  const [incCats, setIncCats] = useState<RefRow[]>([]);
  const [withholdings, setWithholdings] = useState<RefRow[]>([]);
  const [settings, setSettings] = useState<Record<string, DocTypeSetting>>({});
  const [series, setSeries] = useState<DocSeries[]>([]);
  const [branches, setBranches] = useState<FinanceBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Inline add-series form (replaces window.prompt) + per-series next-number edits.
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newSeries, setNewSeries] = useState('');
  const [newStart, setNewStart] = useState('1');
  const [newBranchId, setNewBranchId] = useState<string>('');
  const [nextEdits, setNextEdits] = useState<Record<string, string>>({});
  const branchLabel = (id: string | null) => {
    const b = branches.find((x) => x.id === id);
    return b ? `#${b.branch_code} ${b.name}` : 'HQ';
  };

  const load = async () => {
    setLoading(true);
    try {
      const [t, ic, icc, wh, s, ser, br] = await Promise.all([
        invoicingSetupService.listReference('invoice_type'),
        invoicingSetupService.listReference('income_classification_type'),
        invoicingSetupService.listReference('income_classification_category'),
        invoicingSetupService.listReference('withholding_tax'),
        invoicingSetupService.getDocTypeSettings(workspaceId),
        invoicingSetupService.listSeries(workspaceId),
        invoicingSetupService.listBranches(workspaceId),
      ]);
      setTypes(t); setIncTypes(ic); setIncCats(icc); setWithholdings(wh); setSettings(s); setSeries(ser); setBranches(br);
    } catch (err: any) { toast({ title: 'Failed to load', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (workspaceId) void load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const toggle = async (code: string, enabled: boolean) => {
    setSettings((s) => ({ ...s, [code]: { ...(s[code] ?? { code, default_income_classification_type: null, default_income_classification_category: null, default_withholding_code: null }), enabled } }));
    try { await invoicingSetupService.setDocType(workspaceId, code, { enabled }); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const setDefaultClass = async (code: string, type: string) => {
    setSettings((s) => ({ ...s, [code]: { ...(s[code] ?? { code, enabled: true }), default_income_classification_type: type } as DocTypeSetting }));
    try { await invoicingSetupService.setDocType(workspaceId, code, { default_income_classification_type: type }); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const setDefaultCat = async (code: string, category: string) => {
    const v = category === 'none' ? null : category;
    setSettings((s) => ({ ...s, [code]: { ...(s[code] ?? { code, enabled: true }), default_income_classification_category: v } as DocTypeSetting }));
    try { await invoicingSetupService.setDocType(workspaceId, code, { default_income_classification_category: v }); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const setDefaultWithholding = async (code: string, wh: string) => {
    const v = wh === 'none' ? null : wh;
    setSettings((s) => ({ ...s, [code]: { ...(s[code] ?? { code, enabled: true }), default_withholding_code: v } as DocTypeSetting }));
    try { await invoicingSetupService.setDocType(workspaceId, code, { default_withholding_code: v }); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const startAdd = (code: string) => { setAddingFor(code); setNewSeries(''); setNewStart('1'); setNewBranchId(branches.find((b) => b.branch_code === 0)?.id ?? ''); };
  const submitNewSeries = async (code: string) => {
    if (!newSeries.trim()) { toast({ title: 'Enter a series code (e.g. INV-)', variant: 'destructive' }); return; }
    const start = parseInt(newStart, 10) || 1;
    try {
      await invoicingSetupService.addSeries(workspaceId, code, newSeries.trim(), start, newBranchId || null);
      setAddingFor(null); await load();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const saveNextNumber = async (s: DocSeries) => {
    const n = parseInt(nextEdits[s.id] ?? String(s.next_number), 10);
    if (!Number.isFinite(n) || n < 1) { toast({ title: 'Invalid number', variant: 'destructive' }); return; }
    try { await invoicingSetupService.updateSeries(s.id, { next_number: n }); toast({ title: 'Next number saved' }); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const toggleSeriesActive = async (s: DocSeries) => {
    try { await invoicingSetupService.updateSeries(s.id, { is_active: !s.is_active }); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const removeSeries = async (id: string) => { try { await invoicingSetupService.deleteSeries(id); await load(); } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); } };

  if (loading) return <Card className="lg:col-span-2"><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle>Document Types &amp; Series</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-4 py-2 text-left w-8"><span className="sr-only">Actions</span></th>
              <th className="px-4 py-2 text-left">Code</th>
              <th className="px-4 py-2 text-left">Document type</th>
              <th className="px-4 py-2 text-center">Issue</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => {
              const st = settings[t.code];
              const on = st?.enabled ?? false;
              const isOpen = expanded === t.code;
              const typeSeries = series.filter((s) => s.doc_code === t.code);
              return (
                <React.Fragment key={t.code}>
                  <tr className="border-b border-border/30">
                    <td className="px-4 py-2">
                      <button onClick={() => setExpanded(isOpen ? null : t.code)} className="text-muted-foreground">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{t.code}</td>
                    <td className="px-4 py-2">{t.description}</td>
                    <td className="px-4 py-2 text-center"><Switch checked={on} onCheckedChange={(v) => toggle(t.code, v)} /></td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-muted/20"><td></td><td colSpan={3} className="px-4 py-3 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-44">Default income classification</span>
                        <Select value={st?.default_income_classification_type ?? ''} onValueChange={(v) => setDefaultClass(t.code, v)}>
                          <SelectTrigger className="h-8 max-w-md"><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>{incTypes.map((ic) => <SelectItem key={ic.code} value={ic.code}>{ic.code} — {ic.description}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-44">Default classification category</span>
                        <Select value={st?.default_income_classification_category ?? 'none'} onValueChange={(v) => setDefaultCat(t.code, v)}>
                          <SelectTrigger className="h-8 max-w-md"><SelectValue placeholder="Select…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— None —</SelectItem>
                            {incCats.map((ic) => <SelectItem key={ic.code} value={ic.code}>{ic.code} — {ic.description}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-44">Default withholding tax</span>
                        <Select value={st?.default_withholding_code ?? 'none'} onValueChange={(v) => setDefaultWithholding(t.code, v)}>
                          <SelectTrigger className="h-8 max-w-md"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— None —</SelectItem>
                            {withholdings.map((w) => <SelectItem key={w.code} value={w.code}>{w.description}{w.rate ? ` — ${w.rate}%` : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Numbering series &amp; next number</span>
                          {addingFor !== t.code && (
                            <Button size="sm" variant="outline" className="rounded-full" onClick={() => startAdd(t.code)}><Plus className="h-3.5 w-3.5 mr-1" /> Add series</Button>
                          )}
                        </div>

                        {typeSeries.length === 0 && addingFor !== t.code && (
                          <p className="text-xs text-muted-foreground">No series — uses the default sequential number.</p>
                        )}

                        {typeSeries.map((s) => (
                          <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge variant="outline" className="font-mono">{s.series}</Badge>
                            {branches.length > 1 && <Badge variant="secondary" className="text-[10px]">{branchLabel(s.branch_id)}</Badge>}
                            <span className="text-xs text-muted-foreground">Next #</span>
                            <Input
                              className="h-7 w-24 text-xs"
                              type="number" min="1"
                              value={nextEdits[s.id] ?? String(s.next_number)}
                              onChange={(e) => setNextEdits((m) => ({ ...m, [s.id]: e.target.value }))}
                            />
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => saveNextNumber(s)}>Save</Button>
                            <button type="button" onClick={() => toggleSeriesActive(s)}>
                              <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-[10px] cursor-pointer">{s.is_active ? 'active' : 'inactive'}</Badge>
                            </button>
                            <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => removeSeries(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                        ))}

                        {addingFor === t.code && (
                          <div className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 p-2">
                            <div className="space-y-1">
                              <span className="text-[10px] text-muted-foreground">Series</span>
                              <Input className="h-7 w-28 text-xs" value={newSeries} onChange={(e) => setNewSeries(e.target.value)} placeholder="INV-" />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-muted-foreground">Start from #</span>
                              <Input className="h-7 w-24 text-xs" type="number" min="1" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                            </div>
                            {branches.length > 1 && (
                              <div className="space-y-1">
                                <span className="text-[10px] text-muted-foreground">Establishment</span>
                                <Select value={newBranchId} onValueChange={setNewBranchId}>
                                  <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="HQ" /></SelectTrigger>
                                  <SelectContent>
                                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>#{b.branch_code} {b.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <Button size="sm" className="h-7 rounded-full" onClick={() => submitNewSeries(t.code)}>Add</Button>
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => setAddingFor(null)}>Cancel</Button>
                          </div>
                        )}
                        <p className="text-[11px] text-muted-foreground">Set the start number to continue from your previous software (e.g. last invoice was 1450 → start at 1451).</p>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};
