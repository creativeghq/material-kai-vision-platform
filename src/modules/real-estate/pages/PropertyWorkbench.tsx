import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, ArrowLeft, Save, Globe, EyeOff, Upload, Star, Trash2, Copy, ExternalLink, Sparkles, FileText, UserPlus } from 'lucide-react';
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
  // commercial / business
  'gross_area', 'net_area', 'frontage', 'ceiling_height', 'floors_included', 'wc_count', 'storefront_windows',
  'loading_dock', 'goods_lift', 'three_phase_power', 'power_capacity_kva', 'fire_safety_cert', 'accessibility_amea',
  'current_use', 'permitted_use', 'operating_license', 'occupancy_status', 'current_rent', 'cap_rate', 'lease_expiry', 'remaining_lease_term',
  'key_money', 'business_type', 'annual_turnover', 'staff_count', 'inventory_included', 'reason_for_sale',
  // land / plot
  'plot_area', 'buildable', 'building_coefficient', 'coverage_ratio', 'max_building_height', 'allowed_floors',
  'inside_city_plan', 'within_settlement', 'frontage_to_road', 'road_access', 'slope', 'corner_plot',
  'distance_to_sea', 'existing_structures', 'utilities_available', 'legal_clearances',
  // short-let
  'max_guests', 'bed_config', 'min_stay_nights', 'check_in_time', 'check_out_time', 'cleaning_fee', 'deposit',
  'instant_book', 'cancellation_policy', 'house_rules', 'smoking_allowed', 'events_allowed',
  'features', 'amenities', 'description_i18n',
] as const;

