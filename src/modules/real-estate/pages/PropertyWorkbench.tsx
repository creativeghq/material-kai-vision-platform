import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Building2, ArrowLeft, Save, Globe, EyeOff, Upload, Star, Trash2, Copy, ExternalLink, Sparkles,
  FileText, UserPlus, Home, Tag, MapPin, Ruler, ListChecks, Zap, Loader2, ChevronLeft, ChevronRight,
  Contact, CalendarClock, Image as ImageIcon,
} from 'lucide-react';
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
import { Checkbox } from '@/components/core/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import {
  realEstateService, isPublishBlocked,
  type Property, type PropertyPhoto, type PropertyInquiry, type PropertyViewing,
} from '../services/realEstateService';

const PROPERTY_TYPES = ['residential', 'commercial', 'land', 'other'];
const TRANSACTION_TYPES = ['sale', 'rent', 'short_let', 'business_transfer', 'auction'];
const LISTING_STATUSES = ['draft', 'active', 'under_offer', 'sold', 'rented', 'withdrawn', 'archived'];
const ENERGY_CLASSES = ['A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const CONSTRUCTION = ['', 'new', 'under_construction', 'resale', 'renovated'];

// Amenity boolean fields (Spitogatos-aligned) rendered as a checkbox grid.
const AMENITIES: readonly (readonly [string, string])[] = [
  ['elevator', 'Elevator'], ['storage', 'Storage'], ['fireplace', 'Fireplace'], ['garden', 'Garden'],
  ['pool', 'Pool'], ['has_view', 'View'], ['air_conditioning', 'A/C'], ['underfloor_heating', 'Underfloor heating'],
  ['solar_heater', 'Solar heater'], ['security_door', 'Security door'], ['double_glazing', 'Double glazing'],
  ['screens', 'Screens (σήτες)'], ['awning', 'Awnings (τέντες)'], ['alarm', 'Alarm'], ['night_current', 'Night rate'],
  ['pets_allowed', 'Pets allowed'], ['is_new_development', 'New development'],
];

const FORM_FIELDS = [
  // basics
  'title', 'reference_code', 'property_type', 'subtype', 'transaction_type', 'listing_status',
  // pricing
  'price', 'currency', 'price_period', 'price_on_request', 'common_charges', 'previous_price',
  // location
  'country_code', 'region', 'prefecture', 'municipality', 'town', 'postcode', 'address', 'street_number', 'hide_exact_address', 'lat', 'lng',
  // energy & legal
  'energy_class', 'electronic_building_id', 'atak', 'heating_type', 'heating_medium', 'short_term_rental_license', 'land_use',
  // residential physical
  'bedrooms', 'rooms', 'bathrooms', 'wc', 'kitchens', 'living_rooms', 'area_built', 'area_plot', 'floor', 'floors_total',
  'levels', 'year_built', 'year_renovated', 'condition', 'furnished', 'orientation', 'parking_spaces', 'parking_type', 'balcony_area',
  // amenities
  ...AMENITIES.map(([k]) => k), 'open_parking_spots', 'closed_parking_spots', 'construction_status', 'view_types', 'suitable_for',
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
  // content & agent
  'features', 'amenities', 'description_i18n', 'agent_name', 'agent_phone', 'agent_email', 'agent_website',
] as const;

const ARRAY_FIELDS = new Set(['features', 'amenities', 'utilities_available', 'legal_clearances', 'view_types', 'suitable_for']);

const STEPS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'basics', label: 'Basics', icon: Home },
  { id: 'pricing', label: 'Pricing', icon: Tag },
  { id: 'location', label: 'Location', icon: MapPin },
  { id: 'details', label: 'Details', icon: Ruler },
  { id: 'amenities', label: 'Amenities', icon: ListChecks },
  { id: 'energy', label: 'Energy & legal', icon: Zap },
  { id: 'content', label: 'Content & agent', icon: Contact },
];

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
  const [step, setStep] = useState(0);
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

  // Loading state — header + centered spinner (matches Finance/CRM), never a full-page skeleton block.
  if (wsLoading || !property) {
    return (
      <div className="min-h-screen">
        <PageHeader icon={Building2} title="Listing" subtitle="Loading…" />
        <div className="flex h-[calc(100vh-200px)] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }

  const isGRbuilding = ['EL', 'GR'].includes(String(form.country_code ?? '').toUpperCase());
  const cat = form.property_type;
  const isResidential = cat === 'residential' || cat === 'other';
  const isCommercial = cat === 'commercial';
  const isLand = cat === 'land';
  const isShortLet = form.transaction_type === 'short_let';
  const isBusinessSale = form.transaction_type === 'business_transfer';
  const publicUrl = property.public_listing_token ? `${window.location.origin}/p/${property.public_listing_token}` : null;
  const stepId = STEPS[step].id;

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
            <TabsTrigger value="overview"><Home className="mr-1.5 h-4 w-4" /> Overview</TabsTrigger>
            <TabsTrigger value="media"><ImageIcon className="mr-1.5 h-4 w-4" /> Media {photos.length > 0 && <Badge className="ml-1 rounded-full border-0 bg-primary/15 text-[10px]">{photos.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="inquiries"><Contact className="mr-1.5 h-4 w-4" /> Leads {inquiries.length > 0 && <Badge className="ml-1 rounded-full border-0 bg-primary/15 text-[10px]">{inquiries.length}</Badge>}</TabsTrigger>
            <TabsTrigger value="viewings"><CalendarClock className="mr-1.5 h-4 w-4" /> Viewings {viewings.length > 0 && <Badge className="ml-1 rounded-full border-0 bg-primary/15 text-[10px]">{viewings.length}</Badge>}</TabsTrigger>
          </TabsList>

          {/* ── Overview / multi-step edit form ── */}
          <TabsContent value="overview" className="space-y-4">
            {!property.is_public && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-muted-foreground">
                <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span><span className="font-medium text-foreground">To publish{isGRbuilding ? ' in Greece' : ''}:</span>{' '}
                  title/description + price{isShortLet ? ', short-let licence (ΑΜΑ)' : isLand ? ', land use / zoning' : ', energy class + Electronic Building ID'}
                  {isGRbuilding ? ' are required.' : ' are recommended.'}</span>
              </div>
            )}

            {/* Stepper */}
            <div className="flex flex-wrap gap-1.5">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const active = i === step;
                return (
                  <button key={s.id} onClick={() => setStep(i)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}>
                    <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{s.label}</span>
                    <span className="ml-0.5 rounded-full bg-black/10 px-1.5 text-[10px] dark:bg-white/10">{i + 1}</span>
                  </button>
                );
              })}
            </div>

            {/* Step content */}
            {stepId === 'basics' && (
              <FormSection title="Classification" icon={Home}>
                <F label="Title"><Input value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} /></F>
                <F label="Reference code"><Input value={form.reference_code ?? ''} onChange={(e) => set('reference_code', e.target.value)} /></F>
                <F label="Category"><Sel value={form.property_type} opts={PROPERTY_TYPES} onChange={(v) => set('property_type', v)} /></F>
                <F label="Subtype"><Input value={form.subtype ?? ''} onChange={(e) => set('subtype', e.target.value)} placeholder="apartment, warehouse, plot…" /></F>
                <F label="Transaction"><Sel value={form.transaction_type} opts={TRANSACTION_TYPES} onChange={(v) => set('transaction_type', v)} /></F>
                <F label="Status"><Sel value={form.listing_status} opts={LISTING_STATUSES} onChange={(v) => set('listing_status', v)} /></F>
              </FormSection>
            )}

            {stepId === 'pricing' && (
              <FormSection title="Pricing" icon={Tag}>
                <F label="Price"><NumInput v={form.price} on={(x) => set('price', x)} /></F>
                <F label="Currency"><Input value={form.currency ?? 'EUR'} onChange={(e) => set('currency', e.target.value)} /></F>
                <F label="Period (rent)"><Input value={form.price_period ?? ''} onChange={(e) => set('price_period', e.target.value)} placeholder="month, year…" /></F>
                <F label="Previous price (was)"><NumInput v={form.previous_price} on={(x) => set('previous_price', x)} /></F>
                <F label="Common charges"><NumInput v={form.common_charges} on={(x) => set('common_charges', x)} /></F>
                <Chk label="Price on request" checked={!!form.price_on_request} onChange={(v) => set('price_on_request', v)} />
              </FormSection>
            )}

            {stepId === 'location' && (
              <FormSection title="Location" icon={MapPin}>
                <F label="Country code"><Input value={form.country_code ?? ''} onChange={(e) => set('country_code', e.target.value.toUpperCase())} placeholder="EL, GR, ES…" /></F>
                <F label="Region"><Input value={form.region ?? ''} onChange={(e) => set('region', e.target.value)} /></F>
                <F label="Prefecture (Νομός)"><Input value={form.prefecture ?? ''} onChange={(e) => set('prefecture', e.target.value)} /></F>
                <F label="Municipality (Δήμος)"><Input value={form.municipality ?? ''} onChange={(e) => set('municipality', e.target.value)} /></F>
                <F label="Town"><Input value={form.town ?? ''} onChange={(e) => set('town', e.target.value)} /></F>
                <F label="Postcode"><Input value={form.postcode ?? ''} onChange={(e) => set('postcode', e.target.value)} /></F>
                <F label="Address"><Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></F>
                <F label="Street number"><Input value={form.street_number ?? ''} onChange={(e) => set('street_number', e.target.value)} /></F>
                <F label="Latitude"><NumInput v={form.lat} on={(x) => set('lat', x)} /></F>
                <F label="Longitude"><NumInput v={form.lng} on={(x) => set('lng', x)} /></F>
                <Chk label="Hide exact address publicly" checked={!!form.hide_exact_address} onChange={(v) => set('hide_exact_address', v)} />
              </FormSection>
            )}

            {stepId === 'details' && (
              <>
                {isResidential && (
                  <FormSection title="Physical" icon={Ruler}>
                    <F label="Bedrooms"><NumInput v={form.bedrooms} on={(x) => set('bedrooms', x)} /></F>
                    <F label="Rooms (total)"><NumInput v={form.rooms} on={(x) => set('rooms', x)} /></F>
                    <F label="Bathrooms"><NumInput v={form.bathrooms} on={(x) => set('bathrooms', x)} /></F>
                    <F label="WC"><NumInput v={form.wc} on={(x) => set('wc', x)} /></F>
                    <F label="Kitchens"><NumInput v={form.kitchens} on={(x) => set('kitchens', x)} /></F>
                    <F label="Living rooms"><NumInput v={form.living_rooms} on={(x) => set('living_rooms', x)} /></F>
                    <F label="Built area (m²)"><NumInput v={form.area_built} on={(x) => set('area_built', x)} /></F>
                    <F label="Plot area (m²)"><NumInput v={form.area_plot} on={(x) => set('area_plot', x)} /></F>
                    <F label="Floor"><Input value={form.floor ?? ''} onChange={(e) => set('floor', e.target.value)} placeholder="ground, 2, penthouse…" /></F>
                    <F label="Floors total"><NumInput v={form.floors_total} on={(x) => set('floors_total', x)} /></F>
                    <F label="Levels"><NumInput v={form.levels} on={(x) => set('levels', x)} /></F>
                    <F label="Year built"><NumInput v={form.year_built} on={(x) => set('year_built', x)} /></F>
                    <F label="Year renovated"><NumInput v={form.year_renovated} on={(x) => set('year_renovated', x)} /></F>
                    <F label="Condition"><Input value={form.condition ?? ''} onChange={(e) => set('condition', e.target.value)} placeholder="new / good / needs renovation" /></F>
                    <F label="Orientation"><Input value={form.orientation ?? ''} onChange={(e) => set('orientation', e.target.value)} placeholder="south, east…" /></F>
                    <F label="Furnished"><Input value={form.furnished ?? ''} onChange={(e) => set('furnished', e.target.value)} placeholder="yes / no / partial" /></F>
                    <F label="Balcony area (m²)"><NumInput v={form.balcony_area} on={(x) => set('balcony_area', x)} /></F>
                  </FormSection>
                )}
                {isCommercial && (
                  <FormSection title="Commercial / business" icon={Building2}>
                    <F label="Gross area (m²)"><NumInput v={form.gross_area} on={(x) => set('gross_area', x)} /></F>
                    <F label="Net / usable area (m²)"><NumInput v={form.net_area} on={(x) => set('net_area', x)} /></F>
                    <F label="Frontage / πρόσοψη (m)"><NumInput v={form.frontage} on={(x) => set('frontage', x)} /></F>
                    <F label="Ceiling height (m)"><NumInput v={form.ceiling_height} on={(x) => set('ceiling_height', x)} /></F>
                    <F label="Floors included"><NumInput v={form.floors_included} on={(x) => set('floors_included', x)} /></F>
                    <F label="WC count"><NumInput v={form.wc_count} on={(x) => set('wc_count', x)} /></F>
                    <F label="Permitted use / χρήση γης"><Input value={form.permitted_use ?? ''} onChange={(e) => set('permitted_use', e.target.value)} /></F>
                    <F label="Current use"><Input value={form.current_use ?? ''} onChange={(e) => set('current_use', e.target.value)} /></F>
                    <F label="Operating licence"><Input value={form.operating_license ?? ''} onChange={(e) => set('operating_license', e.target.value)} /></F>
                    <F label="Power capacity (kVA)"><NumInput v={form.power_capacity_kva} on={(x) => set('power_capacity_kva', x)} /></F>
                    <F label="Occupancy status"><Input value={form.occupancy_status ?? ''} onChange={(e) => set('occupancy_status', e.target.value)} placeholder="vacant / tenanted" /></F>
                    <F label="Current rent"><NumInput v={form.current_rent} on={(x) => set('current_rent', x)} /></F>
                    <F label="Yield / cap rate (%)"><NumInput v={form.cap_rate} on={(x) => set('cap_rate', x)} /></F>
                    <F label="Lease expiry"><Input type="date" value={form.lease_expiry ?? ''} onChange={(e) => set('lease_expiry', e.target.value)} /></F>
                    <ChkGrid items={[['three_phase_power', 'Three-phase (τριφασικό)'], ['storefront_windows', 'Storefront (βιτρίνα)'], ['loading_dock', 'Loading dock'], ['goods_lift', 'Goods lift'], ['fire_safety_cert', 'Fire-safety cert'], ['accessibility_amea', 'Accessibility (ΑμεΑ)']]} form={form} set={set} />
                  </FormSection>
                )}
                {isBusinessSale && (
                  <FormSection title="Business for sale (going concern)" icon={Tag}>
                    <F label="Key money / αέρας"><NumInput v={form.key_money} on={(x) => set('key_money', x)} /></F>
                    <F label="Business type"><Input value={form.business_type ?? ''} onChange={(e) => set('business_type', e.target.value)} /></F>
                    <F label="Annual turnover"><NumInput v={form.annual_turnover} on={(x) => set('annual_turnover', x)} /></F>
                    <F label="Staff count"><NumInput v={form.staff_count} on={(x) => set('staff_count', x)} /></F>
                    <Chk label="Inventory included" checked={!!form.inventory_included} onChange={(v) => set('inventory_included', v)} />
                    <F label="Reason for sale" wide><Input value={form.reason_for_sale ?? ''} onChange={(e) => set('reason_for_sale', e.target.value)} /></F>
                  </FormSection>
                )}
                {isLand && (
                  <FormSection title="Land / plot" icon={Ruler}>
                    <F label="Plot area (m²)"><NumInput v={form.plot_area} on={(x) => set('plot_area', x)} /></F>
                    <F label="Building coefficient (ΣΔ)"><NumInput v={form.building_coefficient} on={(x) => set('building_coefficient', x)} /></F>
                    <F label="Coverage ratio"><NumInput v={form.coverage_ratio} on={(x) => set('coverage_ratio', x)} /></F>
                    <F label="Max building height (m)"><NumInput v={form.max_building_height} on={(x) => set('max_building_height', x)} /></F>
                    <F label="Allowed floors"><NumInput v={form.allowed_floors} on={(x) => set('allowed_floors', x)} /></F>
                    <F label="Land use / zoning"><Input value={form.land_use ?? ''} onChange={(e) => set('land_use', e.target.value)} /></F>
                    <F label="Road frontage (m)"><NumInput v={form.frontage_to_road} on={(x) => set('frontage_to_road', x)} /></F>
                    <F label="Distance to sea (m)"><NumInput v={form.distance_to_sea} on={(x) => set('distance_to_sea', x)} /></F>
                    <F label="Slope / terrain"><Input value={form.slope ?? ''} onChange={(e) => set('slope', e.target.value)} /></F>
                    <ChkGrid items={[['buildable', 'Buildable (άρτιο)'], ['inside_city_plan', 'Inside city plan'], ['within_settlement', 'Within settlement'], ['road_access', 'Road access'], ['corner_plot', 'Corner plot']]} form={form} set={set} />
                    <F label="Utilities available (comma)" wide><Input value={form.utilities_available ?? ''} onChange={(e) => set('utilities_available', e.target.value)} placeholder="water, electricity, sewage, gas" /></F>
                    <F label="Legal clearances (comma)" wide><Input value={form.legal_clearances ?? ''} onChange={(e) => set('legal_clearances', e.target.value)} placeholder="topographic, forestry, archaeological" /></F>
                    <F label="Existing structures" wide><Input value={form.existing_structures ?? ''} onChange={(e) => set('existing_structures', e.target.value)} /></F>
                  </FormSection>
                )}
                {isShortLet && (
                  <FormSection title="Short-let" icon={CalendarClock}>
                    <F label="Licence (ΑΜΑ)"><Input value={form.short_term_rental_license ?? ''} onChange={(e) => set('short_term_rental_license', e.target.value)} /></F>
                    <F label="Max guests"><NumInput v={form.max_guests} on={(x) => set('max_guests', x)} /></F>
                    <F label="Bed config"><Input value={form.bed_config ?? ''} onChange={(e) => set('bed_config', e.target.value)} placeholder="1 double, 2 single" /></F>
                    <F label="Min stay (nights)"><NumInput v={form.min_stay_nights} on={(x) => set('min_stay_nights', x)} /></F>
                    <F label="Check-in time"><Input value={form.check_in_time ?? ''} onChange={(e) => set('check_in_time', e.target.value)} placeholder="15:00" /></F>
                    <F label="Check-out time"><Input value={form.check_out_time ?? ''} onChange={(e) => set('check_out_time', e.target.value)} placeholder="11:00" /></F>
                    <F label="Cleaning fee"><NumInput v={form.cleaning_fee} on={(x) => set('cleaning_fee', x)} /></F>
                    <F label="Deposit"><NumInput v={form.deposit} on={(x) => set('deposit', x)} /></F>
                    <F label="Cancellation policy"><Input value={form.cancellation_policy ?? ''} onChange={(e) => set('cancellation_policy', e.target.value)} /></F>
                    <ChkGrid items={[['instant_book', 'Instant book'], ['smoking_allowed', 'Smoking allowed'], ['events_allowed', 'Events allowed']]} form={form} set={set} />
                    <F label="House rules" wide><Textarea rows={2} value={form.house_rules ?? ''} onChange={(e) => set('house_rules', e.target.value)} /></F>
                  </FormSection>
                )}
              </>
            )}

            {stepId === 'amenities' && (
              <FormSection title="Amenities & parking" icon={ListChecks}>
                <ChkGrid items={AMENITIES} form={form} set={set} />
                <F label="Parking spaces"><NumInput v={form.parking_spaces} on={(x) => set('parking_spaces', x)} /></F>
                <F label="Open parking spots"><NumInput v={form.open_parking_spots} on={(x) => set('open_parking_spots', x)} /></F>
                <F label="Closed parking spots"><NumInput v={form.closed_parking_spots} on={(x) => set('closed_parking_spots', x)} /></F>
                <F label="Parking type"><Input value={form.parking_type ?? ''} onChange={(e) => set('parking_type', e.target.value)} placeholder="garage, pilotis, street" /></F>
                <F label="Construction status"><Sel value={form.construction_status ?? ''} opts={CONSTRUCTION} onChange={(v) => set('construction_status', v)} /></F>
                <F label="View types (comma)"><Input value={form.view_types ?? ''} onChange={(e) => set('view_types', e.target.value)} placeholder="sea, mountain, city" /></F>
                <F label="Suitable for (comma)"><Input value={form.suitable_for ?? ''} onChange={(e) => set('suitable_for', e.target.value)} placeholder="family, investment, airbnb" /></F>
              </FormSection>
            )}

            {stepId === 'energy' && (
              <FormSection title="Energy & compliance" icon={Zap}>
                <F label="Energy class"><Sel value={form.energy_class ?? ''} opts={['', ...ENERGY_CLASSES]} onChange={(v) => set('energy_class', v)} /></F>
                <F label={`Electronic Building ID${isGRbuilding ? ' *' : ''}`}><Input value={form.electronic_building_id ?? ''} onChange={(e) => set('electronic_building_id', e.target.value)} /></F>
                <F label="ΑΤΑΚ (tax id, internal)"><Input value={form.atak ?? ''} onChange={(e) => set('atak', e.target.value)} /></F>
                <F label="Heating type"><Input value={form.heating_type ?? ''} onChange={(e) => set('heating_type', e.target.value)} placeholder="autonomous, central, none" /></F>
                <F label="Heating medium"><Input value={form.heating_medium ?? ''} onChange={(e) => set('heating_medium', e.target.value)} placeholder="gas, oil, heat pump" /></F>
                {isShortLet && <F label="Short-let licence (ΑΜΑ)"><Input value={form.short_term_rental_license ?? ''} onChange={(e) => set('short_term_rental_license', e.target.value)} /></F>}
                {isLand && <F label="Land use / zoning"><Input value={form.land_use ?? ''} onChange={(e) => set('land_use', e.target.value)} /></F>}
              </FormSection>
            )}

            {stepId === 'content' && (
              <>
                <FormSection title="Content" icon={FileText}>
                  {canManage && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={async () => {
                        if (!ws) return;
                        setBusy(true);
                        try {
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
                  <F label="Amenities notes (comma-separated)" wide><Input value={form.amenities ?? ''} onChange={(e) => set('amenities', e.target.value)} /></F>
                </FormSection>
                <FormSection title="Listing agent" icon={Contact}>
                  <F label="Agent name"><Input value={form.agent_name ?? ''} onChange={(e) => set('agent_name', e.target.value)} /></F>
                  <F label="Agent phone"><Input value={form.agent_phone ?? ''} onChange={(e) => set('agent_phone', e.target.value)} /></F>
                  <F label="Agent email"><Input value={form.agent_email ?? ''} onChange={(e) => set('agent_email', e.target.value)} /></F>
                  <F label="Agent website"><Input value={form.agent_website ?? ''} onChange={(e) => set('agent_website', e.target.value)} /></F>
                </FormSection>
              </>
            )}

            {/* Step nav */}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" className="rounded-full" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}><ChevronLeft className="mr-1 h-4 w-4" /> Back</Button>
              <span className="text-xs text-muted-foreground">Step {step + 1} of {STEPS.length} · {STEPS[step].label}</span>
              {step < STEPS.length - 1
                ? <Button size="sm" className="rounded-full" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                : (canManage && <Button size="sm" className="rounded-full" onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" /> {saving ? 'Saving…' : 'Save'}</Button>)}
            </div>
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
          <TabsContent value="inquiries" className="space-y-4">
            <BuyersForListing ws={ws} propertyId={id} />
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
                }}><CalendarClock className="mr-1 h-4 w-4" /> Schedule viewing</Button>
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

// Buyers whose saved searches match this listing (inverse auto-match).
const BuyersForListing: React.FC<{ ws: string | null; propertyId: string }> = ({ ws, propertyId }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { if (ws) realEstateService.buyersForProperty(ws, propertyId).then(setRows).catch(() => setRows([])); }, [ws, propertyId]);
  if (!rows || rows.length === 0) return null;
  return (
    <Card><CardContent className="p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Contact className="h-3.5 w-3.5" /> Matching buyers ({rows.length})</div>
      <div className="flex flex-wrap gap-2">
        {rows.slice(0, 12).map((r) => (
          <Link key={r.id} to={`/crm/contacts/${r.crm_contact_id}`} className="rounded-full bg-muted px-3 py-1 text-xs hover:bg-muted/70">
            {r.contact?.name || r.contact?.email || 'Buyer'} · <span className="text-muted-foreground">{r.label || 'search'}</span>
          </Link>
        ))}
      </div>
    </CardContent></Card>
  );
};

// ── small form primitives ──
const FormSection: React.FC<{ title: string; icon?: LucideIcon; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <Card><CardContent className="p-4">
    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{Icon && <Icon className="h-3.5 w-3.5 text-primary" />}{title}</h3>
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
  <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
    <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} /> {label}
  </label>
);
// A grid of boolean checkboxes spanning the section width.
const ChkGrid: React.FC<{ items: readonly (readonly [string, string])[]; form: Record<string, any>; set: (k: string, v: any) => void }> = ({ items, form, set }) => (
  <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-3 lg:col-span-3">
    {items.map(([k, label]) => (
      <label key={k} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={!!form[k]} onCheckedChange={(v) => set(k, v === true)} /> {label}</label>
    ))}
  </div>
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
