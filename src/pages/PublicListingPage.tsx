import React, { useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { useParams } from 'react-router-dom';
import { Building2, MapPin, BedDouble, Bath, Ruler, Zap, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { realEstatePublic, type PublicListing } from '@/modules/real-estate/services/realEstateService';

// Public `/p/:token` listing page (anonymous). All content comes from the token-gated
// real-estate-public edge fn's toPublic() projection; rendered via JSX only (no HTML-string assembly).
const money = (n: number | null, ccy: string) => formatMoney(n, ccy || 'EUR', { decimals: 0, fallback: 'Price on request' });

export default function PublicListingPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    realEstatePublic.getListing(token).then(setData).catch((e) => setError((e as Error).message || 'Listing not found'));
  }, [token]);

  if (error) return <Centered><Building2 className="mb-3 h-10 w-10 text-muted-foreground" /><p className="text-sm text-muted-foreground">{error}</p></Centered>;
  if (!data) return <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered>;

  const l = data.listing;
  const desc = l.description_i18n?.en || l.description_i18n?.el || '';
  const photos = data.photos.filter((p) => p.url);
  const cover = photos[active] ?? photos[0];
  const location = [l.town, l.region, l.prefecture, l.country_code].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <div className="mb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="text-2xl font-semibold">{l.title || 'Property listing'}</h1>
            <div className="text-2xl font-semibold text-primary">{money(l.price, l.currency)}{l.price_period ? <span className="text-sm text-muted-foreground">/{l.price_period}</span> : null}</div>
          </div>
          {location && <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {location}</p>}
        </div>

        {cover && (
          <div className="mb-6">
            <img src={cover.url!} alt={cover.caption ?? ''} className="aspect-[16/9] w-full rounded-xl object-cover" />
            {photos.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {photos.map((p, i) => (
                  <button key={p.id} onClick={() => setActive(i)} aria-label={`Show photo ${i + 1} of ${photos.length}`} className={`h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 ${i === active ? 'border-primary' : 'border-transparent'}`}>
                    <img src={p.url!} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-6 md:col-span-2">
            <div className="flex flex-wrap gap-4 rounded-xl border p-4 text-sm">
              <Fact icon={<BedDouble className="h-4 w-4" />} label="Beds" value={l.bedrooms} />
              <Fact icon={<Bath className="h-4 w-4" />} label="Baths" value={l.bathrooms} />
              <Fact icon={<Ruler className="h-4 w-4" />} label="Built m²" value={l.area_built ?? l.plot_area} />
              <Fact icon={<Zap className="h-4 w-4" />} label="Energy" value={l.energy_class} />
              <Fact label="Type" value={l.property_type} />
              <Fact label="For" value={String(l.transaction_type || '').replace('_', ' ')} />
            </div>

            {desc && <div><h2 className="mb-2 font-semibold">Description</h2><p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{desc}</p></div>}

            {Array.isArray(l.features) && l.features.length > 0 && (
              <div><h2 className="mb-2 font-semibold">Features</h2>
                <div className="flex flex-wrap gap-2">{l.features.map((f: string) => <span key={f} className="rounded-full bg-muted px-3 py-1 text-xs">{f}</span>)}</div>
              </div>
            )}
          </div>

          <div className="md:col-span-1"><InquiryForm token={token} /></div>
        </div>
      </div>
    </div>
  );
}

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">{children}</div>
);
const Fact: React.FC<{ icon?: React.ReactNode; label: string; value: any }> = ({ icon, label, value }) =>
  value == null || value === '' ? null : (
    <div className="flex items-center gap-1.5"><span className="text-muted-foreground">{icon}</span><span className="font-medium capitalize">{value}</span><span className="text-xs text-muted-foreground">{label}</span></div>
  );

const InquiryForm: React.FC<{ token: string }> = ({ token }) => {
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '' });
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) { setErr('Please accept the privacy consent.'); return; }
    setState('sending'); setErr('');
    try { await realEstatePublic.inquire(token, { ...f, gdpr_consent: true }); setState('sent'); }
    catch (e2) { setErr((e2 as Error).message || 'Could not send'); setState('error'); }
  };

  if (state === 'sent') return (
    <div className="rounded-xl border bg-emerald-500/5 p-6 text-center">
      <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
      <p className="text-sm font-medium">Thanks — your enquiry has been sent.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">Enquire about this property</h2>
      <Input required placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Input required type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <Input placeholder="Phone (optional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <Textarea rows={3} placeholder="Message" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5"  />
        I consent to my details being used to respond to this enquiry.
      </label>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button type="submit" className="w-full rounded-full" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send enquiry'}</Button>
    </form>
  );
};
