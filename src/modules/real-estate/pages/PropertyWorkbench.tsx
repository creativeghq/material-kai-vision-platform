import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, ArrowLeft, Save, Globe, EyeOff, Upload, Star, Trash2, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import {
  realEstateService, isPublishBlocked,
  type Property, type PropertyPhoto, type PropertyInquiry, type PropertyViewing,
} from '../services/realEstateService';

const PROPERTY_TYPES = ['residential', 'commercial', 'land', 'other'];
const TRANSACTION_TYPES = ['sale', 'rent', 'short_let', 'business_transfer', 'auction'];
const LISTING_STATUSES = ['draft', 'active', 'under_offer', 'sold', 'rented', 'withdrawn', 'archived'];
const ENERGY_CLASSES = ['A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Fields the Overview form binds (a pragmatic core of the §3 catalog; category-specific editors expand later).
const FORM_FIELDS = [
  'title', 'reference_code', 'property_type', 'subtype', 'transaction_type', 'listing_status',
  'price', 'currency', 'price_period', 'price_on_request', 'common_charges',
  'country_code', 'region', 'prefecture', 'municipality', 'town', 'postcode', 'address', 'street_number', 'hide_exact_address', 'lat', 'lng',
  'energy_class', 'electronic_building_id', 'atak', 'heating_type', 'short_term_rental_license', 'land_use',
  'bedrooms', 'bathrooms', 'wc', 'area_built', 'area_plot', 'floor', 'floors_total', 'year_built', 'parking_spaces', 'furnished',
  'features', 'amenities', 'description_i18n',
] as const;

export default function PropertyWorkbench() {
  const { id = '' } = useParams();
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { can } = usePermissions();
  const { toast } = useToast();
  const navigate = useNavigate();
  const canManage = can('realestate.listings.manage');

  const [property, setProperty] = useState<Property | null>(null);
  const [photos, setPhotos] = useState<PropertyPhoto[]>([]);
  const [inquiries, setInquiries] = useState<PropertyInquiry[]>([]);
  const [viewings, setViewings] = useState<PropertyViewing[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newViewingAt, setNewViewingAt] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const ws = activeWorkspaceId;

  const load = useCallback(async () => {
    if (!ws || !id) return;
    try {
      const r = await realEstateService.getProperty(ws, id);
      setProperty(r.property); setPhotos(r.photos); setInquiries(r.inquiries); setViewings(r.viewings);
      const f: Record<string, any> = {};
      for (const k of FORM_FIELDS) f[k] = r.property[k];
      f.description_en = r.property.description_i18n?.en ?? '';
      f.description_el = r.property.description_i18n?.el ?? '';
      f.features = (r.property.features ?? []).join(', ');
      f.amenities = (r.property.amenities ?? []).join(', ');
      setForm(f);
    } catch (e) { toast({ title: 'Failed to load listing', description: (e as Error).message, variant: 'destructive' }); }
  }, [ws, id, toast]);

  useEffect(() => { void load(); }, [load]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!ws) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const k of FORM_FIELDS) {
        if (k === 'description_i18n') continue;
        if (k === 'features' || k === 'amenities') { payload[k] = String(form[k] ?? '').split(',').map((s) => s.trim()).filter(Boolean); continue; }
        payload[k] = form[k] === '' ? null : form[k];
      }
      payload.description_i18n = { en: form.description_en || undefined, el: form.description_el || undefined };
      const updated = await realEstateService.updateProperty(ws, id, payload);
      setProperty(updated);
      toast({ title: 'Saved' });
    } catch (e) { toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    if (!ws) return;
    setBusy(true);
    try {
      const { property: p, warnings } = await realEstateService.publishProperty(ws, id);
      setProperty(p);
      toast({ title: 'Published', description: warnings.length ? `Warnings: ${warnings.join(', ')}` : 'Listing is now live.' });
    } catch (e) {
      if (isPublishBlocked(e)) toast({ title: 'Cannot publish yet', description: `Missing: ${e.errors.join(', ')}`, variant: 'destructive' });
      else toast({ title: 'Publish failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const unpublish = async () => {
    if (!ws) return;
    setBusy(true);
    try { setProperty(await realEstateService.unpublishProperty(ws, id)); toast({ title: 'Unpublished' }); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); if (!ws || !files.length) return;
    setBusy(true);
    try { for (const f of files) await realEstateService.uploadPhoto(ws, id, f); await load(); toast({ title: `Added ${files.length} photo(s)` }); }
    catch (err) { toast({ title: 'Upload failed', description: (err as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const copyPublicLink = () => {
    const url = `${window.location.origin}/p/${property?.public_listing_token}`;
    void navigator.clipboard.writeText(url); toast({ title: 'Public link copied' });
  };

  if (wsLoading || !property) return <div className="p-6 space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;

  const isGRbuilding = ['EL', 'GR'].includes(String(form.country_code ?? '').toUpperCase());
  const publicUrl = property.public_listing_token ? `${window.location.origin}/p/${property.public_listing_token}` : null;

  return (
    <div className="min-h-screen">
      <PageHeader icon={Building2} title={property.title || 'Untitled listing'} subtitle={property.reference_code ? `#${property.reference_code}` : 'Listing workbench'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate('/properties')}><ArrowLeft className="mr-1 h-4 w-4" /> Portfolio</Button>
            {canManage && (property.is_public
              ? <Button variant="outline" size="sm" className="rounded-full" onClick={unpublish} disabled={busy}><EyeOff className="mr-1 h-4 w-4" /> Unpublish</Button>
              : <Button size="sm" className="rounded-full" onClick={publish} disabled={busy}><Globe className="mr-1 h-4 w-4" /> Publish</Button>)}
            {canManage && <Button size="sm" className="rounded-full" onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" /> {saving ? 'Saving…' : 'Save'}</Button>}
          </div>
        } />

      <div className="p-3 sm:p-6">
        {publicUrl && property.is_public && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-sm">
            <Globe className="h-4 w-4 text-emerald-500" /> <span className="text-muted-foreground">Live at</span>
            <code className="truncate text-xs">{publicUrl}</code>
            <Button variant="ghost" size="sm" className="ml-auto rounded-full" onClick={copyPublicLink}><Copy className="mr-1 h-3.5 w-3.5" /> Copy</Button>
            <a href={publicUrl} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm" className="rounded-full"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Open</Button></a>
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList className="mb-4 bg-muted">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="media">Media {photos.length > 0 && <Badge className="ml-1 rounded-full border-0 bg-primary/15 text-[10px]">{photos.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="inquiries">Leads {inquiries.length > 0 && <Badge className="ml-1 rounded-full border-0 bg-primary/15 text-[10px]">{inquiries.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="viewings">Viewings {viewings.length > 0 && <Badge className="ml-1 rounded-full border-0 bg-primary/15 text-[10px]">{viewings.length}</Badge>}</TabsTrigger>
          </TabsList>

          {/* ── Overview / edit form ── */}
          <TabsContent value="overview" className="space-y-6">
            <FormSection title="Classification">
              <F label="Title"><Input value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} /></F>
              <F label="Reference code"><Input value={form.reference_code ?? ''} onChange={(e) => set('reference_code', e.target.value)} /></F>
              <F label="Category"><Sel value={form.property_type} opts={PROPERTY_TYPES} onChange={(v) => set('property_type', v)} /></F>
              <F label="Subtype"><Input value={form.subtype ?? ''} onChange={(e) => set('subtype', e.target.value)} placeholder="apartment, warehouse, plot…" /></F>
              <F label="Transaction"><Sel value={form.transaction_type} opts={TRANSACTION_TYPES} onChange={(v) => set('transaction_type', v)} /></F>
              <F label="Status"><Sel value={form.listing_status} opts={LISTING_STATUSES} onChange={(v) => set('listing_status', v)} /></F>
            </FormSection>

            <FormSection title="Pricing">
              <F label="Price"><Input type="number" value={form.price ?? ''} onChange={(e) => set('price', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <F label="Currency"><Input value={form.currency ?? 'EUR'} onChange={(e) => set('currency', e.target.value)} /></F>
              <F label="Period (rent)"><Input value={form.price_period ?? ''} onChange={(e) => set('price_period', e.target.value)} placeholder="month, year…" /></F>
              <F label="Common charges"><Input type="number" value={form.common_charges ?? ''} onChange={(e) => set('common_charges', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <Chk label="Price on request" checked={!!form.price_on_request} onChange={(v) => set('price_on_request', v)} />
            </FormSection>

            <FormSection title="Location">
              <F label="Country code"><Input value={form.country_code ?? ''} onChange={(e) => set('country_code', e.target.value.toUpperCase())} placeholder="EL, GR, ES…" /></F>
              <F label="Region"><Input value={form.region ?? ''} onChange={(e) => set('region', e.target.value)} /></F>
              <F label="Prefecture (Νομός)"><Input value={form.prefecture ?? ''} onChange={(e) => set('prefecture', e.target.value)} /></F>
              <F label="Municipality (Δήμος)"><Input value={form.municipality ?? ''} onChange={(e) => set('municipality', e.target.value)} /></F>
              <F label="Town"><Input value={form.town ?? ''} onChange={(e) => set('town', e.target.value)} /></F>
              <F label="Postcode"><Input value={form.postcode ?? ''} onChange={(e) => set('postcode', e.target.value)} /></F>
              <F label="Address"><Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></F>
              <F label="Street number"><Input value={form.street_number ?? ''} onChange={(e) => set('street_number', e.target.value)} /></F>
              <F label="Latitude"><Input type="number" value={form.lat ?? ''} onChange={(e) => set('lat', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <F label="Longitude"><Input type="number" value={form.lng ?? ''} onChange={(e) => set('lng', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <Chk label="Hide exact address publicly" checked={!!form.hide_exact_address} onChange={(v) => set('hide_exact_address', v)} />
            </FormSection>

            <FormSection title="Energy & compliance">
              <F label="Energy class"><Sel value={form.energy_class ?? ''} opts={['', ...ENERGY_CLASSES]} onChange={(v) => set('energy_class', v)} /></F>
              <F label={`Electronic Building ID${isGRbuilding ? ' *' : ''}`}><Input value={form.electronic_building_id ?? ''} onChange={(e) => set('electronic_building_id', e.target.value)} /></F>
              <F label="ΑΤΑΚ (tax id, internal)"><Input value={form.atak ?? ''} onChange={(e) => set('atak', e.target.value)} /></F>
              <F label="Heating type"><Input value={form.heating_type ?? ''} onChange={(e) => set('heating_type', e.target.value)} /></F>
              {form.transaction_type === 'short_let' && <F label="Short-let licence (ΑΜΑ)"><Input value={form.short_term_rental_license ?? ''} onChange={(e) => set('short_term_rental_license', e.target.value)} /></F>}
              {form.property_type === 'land' && <F label="Land use / zoning"><Input value={form.land_use ?? ''} onChange={(e) => set('land_use', e.target.value)} /></F>}
            </FormSection>

            <FormSection title="Physical">
              <F label="Bedrooms"><Input type="number" value={form.bedrooms ?? ''} onChange={(e) => set('bedrooms', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <F label="Bathrooms"><Input type="number" value={form.bathrooms ?? ''} onChange={(e) => set('bathrooms', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <F label="WC"><Input type="number" value={form.wc ?? ''} onChange={(e) => set('wc', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <F label="Built area (m²)"><Input type="number" value={form.area_built ?? ''} onChange={(e) => set('area_built', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <F label="Plot area (m²)"><Input type="number" value={form.area_plot ?? ''} onChange={(e) => set('area_plot', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <F label="Floor"><Input value={form.floor ?? ''} onChange={(e) => set('floor', e.target.value)} /></F>
              <F label="Floors total"><Input type="number" value={form.floors_total ?? ''} onChange={(e) => set('floors_total', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <F label="Year built"><Input type="number" value={form.year_built ?? ''} onChange={(e) => set('year_built', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <F label="Parking spaces"><Input type="number" value={form.parking_spaces ?? ''} onChange={(e) => set('parking_spaces', e.target.value === '' ? '' : Number(e.target.value))} /></F>
              <F label="Furnished"><Input value={form.furnished ?? ''} onChange={(e) => set('furnished', e.target.value)} placeholder="yes / no / partial" /></F>
            </FormSection>

            <FormSection title="Content">
              {canManage && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={async () => {
                    if (!ws) return;
                    setBusy(true);
                    try {
                      // Save current edits first so the AI sees the latest facts, then generate.
                      const copy = await realEstateService.draftDescription(ws, id);
                      setForm((p) => ({ ...p, title: p.title || copy.title, description_en: copy.description_en, description_el: copy.description_el }));
                      toast({ title: 'Draft generated', description: `${copy.credits} credit(s) used — review, then Save.` });
                    } catch (e) { toast({ title: 'Generation failed', description: (e as Error).message, variant: 'destructive' }); }
                    finally { setBusy(false); }
                  }}><Sparkles className="mr-1.5 h-4 w-4" /> Generate description with AI</Button>
                  <p className="mt-1 text-[11px] text-muted-foreground">Uses the listing’s facts. Review before saving — you’re responsible for the published copy.</p>
                </div>
              )}
              <F label="Description (EN)" wide><Textarea rows={4} value={form.description_en ?? ''} onChange={(e) => set('description_en', e.target.value)} /></F>
              <F label="Description (EL)" wide><Textarea rows={4} value={form.description_el ?? ''} onChange={(e) => set('description_el', e.target.value)} /></F>
              <F label="Features (comma-separated)" wide><Input value={form.features ?? ''} onChange={(e) => set('features', e.target.value)} /></F>
              <F label="Amenities (comma-separated)" wide><Input value={form.amenities ?? ''} onChange={(e) => set('amenities', e.target.value)} /></F>
            </FormSection>
          </TabsContent>

          {/* ── Media ── */}
          <TabsContent value="media">
            <div className="mb-4">
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onUpload} />
              {canManage && <Button variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="mr-2 h-4 w-4" /> Upload photos</Button>}
            </div>
            {photos.length === 0 ? (
              <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No photos yet.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((ph) => (
                  <PhotoCard key={ph.id} photo={ph} ws={ws!} canManage={canManage}
                    onCover={async () => { await realEstateService.setCover(ws!, id, ph.id); await load(); }}
                    onDelete={async () => { await realEstateService.deletePhoto(ws!, ph.id); await load(); }} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Leads / inquiries ── */}
          <TabsContent value="inquiries">
            {inquiries.length === 0 ? <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No inquiries yet.</div> : (
              <Card><CardContent className="p-0"><div className="divide-y divide-border">
                {inquiries.map((q) => (
                  <div key={q.id} className="flex items-start gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{q.name || 'Anonymous'} <span className="text-xs text-muted-foreground">{q.email}</span></div>
                      {q.message && <div className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{q.message}</div>}
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{new Date(q.created_at).toLocaleString()}</div>
                    </div>
                    <select className="rounded-md border bg-background px-2 py-1 text-xs" value={q.status}
                      onChange={async (e) => { const upd = await realEstateService.updateInquiry(ws!, q.id, e.target.value); setInquiries((prev) => prev.map((x) => x.id === q.id ? upd : x)); }}>
                      {['new', 'contacted', 'qualified', 'viewing_booked', 'closed', 'spam'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
              </div></CardContent></Card>
            )}
          </TabsContent>

          {/* ── Viewings ── */}
          <TabsContent value="viewings" className="space-y-4">
            {canManage && (
              <div className="flex flex-wrap items-end gap-2">
                <input type="datetime-local" value={newViewingAt} onChange={(e) => setNewViewingAt(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
                <Button size="sm" className="rounded-full" disabled={!newViewingAt || busy} onClick={async () => {
                  if (!ws || !newViewingAt) return;
                  setBusy(true);
                  try { await realEstateService.createViewing(ws, { property_id: id, scheduled_at: new Date(newViewingAt).toISOString() }); setNewViewingAt(''); await load(); toast({ title: 'Viewing scheduled' }); }
                  catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
                  finally { setBusy(false); }
                }}>Schedule viewing</Button>
              </div>
            )}
            {viewings.length === 0 ? <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No viewings scheduled.</div> : (
              <Card><CardContent className="p-0"><div className="divide-y divide-border">
                {viewings.map((v) => (
                  <div key={v.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                    <div className="flex-1">{new Date(v.scheduled_at).toLocaleString()} · <span className="capitalize text-muted-foreground">{v.type.replace('_', ' ')}</span></div>
                    {canManage && (
                      <select className="rounded-md border bg-background px-2 py-1 text-xs" value={v.status}
                        onChange={async (e) => { const upd = await realEstateService.updateViewing(ws!, v.id, { status: e.target.value }); setViewings((prev) => prev.map((x) => x.id === v.id ? upd : x)); }}>
                        {['scheduled', 'completed', 'cancelled', 'no_show'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div></CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── small form primitives ──
const FormSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card><CardContent className="p-4">
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  </CardContent></Card>
);
const F: React.FC<{ label: string; wide?: boolean; children: React.ReactNode }> = ({ label, wide, children }) => (
  <div className={wide ? 'sm:col-span-2 lg:col-span-3' : ''}><Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>{children}</div>
);
const Sel: React.FC<{ value: any; opts: string[]; onChange: (v: string) => void }> = ({ value, opts, onChange }) => (
  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
    {opts.map((o) => <option key={o} value={o}>{o === '' ? '—' : o.replace('_', ' ')}</option>)}
  </select>
);
const Chk: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label>
);

const PhotoCard: React.FC<{ photo: PropertyPhoto; ws: string; canManage: boolean; onCover: () => void; onDelete: () => void }> = ({ photo, canManage, onCover, onDelete }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('@/integrations/supabase/client').then(({ supabase }) =>
      supabase.storage.from('property-media').createSignedUrl(photo.storage_path, 3600).then(({ data }) => { if (alive) setUrl(data?.signedUrl ?? null); }));
    return () => { alive = false; };
  }, [photo.storage_path]);
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-muted">
      <div className="aspect-[4/3] w-full">{url ? <img src={url} alt={photo.caption ?? ''} className="h-full w-full object-cover" /> : <Skeleton className="h-full w-full" />}</div>
      {photo.is_cover && <Badge className="absolute left-2 top-2 rounded-full border-0 bg-emerald-500 text-[10px] text-white">Cover</Badge>}
      {canManage && (
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          {!photo.is_cover && <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:bg-white/20" onClick={onCover} title="Set as cover"><Star className="h-3.5 w-3.5" /></Button>}
          <Button size="icon" variant="ghost" className="h-7 w-7 text-white hover:bg-white/20" onClick={onDelete} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );
};
