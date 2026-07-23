import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Building2, ArrowLeft, Save, Globe, EyeOff, Upload, Star, Trash2, Copy, ExternalLink, Sparkles,
  FileText, UserPlus, Home, Tag, MapPin, Ruler, ListChecks, Zap, Loader2, ChevronLeft, ChevronRight,
  Contact, CalendarClock, Image as ImageIcon, Gavel, Check, X, FileSignature, Send,
  KeyRound, Wrench, Receipt, LineChart, RotateCw,
} from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
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
  type Property, type PropertyPhoto, type PropertyInquiry, type PropertyViewing, type PropertyOffer,
  type Tenancy, type RentCharge, type MaintenanceWorkOrder, type LandlordStatement, type PropertySale,
  type InvestmentMetrics,
} from '../services/realEstateService';
import { contractsService, type Contract } from '@/services/contractsService';
import { ContactSearchDropdown } from '@/components/business/crm/ContactSearchDropdown';
import { NewInvoiceDialog } from '@/modules/finance/components/NewInvoiceDialog';
import { CmaReportDialog } from '../components/CmaReportDialog';

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
  'title', 'reference_code', 'property_type', 'subtype', 'transaction_type', 'listing_status', 'open_for_all', 'vendor_contact_id',
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
  const { isModuleAvailable } = useEntitlements();
  const pmEnabled = isModuleAvailable('real-estate-management');   // #281 Property Management add-on
  const investEnabled = isModuleAvailable('real-estate-investments'); // #281 Investments add-on
  const { toast } = useToast();
  const navigate = useNavigate();
  const canManage = can('realestate.listings.manage');

  const [property, setProperty] = useState<Property | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [cmaOpen, setCmaOpen] = useState(false);
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
      setProperty(r.property); setCanEdit(r.can_edit !== false); setPhotos(r.photos); setInquiries(r.inquiries); setViewings(r.viewings);
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

  // Edits require the listings-manage capability AND ownership (own listing or broker). An estate
  // agent viewing an "open for all" listing they don't own gets a read-only view.
  const editable = canManage && canEdit;
  const isGRbuilding = ['EL', 'GR'].includes(String(form.country_code ?? '').toUpperCase());
  const cat = form.property_type;
  const isResidential = cat === 'residential' || cat === 'other';
  const isCommercial = cat === 'commercial';
  const isLand = cat === 'land';
  const isShortLet = form.transaction_type === 'short_let';
  const isBusinessSale = form.transaction_type === 'business_transfer';
  const isRental = form.transaction_type === 'rent' || form.listing_status === 'rented';
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
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setCmaOpen(true)}><LineChart className="mr-1 h-4 w-4" /> CMA</Button>
            {editable && (property.is_public
              ? <Button variant="outline" size="sm" className="rounded-full" onClick={unpublish} disabled={busy}><EyeOff className="mr-1 h-4 w-4" /> Unpublish</Button>
              : <Button size="sm" className="rounded-full" onClick={publish} disabled={busy}><Globe className="mr-1 h-4 w-4" /> Publish</Button>)}
            {editable && <Button size="sm" className="rounded-full" onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" /> {saving ? 'Saving…' : 'Save'}</Button>}
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
            <TabsTrigger value="offers"><Gavel className="mr-1.5 h-4 w-4" /> Offers</TabsTrigger>
            <TabsTrigger value="viewings"><CalendarClock className="mr-1.5 h-4 w-4" /> Viewings {viewings.length > 0 && <Badge className="ml-1 rounded-full border-0 bg-primary/15 text-[10px]">{viewings.length}</Badge>}</TabsTrigger>
            {canManage && isRental && pmEnabled && <TabsTrigger value="lettings"><KeyRound className="mr-1.5 h-4 w-4" /> Lettings</TabsTrigger>}
            {canManage && investEnabled && <TabsTrigger value="investment"><LineChart className="mr-1.5 h-4 w-4" /> Investment</TabsTrigger>}
            {canManage && <TabsTrigger value="transaction"><FileSignature className="mr-1.5 h-4 w-4" /> Transaction</TabsTrigger>}
          </TabsList>

          {/* ── Overview / multi-step edit form ── */}
          <TabsContent value="overview" className="space-y-4">
            {canManage && !canEdit && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                <EyeOff className="h-3.5 w-3.5" /> This listing belongs to another agent (shared “open for all”) — read-only.
              </div>
            )}
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
                <F label="Vendor / owner (CRM)" wide><ContactSearchDropdown selectedContactId={form.vendor_contact_id ?? null} onSelect={(id) => set('vendor_contact_id', id)} placeholder="Link the seller/owner contact…" /></F>
                <Chk label="Open for all agents (visible to the whole team)" checked={!!form.open_for_all} onChange={(v) => set('open_for_all', v)} />
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
                  {editable && (
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
                : (editable && <Button size="sm" className="rounded-full" onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" /> {saving ? 'Saving…' : 'Save'}</Button>)}
            </div>
          </TabsContent>

          {/* ── Media ── */}
          <TabsContent value="media">
            <div className="mb-4 flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onUpload} />
              {editable && <Button variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="mr-2 h-4 w-4" /> Upload photos</Button>}
              {editable && photos.length > 0 && (
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
                  <PhotoCard key={ph.id} photo={ph} ws={ws!} canManage={editable}
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
                      {!q.crm_contact_id && editable && (
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

          {/* ── Offers ── */}
          <TabsContent value="offers" className="space-y-6">
            <CommissionPanel ws={ws} propertyId={id} property={property} canManage={editable} onCompleted={load} />
            <OffersTab ws={ws} propertyId={id} canManage={editable} onAccepted={load} />
          </TabsContent>

          {/* ── Transaction (Contracts module: Memorandum of Sale / agency agreement + e-sign) ── */}
          {canManage && isRental && pmEnabled && <TabsContent value="lettings"><LettingsTab ws={ws} propertyId={id} canManage={editable} /></TabsContent>}

          {canManage && investEnabled && <TabsContent value="investment"><InvestmentTab ws={ws} propertyId={id} canManage={editable} /></TabsContent>}

          {canManage && <TabsContent value="transaction"><TransactionTab ws={ws} propertyId={id} canEdit={editable} /></TabsContent>}

          {/* ── Viewings ── */}
          <TabsContent value="viewings" className="space-y-4">
            {editable && (
              <div className="flex flex-wrap items-end gap-2">
                <input type="datetime-local" value={newViewingAt} onChange={(e) => setNewViewingAt(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
                <Button size="sm" className="rounded-full" disabled={!newViewingAt || busy} onClick={async () => {
                  if (!ws || !newViewingAt) return;
                  setBusy(true);
                  try { await realEstateService.createViewing(ws, { property_id: id, scheduled_at: new Date(newViewingAt).toISOString() }); setNewViewingAt(''); await load(); toast({ title: 'Viewing scheduled' }); }
                  catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
                  finally { setBusy(false); }
                }}><CalendarClock className="mr-1 h-4 w-4" /> Schedule viewing</Button>
                <span className="text-[11px] text-muted-foreground">Added to your calendar with a reminder.</span>
              </div>
            )}
            {viewings.length === 0 ? <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No viewings scheduled.</div> : (
              <Card><CardContent className="p-0"><div className="divide-y divide-border">
                {viewings.map((v) => (
                  <div key={v.id} className="flex items-center gap-4 px-4 py-3 text-sm">
                    <div className="flex-1">{new Date(v.scheduled_at).toLocaleString()} · <span className="capitalize text-muted-foreground">{v.type.replace('_', ' ')}</span></div>
                    {editable && (
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
      {ws && <CmaReportDialog ws={ws} propertyId={id} open={cmaOpen} onOpenChange={setCmaOpen} />}
    </div>
  );
}

const OFFER_TINT: Record<string, string> = {
  offered: 'bg-amber-500/15 text-amber-500', countered: 'bg-blue-500/15 text-blue-500',
  accepted: 'bg-emerald-500/15 text-emerald-500', rejected: 'bg-muted text-muted-foreground', withdrawn: 'bg-muted text-muted-foreground',
};
const offerMoney = (n: number, ccy: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(n);

// ── Lettings / property management (#281) ──
const LEDGER_TINT: Record<string, string> = {
  due: 'bg-amber-500/10 text-amber-500', paid: 'bg-emerald-500/10 text-emerald-500',
  overdue: 'bg-red-500/10 text-red-500', waived: 'bg-muted text-muted-foreground',
};
const WO_TINT: Record<string, string> = {
  open: 'bg-amber-500/10 text-amber-500', in_progress: 'bg-blue-500/10 text-blue-500',
  completed: 'bg-emerald-500/10 text-emerald-500', cancelled: 'bg-muted text-muted-foreground',
};
const Stat: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className={`dashboard-card p-3 ${accent ? 'ring-1 ring-primary/30' : ''}`}>
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className={`mt-0.5 text-base font-semibold ${accent ? 'text-primary' : ''}`}>{value}</div>
  </div>
);

const LettingsTab: React.FC<{ ws: string | null; propertyId: string; canManage: boolean }> = ({ ws, propertyId, canManage }) => {
  const { toast } = useToast();
  const [tenancy, setTenancy] = useState<Tenancy | null | undefined>(undefined); // undefined = loading
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [wos, setWos] = useState<MaintenanceWorkOrder[]>([]);
  const [stmt, setStmt] = useState<LandlordStatement['summary'] | null>(null);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Record<string, any>>({ currency: 'EUR', rent_frequency: 'monthly', status: 'active' });
  const [busy, setBusy] = useState(false);
  const [woAdding, setWoAdding] = useState(false);
  const [wf, setWf] = useState<Record<string, any>>({ priority: 'normal' });

  const load = useCallback(async () => {
    if (!ws) return;
    const list = await realEstateService.listTenancies(ws, propertyId).catch(() => []);
    const t = list[0] ?? null;
    setTenancy(t);
    if (t) {
      setF({ tenant_contact_id: t.tenant_contact_id, landlord_contact_id: t.landlord_contact_id, rent_amount: t.rent_amount, currency: t.currency, rent_frequency: t.rent_frequency, deposit: t.deposit, start_date: t.start_date, end_date: t.end_date, status: t.status, notes: t.notes });
      const [c, s] = await Promise.all([
        realEstateService.listRentCharges(ws, t.id).catch(() => []),
        realEstateService.landlordStatement(ws, t.id).catch(() => null),
      ]);
      setCharges(c); setStmt(s?.summary ?? null);
    }
    setWos(await realEstateService.listMaintenance(ws, { property_id: propertyId }).catch(() => []));
  }, [ws, propertyId]);
  useEffect(() => { void load(); }, [load]);

  const saveTenancy = async () => {
    if (!ws || !f.rent_amount || !f.start_date) { toast({ title: 'Rent amount and start date are required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await realEstateService.upsertTenancy(ws, { tenancy_id: tenancy?.id, property_id: propertyId, tenant_contact_id: f.tenant_contact_id || null, landlord_contact_id: f.landlord_contact_id || null, rent_amount: Number(f.rent_amount), currency: f.currency || 'EUR', rent_frequency: f.rent_frequency, deposit: f.deposit != null && f.deposit !== '' ? Number(f.deposit) : null, start_date: f.start_date, end_date: f.end_date || null, status: f.status, notes: f.notes });
      setEditing(false); await load(); toast({ title: 'Tenancy saved' });
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const genSchedule = async () => {
    if (!ws || !tenancy) return;
    setBusy(true);
    try { const r = await realEstateService.generateRentSchedule(ws, tenancy.id, 12); toast({ title: `Added ${r.created} rent charge(s)`, description: r.skipped ? `${r.skipped} already scheduled` : undefined }); await load(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const markPaid = async (id: string, status: 'paid' | 'waived') => {
    if (!ws) return;
    try { await realEstateService.markRentPaid(ws, id, { status }); await load(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  };
  const invoiceRent = async (id: string) => {
    if (!ws) return;
    try { const r = await realEstateService.invoiceRentCharge(ws, id); await load(); toast({ title: r.already ? 'Already invoiced' : 'Draft rent invoice created', description: 'Review VAT & issue it in Finance.' }); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  };
  const renew = async () => {
    if (!ws || !tenancy) return;
    const newEnd = window.prompt('Renew tenancy — new end date (YYYY-MM-DD), leave blank to keep:', tenancy.end_date ?? '');
    if (newEnd === null) return;
    const newRent = window.prompt('New monthly rent (leave blank to keep current):', String(tenancy.rent_amount));
    if (newRent === null) return;
    try { await realEstateService.renewTenancy(ws, tenancy.id, { new_end_date: newEnd || undefined, new_rent: newRent ? Number(newRent) : undefined }); await load(); toast({ title: 'Tenancy renewed' }); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  };
  const addWo = async () => {
    if (!ws || !wf.title) return;
    setBusy(true);
    try { await realEstateService.upsertMaintenance(ws, { property_id: propertyId, tenancy_id: tenancy?.id ?? null, title: wf.title, description: wf.description, priority: wf.priority, contractor_name: wf.contractor_name, cost: wf.cost != null && wf.cost !== '' ? Number(wf.cost) : null }); setWf({ priority: 'normal' }); setWoAdding(false); await load(); toast({ title: 'Work order added' }); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const setWoStatus = async (id: string, status: string) => {
    if (!ws) return;
    try { await realEstateService.upsertMaintenance(ws, { work_order_id: id, status }); await load(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  };

  if (tenancy === undefined) return <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  const ccy = tenancy?.currency || f.currency || 'EUR';

  return (
    <div className="space-y-6">
      {(!tenancy || editing) ? (
        <Card><CardContent className="space-y-3 p-4">
          <div className="text-sm font-semibold">{tenancy ? 'Edit tenancy' : 'Set up tenancy'}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div><Label className="text-xs">Tenant</Label><ContactSearchDropdown selectedContactId={f.tenant_contact_id ?? null} onSelect={(id) => setF((p) => ({ ...p, tenant_contact_id: id }))} placeholder="Link tenant…" /></div>
            <div><Label className="text-xs">Landlord</Label><ContactSearchDropdown selectedContactId={f.landlord_contact_id ?? null} onSelect={(id) => setF((p) => ({ ...p, landlord_contact_id: id }))} placeholder="Link landlord…" /></div>
            <div><Label className="text-xs">Rent</Label><NumInput v={f.rent_amount} on={(x) => setF((p) => ({ ...p, rent_amount: x }))} /></div>
            <div><Label className="text-xs">Frequency</Label><Sel value={f.rent_frequency} opts={['weekly', 'monthly', 'quarterly', 'yearly']} onChange={(v) => setF((p) => ({ ...p, rent_frequency: v }))} /></div>
            <div><Label className="text-xs">Deposit</Label><NumInput v={f.deposit} on={(x) => setF((p) => ({ ...p, deposit: x }))} /></div>
            <div><Label className="text-xs">Status</Label><Sel value={f.status} opts={['pending', 'active', 'ended', 'terminated']} onChange={(v) => setF((p) => ({ ...p, status: v }))} /></div>
            <div><Label className="text-xs">Start date</Label><Input type="date" value={f.start_date ?? ''} onChange={(e) => setF((p) => ({ ...p, start_date: e.target.value }))} /></div>
            <div><Label className="text-xs">End date</Label><Input type="date" value={f.end_date ?? ''} onChange={(e) => setF((p) => ({ ...p, end_date: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="rounded-full" onClick={saveTenancy} disabled={busy}>Save tenancy</Button>
            {tenancy && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <div>
            <div className="text-lg font-semibold">{offerMoney(tenancy.rent_amount, ccy)}<span className="text-xs font-normal text-muted-foreground"> / {tenancy.rent_frequency}</span></div>
            <div className="text-xs text-muted-foreground">{tenancy.tenant?.name || 'No tenant set'} · from {new Date(tenancy.start_date).toLocaleDateString()}</div>
          </div>
          <Badge className="rounded-full border-0 bg-primary/15 text-[11px] capitalize">{tenancy.status}</Badge>
          {tenancy.deposit != null && <div className="text-xs text-muted-foreground">Deposit {offerMoney(tenancy.deposit, ccy)}</div>}
          {tenancy.end_date && <div className="text-xs text-muted-foreground">Ends {new Date(tenancy.end_date).toLocaleDateString()}</div>}
          {canManage && (
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant="ghost" className="rounded-full" onClick={renew}><RotateCw className="mr-1 h-3.5 w-3.5" /> Renew</Button>
              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setEditing(true)}>Edit</Button>
            </div>
          )}
        </CardContent></Card>
      )}

      {tenancy && (<>
        {stmt && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Rent received" value={offerMoney(stmt.rent_received, ccy)} />
            <Stat label="Outstanding" value={offerMoney(stmt.rent_outstanding, ccy)} />
            <Stat label="Maintenance" value={offerMoney(stmt.maintenance_spend, ccy)} />
            <Stat label="Net to landlord" value={offerMoney(stmt.net_to_landlord, ccy)} accent />
          </div>
        )}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-semibold"><Receipt className="h-4 w-4" /> Rent ledger</div>
            {canManage && <Button size="sm" variant="outline" className="rounded-full" onClick={genSchedule} disabled={busy}>Generate 12 periods</Button>}
          </div>
          {charges.length === 0 ? <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">No rent charges yet. Generate a schedule to start the ledger.</div> : (
            <Card><CardContent className="p-0"><div className="divide-y divide-border">
              {charges.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-24 shrink-0 text-muted-foreground">{new Date(c.due_date).toLocaleDateString()}</span>
                  <span className="font-medium">{offerMoney(c.amount, c.currency)}</span>
                  <Badge className={`${LEDGER_TINT[c.status]} rounded-full border-0 text-[10px] capitalize`}>{c.status}</Badge>
                  <div className="ml-auto flex items-center gap-1.5">
                    {c.invoice_id
                      ? <Link to={`/finance/invoices/${c.invoice_id}`}><Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs text-primary"><FileText className="mr-1 h-3 w-3" /> Invoice</Button></Link>
                      : canManage && c.status !== 'waived' && <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => invoiceRent(c.id)}><FileText className="mr-1 h-3 w-3" /> Invoice</Button>}
                    {canManage && c.status !== 'paid' && c.status !== 'waived' && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => markPaid(c.id, 'paid')}><Check className="mr-1 h-3 w-3" /> Paid</Button>
                        <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs text-muted-foreground" onClick={() => markPaid(c.id, 'waived')}>Waive</Button>
                      </>
                    )}
                    {c.status === 'paid' && c.paid_at && <span className="text-xs text-muted-foreground">Paid {new Date(c.paid_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              ))}
            </div></CardContent></Card>
          )}
        </div>
      </>)}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-semibold"><Wrench className="h-4 w-4" /> Maintenance</div>
          {canManage && !woAdding && <Button size="sm" variant="outline" className="rounded-full" onClick={() => setWoAdding(true)}>Add work order</Button>}
        </div>
        {woAdding && (
          <Card className="mb-3"><CardContent className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            <Input placeholder="Title" className="sm:col-span-2" value={wf.title ?? ''} onChange={(e) => setWf((p) => ({ ...p, title: e.target.value }))} />
            <Input placeholder="Contractor" value={wf.contractor_name ?? ''} onChange={(e) => setWf((p) => ({ ...p, contractor_name: e.target.value }))} />
            <NumInput v={wf.cost} on={(x) => setWf((p) => ({ ...p, cost: x }))} />
            <div className="sm:col-span-1"><Sel value={wf.priority} opts={['low', 'normal', 'high', 'urgent']} onChange={(v) => setWf((p) => ({ ...p, priority: v }))} /></div>
            <Textarea placeholder="Description" className="sm:col-span-3" value={wf.description ?? ''} onChange={(e) => setWf((p) => ({ ...p, description: e.target.value }))} />
            <div className="col-span-full flex gap-2"><Button size="sm" className="rounded-full" onClick={addWo} disabled={busy || !wf.title}>Add</Button><Button size="sm" variant="ghost" className="rounded-full" onClick={() => setWoAdding(false)}>Cancel</Button></div>
          </CardContent></Card>
        )}
        {wos.length === 0 ? <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">No maintenance work orders.</div> : (
          <Card><CardContent className="p-0"><div className="divide-y divide-border">
            {wos.map((w) => (
              <div key={w.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="font-medium">{w.title}</span><Badge className={`${WO_TINT[w.status]} rounded-full border-0 text-[10px] capitalize`}>{w.status.replace('_', ' ')}</Badge>{w.priority !== 'normal' && <Badge className="rounded-full border-0 bg-muted text-[10px] capitalize">{w.priority}</Badge>}</div>
                  {w.description && <div className="mt-0.5 text-xs text-muted-foreground">{w.description}</div>}
                  <div className="mt-0.5 text-xs text-muted-foreground">{[w.contractor_name, w.cost != null ? offerMoney(w.cost, ccy) : null, new Date(w.reported_at).toLocaleDateString()].filter(Boolean).join(' · ')}</div>
                </div>
                {canManage && w.status !== 'completed' && w.status !== 'cancelled' && (
                  <div className="flex shrink-0 gap-1.5">
                    {w.status === 'open' && <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => setWoStatus(w.id, 'in_progress')}>Start</Button>}
                    <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => setWoStatus(w.id, 'completed')}><Check className="mr-1 h-3 w-3" /> Done</Button>
                  </div>
                )}
              </div>
            ))}
          </div></CardContent></Card>
        )}
      </div>
    </div>
  );
};

// Offer ledger for a property — competing bids with qualification + accept/reject/counter cascade.
// ── Investments add-on (#281) — per-property analysis ──
const INVEST_FIELDS: [string, string, string?][] = [
  ['purchase_price', 'Purchase price'], ['acquisition_costs', 'Acquisition costs', 'transfer tax, legal, fees'],
  ['renovation_costs', 'Renovation'], ['loan_amount', 'Loan amount'],
  ['interest_rate_pct', 'Interest rate %'], ['loan_term_years', 'Loan term (yrs)'],
  ['monthly_rent', 'Monthly rent'], ['other_monthly_income', 'Other income /mo'],
  ['monthly_opex', 'Operating costs /mo', 'mgmt, insurance, reserve'], ['vacancy_pct', 'Vacancy %'],
];
const InvestmentTab: React.FC<{ ws: string | null; propertyId: string; canManage: boolean }> = ({ ws, propertyId, canManage }) => {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [f, setF] = useState<Record<string, any>>({ currency: 'EUR' });
  const [metrics, setMetrics] = useState<InvestmentMetrics | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ws) return;
    const r = await realEstateService.getInvestment(ws, propertyId).catch(() => ({ investment: null, metrics: null }));
    if (r.investment) setF({ ...r.investment });
    setMetrics(r.metrics);
    setLoaded(true);
  }, [ws, propertyId]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!ws) return;
    setBusy(true);
    try {
      const num = (k: string) => (f[k] === '' || f[k] == null ? 0 : Number(f[k]));
      const r = await realEstateService.upsertInvestment(ws, propertyId, {
        purchase_price: num('purchase_price'), acquisition_costs: num('acquisition_costs'), renovation_costs: num('renovation_costs'),
        loan_amount: num('loan_amount'), interest_rate_pct: num('interest_rate_pct'), loan_term_years: num('loan_term_years'),
        monthly_rent: num('monthly_rent'), other_monthly_income: num('other_monthly_income'), monthly_opex: num('monthly_opex'),
        vacancy_pct: num('vacancy_pct'), currency: f.currency || 'EUR', notes: f.notes ?? null,
      });
      setMetrics(r.metrics); toast({ title: 'Investment analysis saved' });
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (!loaded) return <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  const ccy = f.currency || 'EUR';
  const cf = metrics?.monthly_cash_flow ?? 0;
  return (
    <div className="space-y-5">
      {metrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <InvStat label="Total in" value={offerMoney(metrics.total_investment, ccy)} />
          <InvStat label="Gross yield" value={`${metrics.gross_yield_pct}%`} />
          <InvStat label="Net yield" value={`${metrics.net_yield_pct}%`} accent />
          <InvStat label="Cap rate" value={`${metrics.cap_rate_pct}%`} />
          <InvStat label="Cash-on-cash" value={`${metrics.cash_on_cash_pct}%`} accent />
          <InvStat label="Cash flow /mo" value={offerMoney(cf, ccy)} tone={cf >= 0 ? 'pos' : 'neg'} />
        </div>
      )}
      <Card><CardContent className="space-y-3 p-4">
        <div className="text-sm font-semibold">Deal inputs</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {INVEST_FIELDS.map(([k, label, hint]) => (
            <div key={k}>
              <Label className="text-xs">{label}</Label>
              <NumInput v={f[k]} on={(x) => setF((p) => ({ ...p, [k]: x }))} />
              {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
            </div>
          ))}
        </div>
        {canManage && <Button size="sm" className="rounded-full" onClick={save} disabled={busy}>Save &amp; recalculate</Button>}
      </CardContent></Card>
      {metrics && (
        <Card><CardContent className="grid grid-cols-2 gap-x-6 gap-y-1.5 p-4 text-sm sm:grid-cols-4">
          <Detail label="NOI (annual)" value={offerMoney(metrics.noi, ccy)} />
          <Detail label="Effective rent (yr)" value={offerMoney(metrics.effective_annual_rent, ccy)} />
          <Detail label="Debt service /mo" value={offerMoney(metrics.monthly_debt_service, ccy)} />
          <Detail label="Cash invested" value={offerMoney(metrics.cash_invested, ccy)} />
        </CardContent></Card>
      )}
    </div>
  );
};
const InvStat: React.FC<{ label: string; value: string; accent?: boolean; tone?: 'pos' | 'neg' }> = ({ label, value, accent, tone }) => (
  <div className={`dashboard-card p-3 ${accent ? 'ring-1 ring-primary/30' : ''}`}>
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className={`mt-0.5 text-base font-semibold ${tone === 'pos' ? 'text-emerald-500' : tone === 'neg' ? 'text-red-500' : accent ? 'text-primary' : ''}`}>{value}</div>
  </div>
);
const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>
);

// ── Sale completion + commission (#281) ──
const CommissionPanel: React.FC<{ ws: string | null; propertyId: string; property: Property | null; canManage: boolean; onCompleted: () => void }> = ({ ws, propertyId, property, canManage, onCompleted }) => {
  const { toast } = useToast();
  const [sale, setSale] = useState<PropertySale | null | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Record<string, any>>({});
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ws) return;
    const rows = await realEstateService.listSales(ws, propertyId).catch(() => []);
    setSale(rows[0] ?? null);
  }, [ws, propertyId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (property) setF((p) => ({ sale_price: p.sale_price ?? property.price ?? '', commission_pct: p.commission_pct ?? property.commission_pct ?? '', commission_fixed: p.commission_fixed ?? '' }));
  }, [property]);

  const complete = async () => {
    if (!ws || !f.sale_price) { toast({ title: 'Sale price is required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await realEstateService.completeSale(ws, { property_id: propertyId, sale_price: Number(f.sale_price), commission_pct: f.commission_pct !== '' ? Number(f.commission_pct) : undefined, commission_fixed: f.commission_fixed !== '' ? Number(f.commission_fixed) : undefined });
      await load(); onCompleted(); toast({ title: 'Sale completed', description: 'Listing marked sold; commission calculated.' });
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const onInvoiceCreated = async (invoiceId: string) => {
    setInvoiceOpen(false);
    if (!ws || !sale) return;
    try { await realEstateService.linkSaleInvoice(ws, sale.id, invoiceId); await load(); toast({ title: 'Commission invoice created', description: 'Linked to this sale.' }); }
    catch (e) { toast({ title: 'Invoice created but linking failed', description: (e as Error).message, variant: 'destructive' }); }
  };

  if (sale === undefined) return null;
  const ccy = sale?.currency || property?.currency || 'EUR';

  // Not sold yet → offer to complete the sale.
  if (!sale) {
    if (!canManage) return null;
    return (
      <Card className="border-primary/20"><CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold"><Tag className="h-4 w-4" /> Complete sale &amp; commission</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div><Label className="text-xs">Final sale price</Label><NumInput v={f.sale_price} on={(x) => setF((p) => ({ ...p, sale_price: x }))} /></div>
          <div><Label className="text-xs">Commission %</Label><NumInput v={f.commission_pct} on={(x) => setF((p) => ({ ...p, commission_pct: x }))} /></div>
          <div><Label className="text-xs">Fixed fee (optional)</Label><NumInput v={f.commission_fixed} on={(x) => setF((p) => ({ ...p, commission_fixed: x }))} /></div>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" className="rounded-full" onClick={complete} disabled={busy || !f.sale_price}>Mark sold &amp; calculate</Button>
          {f.sale_price && (Number(f.commission_pct) || Number(f.commission_fixed)) ? (
            <span className="text-xs text-muted-foreground">≈ {offerMoney(Number(f.sale_price) * (Number(f.commission_pct) || 0) / 100 + (Number(f.commission_fixed) || 0), ccy)} commission (+ VAT at invoice)</span>
          ) : null}
        </div>
      </CardContent></Card>
    );
  }

  // Sold → show the commission + issue/track the Finance invoice.
  const sellerName = sale.seller?.name || null;
  const commissionLine = `Sales commission — ${property?.title || 'property'}${sale.commission_pct ? ` (${sale.commission_pct}% of ${offerMoney(sale.sale_price, ccy)})` : ''}`;
  return (
    <Card className="border-emerald-500/25"><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <div>
          <div className="text-xs text-muted-foreground">Sold for</div>
          <div className="text-lg font-semibold">{offerMoney(sale.sale_price, ccy)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Commission {sale.commission_pct ? `(${sale.commission_pct}%${sale.commission_fixed ? ` + ${offerMoney(sale.commission_fixed, ccy)}` : ''})` : ''}</div>
          <div className="text-lg font-semibold text-emerald-500">{offerMoney(sale.commission_base, ccy)}<span className="text-xs font-normal text-muted-foreground"> + VAT</span></div>
        </div>
        <Badge className="rounded-full border-0 bg-emerald-500/15 text-[11px] text-emerald-500">Sold {new Date(sale.completed_at).toLocaleDateString()}</Badge>
      </div>
      {canManage && (
        <div className="flex items-center gap-3">
          {sale.invoice_id ? (
            <>
              <Badge className="rounded-full border-0 bg-primary/15 text-[11px] capitalize">Invoice {sale.invoice_status || 'issued'}</Badge>
              <Link to={`/finance/invoices/${sale.invoice_id}`}><Button size="sm" variant="ghost" className="rounded-full"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Open invoice</Button></Link>
            </>
          ) : sale.seller_contact_id ? (
            <Button size="sm" className="rounded-full" onClick={() => setInvoiceOpen(true)}><FileText className="mr-1.5 h-4 w-4" /> Issue commission invoice</Button>
          ) : (
            <span className="text-xs text-muted-foreground">Set the vendor/seller contact in <b>Basics</b> to invoice the commission.</span>
          )}
        </div>
      )}
      {ws && sale.seller_contact_id && (
        <NewInvoiceDialog
          workspaceId={ws}
          open={invoiceOpen}
          onOpenChange={setInvoiceOpen}
          onCreated={onInvoiceCreated}
          initialCustomer={{ type: 'contact', id: sale.seller_contact_id, label: sellerName || 'Seller' }}
          initialDocType="2.1"
          initialNotes={commissionLine}
          initialItems={[{ description: commissionLine, quantity: '1', unit_price: String(sale.commission_base) }]}
        />
      )}
    </CardContent></Card>
  );
};

const OffersTab: React.FC<{ ws: string | null; propertyId: string; canManage: boolean; onAccepted: () => void }> = ({ ws, propertyId, canManage, onAccepted }) => {
  const { toast } = useToast();
  const [offers, setOffers] = useState<PropertyOffer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<Record<string, any>>({ currency: 'EUR' });
  const load = useCallback(async () => { if (ws) setOffers(await realEstateService.listOffers(ws, propertyId).catch(() => [])); }, [ws, propertyId]);
  useEffect(() => { void load(); }, [load]);

  const setStatus = async (id: string, status: string) => {
    if (!ws) return;
    setBusy(true);
    try {
      if (status === 'accepted') { const r = await realEstateService.acceptOffer(ws, id); toast({ title: 'Offer accepted', description: `Listing → under offer${r.cancelled_viewings ? `, ${r.cancelled_viewings} viewing(s) cancelled` : ''}.` }); onAccepted(); }
      else await realEstateService.updateOffer(ws, id, { status });
      await load();
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const add = async () => {
    if (!ws || !f.amount) return;
    setBusy(true);
    try {
      await realEstateService.createOffer(ws, { property_id: propertyId, amount: Number(f.amount), currency: f.currency || 'EUR', buyer_name: f.buyer_name || undefined, terms: f.terms || undefined, proof_of_funds: !!f.proof_of_funds, mortgage_in_principle: !!f.mortgage_in_principle, chain_free: !!f.chain_free });
      setF({ currency: 'EUR' }); setAdding(false); await load(); toast({ title: 'Offer recorded' });
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (offers === null) return <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="space-y-4">
      {canManage && (adding ? (
        <Card><CardContent className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          <NumInput v={f.amount} on={(x) => setF((p) => ({ ...p, amount: x }))} />
          <Input placeholder="Buyer name" value={f.buyer_name ?? ''} onChange={(e) => setF((p) => ({ ...p, buyer_name: e.target.value }))} />
          <Input placeholder="Terms (optional)" className="sm:col-span-2" value={f.terms ?? ''} onChange={(e) => setF((p) => ({ ...p, terms: e.target.value }))} />
          <ChkGrid items={[['proof_of_funds', 'Proof of funds'], ['mortgage_in_principle', 'Mortgage in principle'], ['chain_free', 'Chain-free']]} form={f} set={(k, v) => setF((p) => ({ ...p, [k]: v }))} />
          <div className="col-span-full flex gap-2"><Button size="sm" className="rounded-full" onClick={add} disabled={busy || !f.amount}>Record offer</Button><Button size="sm" variant="ghost" className="rounded-full" onClick={() => setAdding(false)}>Cancel</Button></div>
        </CardContent></Card>
      ) : <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAdding(true)}><Gavel className="mr-1.5 h-4 w-4" /> Record an offer</Button>)}

      {offers.length === 0 ? <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No offers yet.</div> : (
        <Card><CardContent className="p-0"><div className="divide-y divide-border">
          {offers.map((o) => (
            <div key={o.id} className="flex items-start gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="font-semibold">{offerMoney(o.amount, o.currency)}</span><Badge className={`${OFFER_TINT[o.status]} rounded-full border-0 text-[11px] capitalize`}>{o.status.replace('_', ' ')}</Badge></div>
                <div className="mt-0.5 text-xs text-muted-foreground">{o.buyer?.name || o.buyer_name || 'Buyer'} · {new Date(o.created_at).toLocaleDateString()}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {o.proof_of_funds && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">Proof of funds</span>}
                  {o.mortgage_in_principle && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">MIP</span>}
                  {o.chain_free && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">Chain-free</span>}
                </div>
                {o.terms && <div className="mt-1 text-xs text-muted-foreground">{o.terms}</div>}
              </div>
              {canManage && ['offered', 'countered'].includes(o.status) && (
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" title="Accept" disabled={busy} onClick={() => setStatus(o.id, 'accepted')}><Check className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="Reject" disabled={busy} onClick={() => setStatus(o.id, 'rejected')}><X className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
          ))}
        </div></CardContent></Card>
      )}
    </div>
  );
};

// Transaction docs (Memorandum of Sale / agency agreement) via the Contracts module — e-sign reused.
const RE_CONTRACT_TYPES = [
  { v: 'memorandum_of_sale', label: 'Memorandum of Sale' },
  { v: 'agency_agreement', label: 'Agency agreement' },
  { v: 'reservation', label: 'Reservation agreement' },
];
const TransactionTab: React.FC<{ ws: string | null; propertyId: string; canEdit: boolean }> = ({ ws, propertyId, canEdit }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<Record<string, any>>({ contract_type: 'memorandum_of_sale' });

  const load = useCallback(async () => {
    if (!ws) return;
    try { setRows(await contractsService.list(ws, { context: 'realestate', property_id: propertyId } as any)); setErr(null); }
    catch (e) { setErr((e as Error).message); setRows([]); }
  }, [ws, propertyId]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!ws || !f.title) return;
    setBusy(true);
    try {
      await contractsService.create(ws, { context: 'realestate', property_id: propertyId, contract_type: f.contract_type, title: f.title, counterparty_name: f.counterparty_name || undefined, counterparty_email: f.counterparty_email || undefined, value: f.value ? Number(f.value) : undefined, body_markdown: f.body_markdown || undefined } as any);
      setF({ contract_type: 'memorandum_of_sale' }); setAdding(false); await load(); toast({ title: 'Document created' });
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const send = async (id: string) => {
    if (!ws) return;
    setBusy(true);
    try { const r = await contractsService.send(ws, id); const url = `${window.location.origin}${r.sign_path}`; void navigator.clipboard.writeText(url); await load(); toast({ title: 'Sent for signature', description: 'Sign link copied to clipboard.' }); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (rows === null && !err) return <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (err && /not available|not entitled|entitled|module/i.test(err)) {
    return <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">The <span className="font-medium">Contracts</span> module is needed for transaction documents &amp; e-signature. Enable it in Profile → Modules.</div>;
  }
  return (
    <div className="space-y-4">
      {canEdit && (adding ? (
        <Card><CardContent className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-2">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.contract_type} onChange={(e) => setF((p) => ({ ...p, contract_type: e.target.value }))}>
            {RE_CONTRACT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <Input placeholder="Title" value={f.title ?? ''} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} />
          <Input placeholder="Counterparty name (buyer/vendor)" value={f.counterparty_name ?? ''} onChange={(e) => setF((p) => ({ ...p, counterparty_name: e.target.value }))} />
          <Input type="email" placeholder="Counterparty email" value={f.counterparty_email ?? ''} onChange={(e) => setF((p) => ({ ...p, counterparty_email: e.target.value }))} />
          <Input type="number" placeholder="Value (optional)" value={f.value ?? ''} onChange={(e) => setF((p) => ({ ...p, value: e.target.value }))} />
          <Textarea placeholder="Body / terms (markdown)" className="col-span-full" rows={3} value={f.body_markdown ?? ''} onChange={(e) => setF((p) => ({ ...p, body_markdown: e.target.value }))} />
          <div className="col-span-full flex gap-2"><Button size="sm" className="rounded-full" onClick={create} disabled={busy || !f.title}>Create</Button><Button size="sm" variant="ghost" className="rounded-full" onClick={() => setAdding(false)}>Cancel</Button></div>
        </CardContent></Card>
      ) : <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAdding(true)}><FileSignature className="mr-1.5 h-4 w-4" /> New transaction document</Button>)}

      {(rows ?? []).length === 0 ? <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No transaction documents yet. Create a Memorandum of Sale or agency agreement and send it for e-signature.</div> : (
        <Card><CardContent className="p-0"><div className="divide-y divide-border">
          {(rows ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.title}</div>
                <div className="text-xs text-muted-foreground capitalize">{(c.contract_type ?? '').replace(/_/g, ' ')}{c.counterparty_name ? ` · ${c.counterparty_name}` : ''}</div>
              </div>
              <Badge className={`rounded-full border-0 text-[11px] capitalize ${c.status === 'signed' ? 'bg-emerald-500/15 text-emerald-500' : c.status === 'sent' ? 'bg-amber-500/15 text-amber-500' : 'bg-muted text-muted-foreground'}`}>{c.status}</Badge>
              {canEdit && c.status === 'draft' && <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => send(c.id)}><Send className="mr-1 h-3.5 w-3.5" /> Send</Button>}
            </div>
          ))}
        </div></CardContent></Card>
      )}
    </div>
  );
};

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
