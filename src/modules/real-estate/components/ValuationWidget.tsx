import React, { useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { TrendingUp, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Input } from '@/components/core/ui/input';
import { realEstatePublic, type ValuationResult } from '../services/realEstateService';

const money = (n: number | null, ccy = 'EUR') => formatMoney(n, ccy, { decimals: 0 });

// Public seller lead-magnet on the agency profile: instant comps-based valuation + captures
// the visitor as a seller lead. Estimate comes from the agency's own comparable listings.
export const ValuationWidget: React.FC<{ userId: string }> = ({ userId }) => {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', phone: '', address: '', town: '', property_type: 'residential', area: '' });
  const [consent, setConsent] = useState(false);
  // Separate, optional marketing opt-in — see PublicListingPage.InquiryForm. Without it the seller
  // lead lands with marketing_consent=false (the column default) and no automation can ever mail them.
  const [marketing, setMarketing] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) { setErr('Please accept the privacy consent.'); return; }
    setState('sending'); setErr('');
    try {
      const r = await realEstatePublic.requestValuation({ userId }, {
        name: f.name, email: f.email, phone: f.phone || undefined, address: f.address || undefined,
        town: f.town || undefined, property_type: f.property_type, area: f.area ? Number(f.area) : undefined,
        gdpr_consent: true, marketing_consent: marketing,
      });
      setResult(r); setState('done');
    } catch (e2) { setErr((e2 as Error).message || 'Could not submit'); setState('error'); }
  };

  if (state === 'done') {
    return (
      <div className="rounded-2xl border bg-card p-6">
        <CheckCircle2 className="mb-2 h-7 w-7 text-emerald-500" />
        <h3 className="font-semibold">Thanks — we’ll be in touch</h3>
        {result?.estimate != null ? (
          <div className="mt-2">
            <p className="text-sm text-muted-foreground">Indicative estimate for your property:</p>
            <p className="mt-1 text-2xl font-bold text-primary">{money(result.range_low, result.currency)} – {money(result.range_high, result.currency)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Based on {result.comps_count} comparable listing(s). A precise valuation needs an agent visit.</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">One of our agents will prepare a valuation for you and get in touch.</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-transparent p-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Thinking of selling? Get a free valuation</h3>
      </div>
      {!open ? (
        <Button className="mt-3" onClick={() => setOpen(true)}>Value my property</Button>
      ) : (
        <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input required placeholder="Your name" value={f.name} onChange={(e) => set('name', e.target.value)} />
          <Input required type="email" placeholder="Email" value={f.email} onChange={(e) => set('email', e.target.value)} />
          <Input placeholder="Phone (optional)" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input placeholder="Property address" value={f.address} onChange={(e) => set('address', e.target.value)} />
          <Input placeholder="Town / Area" value={f.town} onChange={(e) => set('town', e.target.value)} />
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.property_type} onChange={(e) => set('property_type', e.target.value)}>
            {['residential', 'commercial', 'land'].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <Input type="number" placeholder="Area (m²)" value={f.area} onChange={(e) => set('area', e.target.value)} />
          <label className="col-span-full flex items-start gap-2 text-xs text-muted-foreground">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5"  />
            I consent to being contacted about the valuation of my property.
          </label>
          <label className="col-span-full flex items-start gap-2 text-xs text-muted-foreground">
            <Checkbox checked={marketing} onCheckedChange={(v) => setMarketing(v === true)} className="mt-0.5" />
            Optional — send me market updates and properties that may interest me. Unsubscribe at any time.
          </label>
          {err && <p className="col-span-full text-xs text-destructive">{err}</p>}
          <Button type="submit" className="col-span-full" disabled={state === 'sending'}>
            {state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Get my estimate'}
          </Button>
        </form>
      )}
    </div>
  );
};