// Comma-separated text[] fields (split on save, joined on load).
const ARRAY_FIELDS = new Set(['features', 'amenities', 'utilities_available', 'legal_clearances']);

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
      for (const k of FORM_FIELDS) f[k] = ARRAY_FIELDS.has(k) ? (r.property[k] ?? []).join(', ') : r.property[k];
      f.description_en = r.property.description_i18n?.en ?? '';
      f.description_el = r.property.description_i18n?.el ?? '';
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
        if (ARRAY_FIELDS.has(k)) { payload[k] = String(form[k] ?? '').split(',').map((s) => s.trim()).filter(Boolean); continue; }
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
  const cat = form.property_type;
  const isResidential = cat === 'residential' || cat === 'other';
  const isCommercial = cat === 'commercial';
  const isLand = cat === 'land';
  const isShortLet = form.transaction_type === 'short_let';
  const isBusinessSale = form.transaction_type === 'business_transfer';
  const publicUrl = property.public_listing_token ? `${window.location.origin}/p/${property.public_listing_token}` : null;

  return (
    <div className="min-h-screen">
      <PageHeader icon={Building2} title={property.title || 'Untitled listing'} subtitle={property.reference_code ? `#${property.reference_code}` : 'Listing workbench'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate('/properties')}><ArrowLeft className="mr-1 h-4 w-4" /> Portfolio</Button>
            <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={async () => {
              setBusy(true);
              try { const r = await realEstateService.generateBrochure(id); if (r.pdf_url) window.open(r.pdf_url, '_blank'); toast({ title: 'Brochure ready', description: `${r.page_count} page(s)` }); }
              catch (e) { toast({ title: 'Brochure failed', description: (e as Error).message, variant: 'destructive' }); }
              finally { setBusy(false); }
            }}><FileText className="mr-1 h-4 w-4" /> Brochure</Button>
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
            {!property.is_public && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">To publish{isGRbuilding ? ' in Greece' : ''}:</span>{' '}
                title/description + price{isShortLet ? ', short-let licence (ΑΜΑ)' : isLand ? ', land use / zoning' : ', energy class + Electronic Building ID'}
                {isGRbuilding ? ' are required.' : ' are recommended.'}
              </div>
            )}
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

            {isResidential && (
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
            )}

            {isCommercial && (
              <FormSection title="Commercial / business">
                <F label="Gross area (m²)"><NumInput v={form.gross_area} on={(x) => set('gross_area', x)} /></F>
                <F label="Net / usable area (m²)"><NumInput v={form.net_area} on={(x) => set('net_area', x)} /></F>
                <F label="Frontage / πρόσοψη (m)"><NumInput v={form.frontage} on={(x) => set('frontage', x)} /></F>
                <F label="Ceiling height / καθαρό ύψος (m)"><NumInput v={form.ceiling_height} on={(x) => set('ceiling_height', x)} /></F>
                <F label="Floors included"><NumInput v={form.floors_included} on={(x) => set('floors_included', x)} /></F>
                <F label="WC count"><NumInput v={form.wc_count} on={(x) => set('wc_count', x)} /></F>
                <F label="Permitted use / χρήση γης"><Input value={form.permitted_use ?? ''} onChange={(e) => set('permitted_use', e.target.value)} /></F>
                <F label="Current use"><Input value={form.current_use ?? ''} onChange={(e) => set('current_use', e.target.value)} /></F>
                <F label="Operating licence"><Input value={form.operating_license ?? ''} onChange={(e) => set('operating_license', e.target.value)} /></F>
                <F label="Power capacity (kVA)"><NumInput v={form.power_capacity_kva} on={(x) => set('power_capacity_kva', x)} /></F>
                <Chk label="Three-phase power (τριφασικό)" checked={!!form.three_phase_power} onChange={(v) => set('three_phase_power', v)} />
                <Chk label="Storefront windows (βιτρίνα)" checked={!!form.storefront_windows} onChange={(v) => set('storefront_windows', v)} />
                <Chk label="Loading dock" checked={!!form.loading_dock} onChange={(v) => set('loading_dock', v)} />
                <Chk label="Goods lift" checked={!!form.goods_lift} onChange={(v) => set('goods_lift', v)} />
                <Chk label="Fire-safety cert" checked={!!form.fire_safety_cert} onChange={(v) => set('fire_safety_cert', v)} />
                <Chk label="Accessibility (ΑμεΑ)" checked={!!form.accessibility_amea} onChange={(v) => set('accessibility_amea', v)} />
                <F label="Occupancy status"><Input value={form.occupancy_status ?? ''} onChange={(e) => set('occupancy_status', e.target.value)} placeholder="vacant / tenanted" /></F>
                <F label="Current rent"><NumInput v={form.current_rent} on={(x) => set('current_rent', x)} /></F>
                <F label="Yield / cap rate (%)"><NumInput v={form.cap_rate} on={(x) => set('cap_rate', x)} /></F>
                <F label="Lease expiry"><Input type="date" value={form.lease_expiry ?? ''} onChange={(e) => set('lease_expiry', e.target.value)} /></F>
              </FormSection>
            )}

            {isBusinessSale && (
              <FormSection title="Business for sale (going concern)">
                <F label="Key money / αέρας"><NumInput v={form.key_money} on={(x) => set('key_money', x)} /></F>
                <F label="Business type"><Input value={form.business_type ?? ''} onChange={(e) => set('business_type', e.target.value)} /></F>
                <F label="Annual turnover"><NumInput v={form.annual_turnover} on={(x) => set('annual_turnover', x)} /></F>
                <F label="Staff count"><NumInput v={form.staff_count} on={(x) => set('staff_count', x)} /></F>
                <Chk label="Inventory included" checked={!!form.inventory_included} onChange={(v) => set('inventory_included', v)} />
                <F label="Reason for sale" wide><Input value={form.reason_for_sale ?? ''} onChange={(e) => set('reason_for_sale', e.target.value)} /></F>
              </FormSection>
            )}

            {isLand && (
              <FormSection title="Land / plot">
                <F label="Plot area (m²)"><NumInput v={form.plot_area} on={(x) => set('plot_area', x)} /></F>
                <F label="Building coefficient (ΣΔ)"><NumInput v={form.building_coefficient} on={(x) => set('building_coefficient', x)} /></F>
                <F label="Coverage ratio (Συντ. κάλυψης)"><NumInput v={form.coverage_ratio} on={(x) => set('coverage_ratio', x)} /></F>
                <F label="Max building height (m)"><NumInput v={form.max_building_height} on={(x) => set('max_building_height', x)} /></F>
                <F label="Allowed floors"><NumInput v={form.allowed_floors} on={(x) => set('allowed_floors', x)} /></F>
                <F label="Land use / zoning"><Input value={form.land_use ?? ''} onChange={(e) => set('land_use', e.target.value)} /></F>
                <F label="Road frontage (m)"><NumInput v={form.frontage_to_road} on={(x) => set('frontage_to_road', x)} /></F>
                <F label="Distance to sea (m)"><NumInput v={form.distance_to_sea} on={(x) => set('distance_to_sea', x)} /></F>
                <F label="Slope / terrain"><Input value={form.slope ?? ''} onChange={(e) => set('slope', e.target.value)} /></F>
                <Chk label="Buildable (άρτιο & οικοδομήσιμο)" checked={!!form.buildable} onChange={(v) => set('buildable', v)} />
                <Chk label="Inside city plan (εντός σχεδίου)" checked={!!form.inside_city_plan} onChange={(v) => set('inside_city_plan', v)} />
                <Chk label="Within settlement (εντός οικισμού)" checked={!!form.within_settlement} onChange={(v) => set('within_settlement', v)} />
                <Chk label="Road access" checked={!!form.road_access} onChange={(v) => set('road_access', v)} />
                <Chk label="Corner plot" checked={!!form.corner_plot} onChange={(v) => set('corner_plot', v)} />
                <F label="Utilities available (comma)" wide><Input value={form.utilities_available ?? ''} onChange={(e) => set('utilities_available', e.target.value)} placeholder="water, electricity, sewage, gas" /></F>
                <F label="Legal clearances (comma)" wide><Input value={form.legal_clearances ?? ''} onChange={(e) => set('legal_clearances', e.target.value)} placeholder="topographic, forestry, archaeological" /></F>
                <F label="Existing structures" wide><Input value={form.existing_structures ?? ''} onChange={(e) => set('existing_structures', e.target.value)} /></F>
              </FormSection>
            )}

            {isShortLet && (
              <FormSection title="Short-let">
                <F label="Licence (ΑΜΑ)"><Input value={form.short_term_rental_license ?? ''} onChange={(e) => set('short_term_rental_license', e.target.value)} /></F>
                <F label="Max guests"><NumInput v={form.max_guests} on={(x) => set('max_guests', x)} /></F>
                <F label="Bed config"><Input value={form.bed_config ?? ''} onChange={(e) => set('bed_config', e.target.value)} placeholder="1 double, 2 single" /></F>
                <F label="Min stay (nights)"><NumInput v={form.min_stay_nights} on={(x) => set('min_stay_nights', x)} /></F>
                <F label="Check-in time"><Input value={form.check_in_time ?? ''} onChange={(e) => set('check_in_time', e.target.value)} placeholder="15:00" /></F>
                <F label="Check-out time"><Input value={form.check_out_time ?? ''} onChange={(e) => set('check_out_time', e.target.value)} placeholder="11:00" /></F>
                <F label="Cleaning fee"><NumInput v={form.cleaning_fee} on={(x) => set('cleaning_fee', x)} /></F>
                <F label="Deposit"><NumInput v={form.deposit} on={(x) => set('deposit', x)} /></F>
                <F label="Cancellation policy"><Input value={form.cancellation_policy ?? ''} onChange={(e) => set('cancellation_policy', e.target.value)} /></F>
                <Chk label="Instant book" checked={!!form.instant_book} onChange={(v) => set('instant_book', v)} />
                <Chk label="Smoking allowed" checked={!!form.smoking_allowed} onChange={(v) => set('smoking_allowed', v)} />
                <Chk label="Events allowed" checked={!!form.events_allowed} onChange={(v) => set('events_allowed', v)} />
                <F label="House rules" wide><Textarea rows={2} value={form.house_rules ?? ''} onChange={(e) => set('house_rules', e.target.value)} /></F>
              </FormSection>
            )}

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
            <div className="mb-4 flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onUpload} />
              {canManage && <Button variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="mr-2 h-4 w-4" /> Upload photos</Button>}
              {canManage && photos.length > 0 && (
                <Button variant="outline" className="rounded-full" disabled={busy} onClick={async () => {
                  if (!ws) return;
                  setBusy(true);
                  try { const r = await realEstateService.analyzePhotos(ws, id); await load(); toast({ title: 'Photos analyzed', description: `Tagged ${r.tagged}, cover auto-picked · ${r.credits} credit(s)` }); }
                  catch (e) { toast({ title: 'Analysis failed', description: (e as Error).message, variant: 'destructive' }); }
                  finally { setBusy(false); }
                }}><Sparkles className="mr-2 h-4 w-4" /> AI tag &amp; pick cover</Button>
              )}
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
                    <div className="flex shrink-0 items-center gap-2">
                      {!q.crm_contact_id && canManage && (
                        <Button variant="outline" size="sm" className="rounded-full text-xs" disabled={busy} onClick={async () => {
                          setBusy(true);
                          try { await realEstateService.convertInquiry(ws!, q.id); await load(); toast({ title: 'Converted to CRM lead' }); }
                          catch (e) { toast({ title: 'Convert failed', description: (e as Error).message, variant: 'destructive' }); }
                          finally { setBusy(false); }
                        }}><UserPlus className="mr-1 h-3.5 w-3.5" /> To lead</Button>
                      )}
                      <select className="rounded-md border bg-background px-2 py-1 text-xs" value={q.status}
                        onChange={async (e) => { const upd = await realEstateService.updateInquiry(ws!, q.id, e.target.value); setInquiries((prev) => prev.map((x) => x.id === q.id ? upd : x)); }}>
                        {['new', 'contacted', 'qualified', 'viewing_booked', 'closed', 'spam'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
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
// Numeric input that emits number | '' (so a cleared field saves as null).
const NumInput: React.FC<{ v: any; on: (x: number | '') => void }> = ({ v, on }) => (
  <Input type="number" value={v ?? ''} onChange={(e) => on(e.target.value === '' ? '' : Number(e.target.value))} />
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
