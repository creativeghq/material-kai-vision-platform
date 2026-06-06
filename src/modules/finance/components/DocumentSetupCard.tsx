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
import { invoicingSetupService, type RefRow, type DocTypeSetting, type DocSeries } from '@/services/invoicingSetupService';

export const DocumentSetupCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [types, setTypes] = useState<RefRow[]>([]);
  const [incTypes, setIncTypes] = useState<RefRow[]>([]);
  const [settings, setSettings] = useState<Record<string, DocTypeSetting>>({});
  const [series, setSeries] = useState<DocSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [t, ic, s, ser] = await Promise.all([
        invoicingSetupService.listReference('invoice_type'),
        invoicingSetupService.listReference('income_classification_type'),
        invoicingSetupService.getDocTypeSettings(workspaceId),
        invoicingSetupService.listSeries(workspaceId),
      ]);
      setTypes(t); setIncTypes(ic); setSettings(s); setSeries(ser);
    } catch (err: any) { toast({ title: 'Failed to load', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (workspaceId) void load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const toggle = async (code: string, enabled: boolean) => {
    setSettings((s) => ({ ...s, [code]: { ...(s[code] ?? { code, default_income_classification_type: null, default_income_classification_category: null }), enabled } }));
    try { await invoicingSetupService.setDocType(workspaceId, code, { enabled }); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const setDefaultClass = async (code: string, type: string) => {
    setSettings((s) => ({ ...s, [code]: { ...(s[code] ?? { code, enabled: true }), default_income_classification_type: type } as DocTypeSetting }));
    try { await invoicingSetupService.setDocType(workspaceId, code, { default_income_classification_type: type }); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const addSeries = async (code: string) => {
    const prefix = window.prompt(`Series prefix for type ${code} (e.g. ΤΠ-)?`, '');
    if (prefix === null || !prefix.trim()) return;
    const startRaw = window.prompt('Start number?', '1');
    const start = parseInt(startRaw ?? '1', 10) || 1;
    try { await invoicingSetupService.addSeries(workspaceId, code, prefix.trim(), start); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const removeSeries = async (id: string) => { try { await invoicingSetupService.deleteSeries(id); await load(); } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); } };

  if (loading) return <Card className="lg:col-span-2"><CardContent className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm">Document types &amp; series</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-4 py-2 text-left w-8"></th>
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
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Numbering series</span>
                          <Button size="sm" variant="outline" onClick={() => addSeries(t.code)}><Plus className="h-3.5 w-3.5 mr-1" /> Add series</Button>
                        </div>
                        {typeSeries.length === 0 ? <p className="text-xs text-muted-foreground">No series — uses the default sequential number.</p> : (
                          <div className="space-y-1">
                            {typeSeries.map((s) => (
                              <div key={s.id} className="flex items-center gap-3 text-sm">
                                <Badge variant="outline" className="font-mono">{s.series}</Badge>
                                <span className="text-muted-foreground">next #{s.next_number}</span>
                                {s.is_active && <Badge variant="secondary" className="text-[10px]">active</Badge>}
                                <Button size="sm" variant="ghost" onClick={() => removeSeries(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>
                            ))}
                          </div>
                        )}
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
