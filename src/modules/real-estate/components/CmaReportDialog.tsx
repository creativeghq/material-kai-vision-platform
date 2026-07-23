// #281 — Comparative Market Analysis: a client-facing listing-pitch report built from the
// agency's own comparable stock (active + sold). In-app preview + a self-contained print/PDF
// (opens a styled window → browser "Save as PDF"), so no server-side pdf-lib build needed.
import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { realEstateService, type CmaReport } from '../services/realEstateService';

const PROPERTY_TYPES = ['residential', 'commercial', 'land', 'other'];
const money = (n: number | null | undefined, ccy = 'EUR') => (n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(n));
const perSqm = (n: number | null, ccy = 'EUR') => (n == null ? '—' : `${money(n, ccy)}/m²`);

export const CmaReportDialog: React.FC<{ ws: string; propertyId?: string; open: boolean; onOpenChange: (o: boolean) => void }> = ({ ws, propertyId, open, onOpenChange }) => {
  const { toast } = useToast();
  const [report, setReport] = useState<CmaReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState<{ property_type: string; town: string; area: string }>({ property_type: 'residential', town: '', area: '' });

  const run = useCallback(async (params: { property_id?: string; property_type?: string; town?: string; area?: number }) => {
    setLoading(true);
    try { setReport(await realEstateService.cmaReport(ws, params)); }
    catch (e) { toast({ title: 'Could not generate CMA', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [ws, toast]);

  useEffect(() => {
    if (open && propertyId) void run({ property_id: propertyId });
    if (!open) setReport(null);
  }, [open, propertyId, run]);

  const print = () => {
    if (!report) return;
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) { toast({ title: 'Allow pop-ups to print the report', variant: 'destructive' }); return; }
    w.document.write(buildCmaHtml(report));
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 350);
  };

  const ccy = report?.subject.currency ?? 'EUR';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Comparative Market Analysis</DialogTitle></DialogHeader>

        {!propertyId && !report && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={f.property_type} onValueChange={(v) => setF((p) => ({ ...p, property_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROPERTY_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Town</Label><Input value={f.town} onChange={(e) => setF((p) => ({ ...p, town: e.target.value }))} placeholder="e.g. Athens" /></div>
            <div><Label className="text-xs">Area m²</Label><Input type="number" value={f.area} onChange={(e) => setF((p) => ({ ...p, area: e.target.value }))} /></div>
            <div className="col-span-3"><Button className="rounded-full" disabled={loading} onClick={() => run({ property_type: f.property_type, town: f.town || undefined, area: f.area ? Number(f.area) : undefined })}>Generate report</Button></div>
          </div>
        )}

        {loading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}

        {report && !loading && (
          <div className="space-y-4">
            <div className="text-sm">
              <span className="font-semibold">{report.subject.title || `${report.subject.property_type} in ${report.subject.town || '—'}`}</span>
              {report.subject.area ? <span className="text-muted-foreground"> · {report.subject.area} m²</span> : null}
            </div>

            {report.suggestion ? (
              <div className="dashboard-card p-4 text-center ring-1 ring-primary/25">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Suggested asking price</div>
                <div className="mt-1 text-2xl font-semibold text-primary">{money(report.suggestion.estimate, ccy)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">range {money(report.suggestion.low, ccy)} – {money(report.suggestion.high, ccy)}</div>
              </div>
            ) : (
              <div className="dashboard-card p-6 text-center text-sm text-muted-foreground">Not enough comparable listings to suggest a price yet {report.subject.area ? '' : '(add a floor area to the subject)'}.</div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Comparables" value={String(report.stats.count)} />
              <Stat label="Median" value={perSqm(report.stats.median_per_sqm, ccy)} />
              <Stat label="Range" value={report.stats.min_per_sqm != null ? `${money(report.stats.min_per_sqm, ccy)}–${money(report.stats.max_per_sqm, ccy)}` : '—'} />
              <Stat label="Avg days on market" value={report.stats.avg_days_on_market != null ? `${report.stats.avg_days_on_market}d` : '—'} />
            </div>

            {report.comps.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Property</th><th className="py-1.5 px-2 font-medium">Area</th><th className="py-1.5 px-2 font-medium">Price</th><th className="py-1.5 px-2 font-medium">€/m²</th><th className="py-1.5 pl-2 font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {report.comps.map((c) => (
                      <tr key={c.id} className="border-b border-border/50">
                        <td className="py-1.5 pr-2">{c.title || 'Listing'}{c.town ? <span className="text-muted-foreground"> · {c.town}</span> : null}</td>
                        <td className="py-1.5 px-2 text-muted-foreground">{c.area ? `${c.area} m²` : '—'}</td>
                        <td className="py-1.5 px-2">{money(c.price, c.currency)}</td>
                        <td className="py-1.5 px-2">{perSqm(c.price_per_sqm, c.currency)}</td>
                        <td className="py-1.5 pl-2"><span className="capitalize text-muted-foreground">{c.listing_status.replace('_', ' ')}{c.days_on_market != null ? ` · ${c.days_on_market}d` : ''}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {!propertyId && <Button variant="ghost" className="rounded-full" onClick={() => setReport(null)}>New</Button>}
              <Button className="rounded-full" onClick={print}><Printer className="mr-1.5 h-4 w-4" /> Save as PDF</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="dashboard-card p-3"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-0.5 text-sm font-semibold">{value}</div></div>
);

// Self-contained printable HTML (inline styles — Tailwind classes don't cross the popup boundary).
function buildCmaHtml(r: CmaReport): string {
  const ccy = r.subject.currency || 'EUR';
  const m = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy, maximumFractionDigits: 0 }).format(n));
  const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const subjectTitle = esc(r.subject.title || `${r.subject.property_type} in ${r.subject.town || '—'}`);
  const rows = r.comps.map((c) => `<tr>
    <td>${esc(c.title || 'Listing')}${c.town ? ` · ${esc(c.town)}` : ''}</td>
    <td>${c.area ? `${c.area} m²` : '—'}</td>
    <td>${m(c.price)}</td>
    <td>${c.price_per_sqm != null ? m(c.price_per_sqm) + '/m²' : '—'}</td>
    <td style="text-transform:capitalize">${esc(c.listing_status.replace('_', ' '))}${c.days_on_market != null ? ` · ${c.days_on_market}d` : ''}</td>
  </tr>`).join('');
  const suggestion = r.suggestion
    ? `<div class="hero"><div class="lbl">Suggested asking price</div><div class="big">${m(r.suggestion.estimate)}</div><div class="sub">range ${m(r.suggestion.low)} – ${m(r.suggestion.high)}</div></div>`
    : `<div class="note">Not enough comparable listings to suggest a price.</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>CMA — ${subjectTitle}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;margin:0;padding:32px;max-width:800px}
    h1{font-size:20px;margin:0 0 2px} .meta{color:#666;font-size:13px;margin-bottom:20px}
    .hero{border:1px solid #d9c2d2;border-radius:12px;padding:18px;text-align:center;margin:18px 0;background:#faf6f9}
    .hero .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888}
    .hero .big{font-size:30px;font-weight:700;color:#b0106a;margin:4px 0} .hero .sub{font-size:13px;color:#666}
    .stats{display:flex;gap:10px;margin:16px 0} .stat{flex:1;border:1px solid #eee;border-radius:8px;padding:10px}
    .stat .k{font-size:11px;color:#888} .stat .v{font-size:15px;font-weight:600;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee}
    th{font-size:11px;text-transform:uppercase;color:#888} .note{color:#888;text-align:center;padding:24px}
    .foot{margin-top:24px;font-size:11px;color:#999}
    @media print{body{padding:0}}
  </style></head><body>
    <h1>Comparative Market Analysis</h1>
    <div class="meta">${subjectTitle}${r.subject.area ? ` · ${r.subject.area} m²` : ''} · generated ${new Date(r.generated_at).toLocaleDateString()}</div>
    ${suggestion}
    <div class="stats">
      <div class="stat"><div class="k">Comparables</div><div class="v">${r.stats.count}${r.stats.sold_count ? ` (${r.stats.sold_count} sold)` : ''}</div></div>
      <div class="stat"><div class="k">Median €/m²</div><div class="v">${r.stats.median_per_sqm != null ? m(r.stats.median_per_sqm) : '—'}</div></div>
      <div class="stat"><div class="k">Range €/m²</div><div class="v">${r.stats.min_per_sqm != null ? `${m(r.stats.min_per_sqm)}–${m(r.stats.max_per_sqm)}` : '—'}</div></div>
      <div class="stat"><div class="k">Avg days on market</div><div class="v">${r.stats.avg_days_on_market != null ? r.stats.avg_days_on_market + 'd' : '—'}</div></div>
    </div>
    <table><thead><tr><th>Property</th><th>Area</th><th>Price</th><th>€/m²</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="foot">Based on comparable listings in this agency's portfolio. Indicative only — not a formal valuation.</div>
  </body></html>`;
}
