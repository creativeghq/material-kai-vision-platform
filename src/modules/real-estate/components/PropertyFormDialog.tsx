import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { MoneyInput } from '@/components/core/ui/money-input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  realEstateService, type Property, type PropertyType, type TransactionType, type ListingStatus,
} from '../services/realEstateService';

/**
 * Create / edit a real property record, from anywhere a party owns one (today: the CRM contact
 * page). This replaces the three flat `owned_property_*` fields that used to stand in for "the
 * contact's property" — those could only ever describe ONE property and fed nothing but a
 * valuation lead, so a contact with two flats had nowhere to put the second.
 *
 * Only the fields that actually identify and price a property are here; the full ~110-column
 * workbench lives on `/properties/:id`, which this dialog links to after saving.
 */

const PROPERTY_TYPES: Array<{ value: PropertyType; label: string }> = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'land', label: 'Land / plot' },
  { value: 'other', label: 'Other' },
];

const TRANSACTION_TYPES: Array<{ value: TransactionType; label: string }> = [
  { value: 'sale', label: 'For sale' },
  { value: 'rent', label: 'For rent' },
  { value: 'short_let', label: 'Short let' },
  { value: 'business_transfer', label: 'Business transfer' },
  { value: 'auction', label: 'Auction' },
];

const LISTING_STATUSES: Array<{ value: ListingStatus; label: string }> = [
  { value: 'draft', label: 'Draft — not listed' },
  { value: 'active', label: 'Active listing' },
  { value: 'under_offer', label: 'Under offer' },
  { value: 'sold', label: 'Sold' },
  { value: 'rented', label: 'Rented' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const CONDITIONS = ['newly_built', 'renovated', 'good', 'needs_renovation', 'unfinished'];
const ENERGY_CLASSES = ['A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F', 'G', 'exempt', 'pending'];
const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF'];

/** Values the dialog binds. Numbers stay numbers so MoneyInput can parse EU formats. */
export interface PropertyFormValues {
  title: string;
  property_type: PropertyType;
  subtype: string;
  transaction_type: TransactionType;
  listing_status: ListingStatus;
  price: number | null;
  currency: string;
  address: string;
  street_number: string;
  town: string;
  region: string;
  postcode: string;
  country_code: string;
  area_built: number | null;
  area_plot: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: string;
  year_built: number | null;
  condition: string;
  energy_class: string;
  description: string;
}

const EMPTY: PropertyFormValues = {
  title: '', property_type: 'residential', subtype: '', transaction_type: 'sale', listing_status: 'draft',
  price: null, currency: 'EUR', address: '', street_number: '', town: '', region: '', postcode: '', country_code: 'GR',
  area_built: null, area_plot: null, bedrooms: null, bathrooms: null, floor: '', year_built: null,
  condition: '', energy_class: '', description: '',
};

/** Project a loaded property row back onto the form shape (edit mode). */
export function propertyToForm(p: Record<string, any>): PropertyFormValues {
  return {
    ...EMPTY,
    title: p.title ?? '',
    property_type: (p.property_type as PropertyType) ?? 'residential',
    subtype: p.subtype ?? '',
    transaction_type: (p.transaction_type as TransactionType) ?? 'sale',
    listing_status: (p.listing_status as ListingStatus) ?? 'draft',
    price: p.price != null ? Number(p.price) : null,
    currency: p.currency ?? 'EUR',
    address: p.address ?? '', street_number: p.street_number ?? '',
    town: p.town ?? '', region: p.region ?? '', postcode: p.postcode ?? '', country_code: p.country_code ?? 'GR',
    area_built: p.area_built != null ? Number(p.area_built) : null,
    area_plot: p.area_plot != null ? Number(p.area_plot) : null,
    bedrooms: p.bedrooms ?? null, bathrooms: p.bathrooms ?? null,
    floor: p.floor ?? '', year_built: p.year_built ?? null,
    condition: p.condition ?? '', energy_class: p.energy_class ?? '',
    description: p.description_i18n?.en ?? '',
  };
}

const NONE = '__none__';

export const PropertyFormDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  /** Edit an existing listing; omit to create a new one. */
  propertyId?: string | null;
  /** CRM person this property belongs to — stamped as the vendor on create. */
  vendorContactId?: string | null;
  /** Prefill for a brand-new record (e.g. from a public valuation request). */
  initial?: Partial<PropertyFormValues>;
  onSaved?: (property: Property) => void;
}> = ({ open, onOpenChange, workspaceId, propertyId, vendorContactId, initial, onSaved }) => {
  const { toast } = useToast();
  const [f, setF] = useState<PropertyFormValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = <K extends keyof PropertyFormValues>(k: K, v: PropertyFormValues[K]) => setF((p) => ({ ...p, [k]: v }));

  // Seed on open: load the row when editing, else start from the caller's prefill.
  useEffect(() => {
    if (!open) return;
    if (!propertyId || !workspaceId) { setF({ ...EMPTY, ...initial }); return; }
    setLoading(true);
    realEstateService.getProperty(workspaceId, propertyId)
      .then((r) => setF(propertyToForm(r.property)))
      .catch((e) => toast({ title: 'Could not load the property', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, propertyId, workspaceId]);

  const isLand = f.property_type === 'land';
  const isResidential = f.property_type === 'residential';

  const save = async () => {
    if (!workspaceId) return;
    if (!f.title.trim() && !f.address.trim()) {
      toast({ title: 'Give it a name or an address', description: 'A property needs at least a title or a street address so it can be told apart.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Allowlisted payload — the edge function picks from PROPERTY_WRITABLE, and identity fields
      // (workspace, creator, tokens) are set server-side.
      const payload: Record<string, unknown> = {
        title: f.title.trim() || null,
        property_type: f.property_type,
        subtype: f.subtype.trim() || null,
        transaction_type: f.transaction_type,
        listing_status: f.listing_status,
        price: f.price,
        currency: f.currency,
        address: f.address.trim() || null,
        street_number: f.street_number.trim() || null,
        town: f.town.trim() || null,
        region: f.region.trim() || null,
        postcode: f.postcode.trim() || null,
        country_code: f.country_code.trim() || null,
        area_built: f.area_built,
        area_plot: f.area_plot,
        bedrooms: f.bedrooms,
        bathrooms: f.bathrooms,
        floor: f.floor.trim() || null,
        year_built: f.year_built,
        condition: f.condition || null,
        energy_class: f.energy_class || null,
        description_i18n: f.description.trim() ? { en: f.description.trim() } : {},
      };
      const property = propertyId
        ? await realEstateService.updateProperty(workspaceId, propertyId, payload)
        : await realEstateService.createProperty(workspaceId, { ...payload, vendor_contact_id: vendorContactId ?? null });
      toast({ title: propertyId ? 'Property updated' : 'Property added' });
      onSaved?.(property);
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const intField = (label: string, key: 'bedrooms' | 'bathrooms' | 'year_built') => (
    <Fld label={label}>
      <Input type="number" value={f[key] ?? ''} onChange={(e) => set(key, e.target.value === '' ? null : Number(e.target.value))} />
    </Fld>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{propertyId ? 'Edit property' : 'Add property'}</DialogTitle>
          <DialogDescription>
            Saved as a real listing record — open it afterwards for photos, viewings, offers and the full spec.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-5 py-1">
            <Section title="What it is">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Fld label="Title" className="sm:col-span-2">
                  <Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. 2-bed apartment, Kolonaki" />
                </Fld>
                <Fld label="Type">
                  <Select value={f.property_type} onValueChange={(v) => set('property_type', v as PropertyType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PROPERTY_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Fld>
                <Fld label="Subtype">
                  <Input value={f.subtype} onChange={(e) => set('subtype', e.target.value)} placeholder="apartment / maisonette / shop…" />
                </Fld>
                <Fld label="Transaction">
                  <Select value={f.transaction_type} onValueChange={(v) => set('transaction_type', v as TransactionType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TRANSACTION_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Fld>
                <Fld label="Status">
                  <Select value={f.listing_status} onValueChange={(v) => set('listing_status', v as ListingStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LISTING_STATUSES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Fld>
              </div>
            </Section>

            <Section title="Price">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Fld label="Asking price" className="col-span-2">
                  <MoneyInput value={f.price} onValueChange={(v) => set('price', v)} placeholder="0.00" />
                </Fld>
                <Fld label="Currency">
                  <Select value={f.currency} onValueChange={(v) => set('currency', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Fld>
              </div>
            </Section>

            <Section title="Where it is">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Fld label="Street" className="col-span-2 sm:col-span-2">
                  <Input value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Street name" />
                </Fld>
                <Fld label="Number"><Input value={f.street_number} onChange={(e) => set('street_number', e.target.value)} /></Fld>
                <Fld label="Town / area"><Input value={f.town} onChange={(e) => set('town', e.target.value)} /></Fld>
                <Fld label="Region"><Input value={f.region} onChange={(e) => set('region', e.target.value)} /></Fld>
                <Fld label="Postcode"><Input value={f.postcode} onChange={(e) => set('postcode', e.target.value)} /></Fld>
                <Fld label="Country code"><Input value={f.country_code} onChange={(e) => set('country_code', e.target.value.toUpperCase())} maxLength={2} placeholder="GR" /></Fld>
              </div>
            </Section>

            <Section title="Size & condition">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {!isLand && (
                  <Fld label="Built area (m²)">
                    <MoneyInput value={f.area_built} onValueChange={(v) => set('area_built', v)} displayDecimals={null} />
                  </Fld>
                )}
                <Fld label="Plot area (m²)">
                  <MoneyInput value={f.area_plot} onValueChange={(v) => set('area_plot', v)} displayDecimals={null} />
                </Fld>
                {isResidential && intField('Bedrooms', 'bedrooms')}
                {isResidential && intField('Bathrooms', 'bathrooms')}
                {!isLand && <Fld label="Floor"><Input value={f.floor} onChange={(e) => set('floor', e.target.value)} placeholder="e.g. 3 / ground" /></Fld>}
                {!isLand && intField('Year built', 'year_built')}
                {!isLand && (
                  <Fld label="Condition">
                    <Select value={f.condition || NONE} onValueChange={(v) => set('condition', v === NONE ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>—</SelectItem>
                        {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Fld>
                )}
                {!isLand && (
                  <Fld label="Energy class">
                    <Select value={f.energy_class || NONE} onValueChange={(v) => set('energy_class', v === NONE ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>—</SelectItem>
                        {ENERGY_CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Fld>
                )}
              </div>
            </Section>

            <Section title="Notes">
              <Textarea rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Anything worth remembering about this property…" />
            </Section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            {propertyId ? 'Save changes' : 'Add property'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
    {children}
  </div>
);

const Fld: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className, children }) => (
  <div className={className}>
    <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);
