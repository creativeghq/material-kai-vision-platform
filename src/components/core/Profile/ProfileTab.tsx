import React, { useState, useEffect, useRef } from 'react';
import {
  User, Pencil, Save, Loader2, X, Camera, Globe, MapPin, Building2,
  Briefcase, Eye, EyeOff, Plus, Trash2, Copy, Check, Star, Tag,
  ChevronsUpDown, DollarSign, Link as LinkIcon, ChevronDown, ChevronUp, ExternalLink,
  ChevronLeft, ChevronRight, CalendarDays,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/core/ui/avatar';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/core/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import { PROFESSIONAL_TYPE_LABELS } from '@/lib/materialCategories';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

type ProfessionalType =
  | 'designer' | 'interior_designer' | 'architect' | 'manufacturer'
  | 'brand' | 'supplier' | 'sourcing_agent' | 'consultant' | 'other' | null;

// ─── Country codes ────────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+1',   flag: '🇺🇸', name: 'United States' },
  { code: '+1',   flag: '🇨🇦', name: 'Canada' },
  { code: '+44',  flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+61',  flag: '🇦🇺', name: 'Australia' },
  { code: '+64',  flag: '🇳🇿', name: 'New Zealand' },
  { code: '+353', flag: '🇮🇪', name: 'Ireland' },
  { code: '+49',  flag: '🇩🇪', name: 'Germany' },
  { code: '+33',  flag: '🇫🇷', name: 'France' },
  { code: '+34',  flag: '🇪🇸', name: 'Spain' },
  { code: '+39',  flag: '🇮🇹', name: 'Italy' },
  { code: '+31',  flag: '🇳🇱', name: 'Netherlands' },
  { code: '+32',  flag: '🇧🇪', name: 'Belgium' },
  { code: '+41',  flag: '🇨🇭', name: 'Switzerland' },
  { code: '+43',  flag: '🇦🇹', name: 'Austria' },
  { code: '+46',  flag: '🇸🇪', name: 'Sweden' },
  { code: '+47',  flag: '🇳🇴', name: 'Norway' },
  { code: '+45',  flag: '🇩🇰', name: 'Denmark' },
  { code: '+358', flag: '🇫🇮', name: 'Finland' },
  { code: '+351', flag: '🇵🇹', name: 'Portugal' },
  { code: '+30',  flag: '🇬🇷', name: 'Greece' },
  { code: '+48',  flag: '🇵🇱', name: 'Poland' },
  { code: '+420', flag: '🇨🇿', name: 'Czech Republic' },
  { code: '+36',  flag: '🇭🇺', name: 'Hungary' },
  { code: '+40',  flag: '🇷🇴', name: 'Romania' },
  { code: '+7',   flag: '🇷🇺', name: 'Russia' },
  { code: '+380', flag: '🇺🇦', name: 'Ukraine' },
  { code: '+90',  flag: '🇹🇷', name: 'Turkey' },
  { code: '+972', flag: '🇮🇱', name: 'Israel' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+20',  flag: '🇪🇬', name: 'Egypt' },
  { code: '+27',  flag: '🇿🇦', name: 'South Africa' },
  { code: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+254', flag: '🇰🇪', name: 'Kenya' },
  { code: '+91',  flag: '🇮🇳', name: 'India' },
  { code: '+92',  flag: '🇵🇰', name: 'Pakistan' },
  { code: '+880', flag: '🇧🇩', name: 'Bangladesh' },
  { code: '+94',  flag: '🇱🇰', name: 'Sri Lanka' },
  { code: '+86',  flag: '🇨🇳', name: 'China' },
  { code: '+81',  flag: '🇯🇵', name: 'Japan' },
  { code: '+82',  flag: '🇰🇷', name: 'South Korea' },
  { code: '+66',  flag: '🇹🇭', name: 'Thailand' },
  { code: '+65',  flag: '🇸🇬', name: 'Singapore' },
  { code: '+60',  flag: '🇲🇾', name: 'Malaysia' },
  { code: '+62',  flag: '🇮🇩', name: 'Indonesia' },
  { code: '+63',  flag: '🇵🇭', name: 'Philippines' },
  { code: '+84',  flag: '🇻🇳', name: 'Vietnam' },
  { code: '+55',  flag: '🇧🇷', name: 'Brazil' },
  { code: '+54',  flag: '🇦🇷', name: 'Argentina' },
  { code: '+56',  flag: '🇨🇱', name: 'Chile' },
  { code: '+57',  flag: '🇨🇴', name: 'Colombia' },
  { code: '+52',  flag: '🇲🇽', name: 'Mexico' },
];

function parsePhone(raw: string): { dialCode: string; number: string } {
  const match = COUNTRY_CODES.map(c => c.code).find(c => raw.startsWith(c + ' ') || raw.startsWith(c));
  if (match) {
    return { dialCode: match, number: raw.slice(match.length).trimStart() };
  }
  return { dialCode: '+1', number: raw };
}

// ─── Phone input with country code dropdown ───────────────────────────────────
function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { dialCode, number } = parsePhone(value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = COUNTRY_CODES.find(c => c.code === dialCode) ?? COUNTRY_CODES[0];

  const filtered = search
    ? COUNTRY_CODES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search)
      )
    : COUNTRY_CODES;

  const setDialCode = (code: string) => {
    onChange(`${code} ${number}`);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 h-10 px-3 rounded-md border bg-background text-sm hover:bg-accent transition-colors shrink-0"
          >
            <span className="text-base leading-none">{selected.flag}</span>
            <span className="text-muted-foreground">{selected.code}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-2 border-b">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search country…"
              className="w-full text-sm outline-none bg-transparent placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setDialCode(c.code)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left ${c.code === dialCode ? 'bg-primary/10 text-primary' : ''}`}
              >
                <span className="text-base">{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-muted-foreground text-xs">{c.code}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        value={number}
        onChange={e => onChange(`${dialCode} ${e.target.value}`)}
        placeholder="555 123 4567"
        className="flex-1"
      />
    </div>
  );
}

// ─── Location autocomplete via Nominatim (OpenStreetMap) ─────────────────────
interface NominatimResult { display_name: string; }

function LocationAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 3) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=6&featuretype=city`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data: NominatimResult[] = await res.json();
        // Simplify to "City, Country" format
        const seen = new Set<string>();
        const results: string[] = [];
        for (const r of data) {
          const parts = r.display_name.split(',');
          const simplified = parts.length >= 2
            ? `${parts[0].trim()}, ${parts[parts.length - 1].trim()}`
            : r.display_name;
          if (!seen.has(simplified)) { seen.add(simplified); results.push(simplified); }
        }
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch { /* ignore */ }
      setLoading(false);
    }, 400);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (s: string) => { setQuery(s); onChange(s); setOpen(false); setSuggestions([]); };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />}
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Search city or country…"
          className="pl-9"
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-card shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => select(s)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface PersonalData {
  full_name: string; company: string; phone: string; address: string;
  bio: string; avatar_url: string; location: string; website_url: string;
  professional_type: ProfessionalType;
}

export interface ServiceItem {
  id: string;
  name: string;
  description?: string;
  price?: string;
  previous_work?: { title: string; url?: string }[];
}

interface FactoryOption { name: string; source: string; }

const EMPTY_PERSONAL: PersonalData = {
  full_name: '', company: '', phone: '', address: '',
  bio: '', avatar_url: '', location: '', website_url: '',
  professional_type: null,
};

const EMPTY_SERVICE: Omit<ServiceItem, 'id'> = {
  name: '', description: '', price: '', previous_work: [],
};

// ─── Searchable combobox ──────────────────────────────────────────────────────
function SearchCombobox({
  options, value, onSelect, placeholder = 'Search…', emptyText = 'No results.',
}: {
  options: { value: string; label: string; sub?: string }[];
  value: string; onSelect: (v: string) => void;
  placeholder?: string; emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open}
          className="w-full justify-between font-normal text-sm">
          <span className={selected ? '' : 'text-muted-foreground'}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label}
                  onSelect={() => { onSelect(o.value); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 ${value === o.value ? 'opacity-100' : 'opacity-0'}`} />
                  <div>
                    <p className="text-sm">{o.label}</p>
                    {o.sub && <p className="text-xs text-muted-foreground">{o.sub}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Service form (add / edit) ────────────────────────────────────────────────
function ServiceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Omit<ServiceItem, 'id'>;
  onSave: (data: Omit<ServiceItem, 'id'>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [newWorkTitle, setNewWorkTitle] = useState('');
  const [newWorkUrl, setNewWorkUrl] = useState('');

  const addWork = () => {
    if (!newWorkTitle.trim()) return;
    setForm((p) => ({
      ...p,
      previous_work: [...(p.previous_work ?? []), { title: newWorkTitle.trim(), url: newWorkUrl.trim() || undefined }],
    }));
    setNewWorkTitle('');
    setNewWorkUrl('');
  };

  const removeWork = (i: number) =>
    setForm((p) => ({ ...p, previous_work: p.previous_work?.filter((_, idx) => idx !== i) }));

  return (
    <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Service name *</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Interior Design Consultation" autoFocus />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Price
          </label>
          <Input value={form.price ?? ''} onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="e.g. from €500, €80/hr, on request" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs text-muted-foreground">Description</label>
          <Textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Describe what's included in this service…" rows={2} className="resize-none" />
        </div>
      </div>

      {/* Previous work */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          <LinkIcon className="h-3 w-3" /> Previous Work
        </label>
        {(form.previous_work ?? []).map((w, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {w.url ? (
              <a href={w.url} target="_blank" rel="noopener noreferrer"
                className="text-primary hover:underline flex-1 truncate">{w.title}</a>
            ) : (
              <span className="flex-1 truncate">{w.title}</span>
            )}
            <button onClick={() => removeWork(i)} className="text-muted-foreground hover:text-destructive shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input value={newWorkTitle} onChange={(e) => setNewWorkTitle(e.target.value)}
            placeholder="Project title" className="flex-1 text-sm h-8" />
          <Input value={newWorkUrl} onChange={(e) => setNewWorkUrl(e.target.value)}
            placeholder="URL (optional)" className="flex-1 text-sm h-8" />
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={addWork}
            disabled={!newWorkTitle.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={!form.name.trim()}>
          <Save className="h-3.5 w-3.5 mr-1.5" /> Save Service
        </Button>
      </div>
    </div>
  );
}

// ─── Service card (display) ───────────────────────────────────────────────────
function ServiceCard({
  service,
  onEdit,
  onDelete,
}: {
  service: ServiceItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = service.description || (service.previous_work?.length ?? 0) > 0;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{service.name}</p>
            {service.price && (
              <Badge variant="secondary" className="mt-1 text-xs gap-1">
                <DollarSign className="h-2.5 w-2.5" />{service.price}
              </Badge>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {service.description && !expanded && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{service.description}</p>
        )}
      </div>

      {hasDetails && (
        <>
          {expanded && (
            <div className="px-4 pb-3 space-y-3 border-t pt-3">
              {service.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{service.description}</p>
              )}
              {(service.previous_work?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Previous Work</p>
                  <div className="space-y-1">
                    {service.previous_work!.map((w, i) => (
                      <div key={i}>
                        {w.url ? (
                          <a href={w.url} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1">
                            <LinkIcon className="h-3 w-3 shrink-0" />{w.title}
                          </a>
                        ) : (
                          <p className="text-sm">{w.title}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground border-t bg-muted/20 hover:bg-muted/40 transition-colors"
          >
            {expanded ? <><ChevronUp className="h-3 w-3" />Show less</> : <><ChevronDown className="h-3 w-3" />Show details</>}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export const ProfileTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [personal, setPersonal] = useState<PersonalData>(EMPTY_PERSONAL);
  const [personalForm, setPersonalForm] = useState<PersonalData>(EMPTY_PERSONAL);
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);

  const [isPublic, setIsPublic] = useState(false);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [factories, setFactories] = useState<{ name: string; country?: string }[]>([]);
  const [skillTags, setSkillTags] = useState<string[]>([]);
  const [featuredMoodboardId, setFeaturedMoodboardId] = useState<string | null>(null);
  const [profileViews, setProfileViews] = useState(0);

  const [addingService, setAddingService] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [addingFactory, setAddingFactory] = useState(false);
  const [addingSkill, setAddingSkill] = useState(false);
  const [editingFeatured, setEditingFeatured] = useState(false);

  const [newSkill, setNewSkill] = useState('');
  const [selectedFactoryName, setSelectedFactoryName] = useState('');

  const [moodboards, setMoodboards] = useState<{ id: string; title: string }[]>([]);
  const [factoryOptions, setFactoryOptions] = useState<FactoryOption[]>([]);

  const [factoryVerified, setFactoryVerified] = useState(false);
  const [factoryClaimedName, setFactoryClaimedName] = useState<string | null>(null);
  const [regRequest, setRegRequest] = useState<{ status: string; rejection_reason?: string | null } | null>(null);
  const [showRegForm, setShowRegForm] = useState(false);
  const [regForm, setRegForm] = useState({ company_name: '', factory_claimed_name: '', message: '' });
  const [regSubmitting, setRegSubmitting] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([loadProfile(), loadMoodboards(), loadFactoryOptions(), loadRegistrationRequest()]);
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select(
        'full_name, company, phone, address, bio, avatar_url, location, website_url, professional_type,' +
        'is_public, services, services_detail, preferred_factories, skill_tags, featured_moodboard_id, profile_views,' +
        'factory_verified, factory_claimed_name'
      )
      .eq('user_id', user.id)
      .maybeSingle();
    if (!data) return;

    const p: PersonalData = {
      full_name: data.full_name || '', company: data.company || '',
      phone: data.phone || '', address: data.address || '',
      bio: data.bio || '', avatar_url: data.avatar_url || '',
      location: data.location || '', website_url: data.website_url || '',
      professional_type: (data.professional_type as ProfessionalType) ?? null,
    };
    setPersonal(p); setPersonalForm(p);
    setIsPublic(data.is_public ?? false);
    setServices((data.services_detail as ServiceItem[]) ?? []);
    setFactories((data.preferred_factories as { name: string; country?: string }[]) ?? []);
    setSkillTags(data.skill_tags ?? []);
    setFeaturedMoodboardId(data.featured_moodboard_id ?? null);
    setProfileViews(data.profile_views ?? 0);
    setFactoryVerified(data.factory_verified ?? false);
    setFactoryClaimedName(data.factory_claimed_name ?? null);
  };

  const loadMoodboards = async () => {
    if (!user) return;
    const { data } = await supabase.from('moodboards').select('id, title')
      .eq('user_id', user.id).order('updated_at', { ascending: false });
    if (data) setMoodboards(data);
  };

  const loadRegistrationRequest = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('factory_registration_requests')
      .select('status, rejection_reason')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setRegRequest(data);
  };

  const loadFactoryOptions = async () => {
    const { data } = await supabase.rpc('get_distinct_factory_names');
    if (data) setFactoryOptions(data as FactoryOption[]);
  };

  const patch = async (fields: Record<string, unknown>) => {
    if (!user) return false;
    const { error } = await supabase.from('user_profiles')
      .update({ ...fields, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    if (error) { toast({ title: 'Error', description: 'Could not save.', variant: 'destructive' }); return false; }
    return true;
  };

  const savePersonal = async () => {
    if (!user) return;
    setSavingPersonal(true);
    const ok = await patch({
      full_name: personalForm.full_name, company: personalForm.company,
      phone: personalForm.phone, address: personalForm.address,
      bio: personalForm.bio, location: personalForm.location,
      website_url: personalForm.website_url, professional_type: personalForm.professional_type,
    });
    if (ok) { setPersonal({ ...personalForm }); setEditingPersonal(false); toast({ title: 'Profile updated' }); }
    setSavingPersonal(false);
  };

  const handleVisibilityToggle = async (checked: boolean) => {
    setIsPublic(checked);
    const ok = await patch({ is_public: checked });
    if (!ok) {
      setIsPublic(!checked);
    } else {
      toast({ title: checked ? 'Profile is now public' : 'Profile is now private' });
      if (checked && user) {
        flowEventService.emit('profile_published', {
          user_id: user.id,
          published_at: new Date().toISOString(),
        });
      }
    }
  };

  // ── Services ──────────────────────────────────────────────────
  const saveServicesTo = async (next: ServiceItem[]) => {
    setServices(next);
    // Keep text[] in sync for search/discover filtering
    await patch({ services_detail: next, services: next.map((s) => s.name) });
  };

  const addService = async (data: Omit<ServiceItem, 'id'>) => {
    const item: ServiceItem = { ...data, id: crypto.randomUUID() };
    await saveServicesTo([...services, item]);
    setAddingService(false);
  };

  const updateService = async (id: string, data: Omit<ServiceItem, 'id'>) => {
    await saveServicesTo(services.map((s) => s.id === id ? { ...data, id } : s));
    setEditingServiceId(null);
  };

  const deleteService = async (id: string) => {
    await saveServicesTo(services.filter((s) => s.id !== id));
  };

  // ── Skill tags ────────────────────────────────────────────────
  const addSkill = async () => {
    const t = newSkill.trim();
    if (!t || skillTags.includes(t)) return;
    const next = [...skillTags, t];
    setSkillTags(next); setNewSkill('');
    await patch({ skill_tags: next });
  };

  const removeSkill = async (t: string) => {
    const next = skillTags.filter((x) => x !== t);
    setSkillTags(next); await patch({ skill_tags: next });
  };

  // ── Factory registration ──────────────────────────────────────
  const submitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !regForm.company_name.trim() || !regForm.factory_claimed_name.trim()) return;
    setRegSubmitting(true);
    try {
      const { error } = await supabase.from('factory_registration_requests').insert({
        user_id: user.id,
        company_name: regForm.company_name.trim(),
        factory_claimed_name: regForm.factory_claimed_name.trim(),
        professional_type: personal.professional_type ?? '',
        message: regForm.message.trim() || null,
      });
      if (error) throw error;
      setRegRequest({ status: 'pending' });
      setShowRegForm(false);
      toast({ title: 'Registration submitted', description: 'An admin will review your request.' });
    } catch {
      toast({ title: 'Submission failed', description: 'Could not submit registration.', variant: 'destructive' });
    } finally {
      setRegSubmitting(false);
    }
  };

  // ── Factories ─────────────────────────────────────────────────
  const addFactory = async () => {
    if (!selectedFactoryName || factories.some((f) => f.name === selectedFactoryName)) return;
    const next = [...factories, { name: selectedFactoryName }];
    const factoryToAdd = selectedFactoryName;
    setFactories(next); setSelectedFactoryName(''); setAddingFactory(false);
    const ok = await patch({ preferred_factories: next });
    if (ok && user) {
      flowEventService.emit('preferred_factory_added', {
        user_id: user.id,
        factory_name: factoryToAdd,
        added_at: new Date().toISOString(),
      });
    }
  };

  const removeFactory = async (i: number) => {
    const next = factories.filter((_, idx) => idx !== i);
    setFactories(next); await patch({ preferred_factories: next });
  };

  const saveFeatured = async (id: string | null) => {
    setFeaturedMoodboardId(id); setEditingFeatured(false);
    await patch({ featured_moodboard_id: id });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';
    if (file.size > MAX_AVATAR_SIZE) { toast({ title: 'File too large', description: 'Max 2MB.', variant: 'destructive' }); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('profile-avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from('user_profiles').update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq('user_id', user.id);
      setPersonal((p) => ({ ...p, avatar_url: publicUrl }));
      setPersonalForm((p) => ({ ...p, avatar_url: publicUrl }));
      toast({ title: 'Avatar updated' });
    } catch { toast({ title: 'Upload failed', variant: 'destructive' }); }
    finally { setUploading(false); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/u/${user?.id}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const initials = (personal.full_name || user?.email || '?')
    .split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

  const factoryComboOptions = factoryOptions
    .filter((f) => !factories.some((ex) => ex.name === f.name))
    .map((f) => ({ value: f.name, label: f.name, sub: f.source === 'import' ? 'Import' : 'Product catalog' }));

  const moodboardOptions = [
    { value: '', label: 'None' },
    ...moodboards.map((m) => ({ value: m.id, label: m.title })),
  ];

  return (
    <div className="space-y-6">

      {/* Visibility */}
      <Card className={`rounded-2xl border-2 transition-colors ${isPublic ? 'border-primary/30' : ''}`}>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isPublic ? <Eye className="h-5 w-5 text-primary shrink-0" /> : <EyeOff className="h-5 w-5 text-muted-foreground shrink-0" />}
              <div>
                <p className="font-medium text-sm">{isPublic ? 'Public Profile' : 'Private Profile'}</p>
                <p className="text-xs text-muted-foreground">
                  {isPublic ? 'Anyone can discover and view your profile.' : 'Only you can see your profile.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {isPublic && (
                <>
                  <Button size="sm" variant="outline" asChild className="gap-1.5">
                    <Link to={`/u/${user?.id}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Preview
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied!' : 'Copy link'}
                  </Button>
                </>
              )}
              <Switch id="visibility" checked={isPublic} onCheckedChange={handleVisibilityToggle} />
              <Label htmlFor="visibility" className="text-sm cursor-pointer">{isPublic ? 'Public' : 'Private'}</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Avatar + name */}
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="relative group shrink-0">
              <Avatar className="h-16 w-16">
                {personal.avatar_url && <AvatarImage src={personal.avatar_url} alt="Profile" />}
                <AvatarFallback className="bg-primary/20 text-xl font-semibold text-primary">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </button>
            <div>
              <p className="text-lg font-semibold">{personal.full_name || 'No name set'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              {personal.company && <p className="text-sm text-muted-foreground">{personal.company}</p>}
              {personal.professional_type && (
                <Badge className="mt-1 text-xs bg-primary/10 text-primary border-primary/20">
                  {PROFESSIONAL_TYPE_LABELS[personal.professional_type]}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal information */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />Personal Information
            </CardTitle>
            {!editingPersonal ? (
              <Button size="sm" onClick={() => { setPersonalForm({ ...personal }); setEditingPersonal(true); }}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingPersonal(false)}><X className="h-3.5 w-3.5 mr-1.5" />Cancel</Button>
                <Button size="sm" onClick={savePersonal} disabled={savingPersonal}>
                  {savingPersonal ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}Save
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingPersonal ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Full Name"><Input value={personalForm.full_name} onChange={(e) => setPersonalForm({ ...personalForm, full_name: e.target.value })} placeholder="John Doe" /></Field>
              <Field label="Email Address"><Input value={user?.email || ''} disabled className="opacity-60" /></Field>
              <Field label="Phone Number">
                <PhoneInput
                  value={personalForm.phone}
                  onChange={(v) => setPersonalForm({ ...personalForm, phone: v })}
                />
              </Field>
              <Field label="Company"><Input value={personalForm.company} onChange={(e) => setPersonalForm({ ...personalForm, company: e.target.value })} placeholder="Acme Inc." /></Field>
              <Field label={<span className="flex items-center gap-1"><MapPin className="h-3 w-3" />Location</span>}>
                <LocationAutocomplete
                  value={personalForm.location}
                  onChange={(v) => setPersonalForm({ ...personalForm, location: v })}
                />
              </Field>
              <Field label={<span className="flex items-center gap-1"><Globe className="h-3 w-3" />Website</span>}>
                <Input value={personalForm.website_url} onChange={(e) => setPersonalForm({ ...personalForm, website_url: e.target.value })} placeholder="https://yourwebsite.com" />
              </Field>
              <Field label="Professional Type">
                <SearchCombobox
                  options={Object.entries(PROFESSIONAL_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                  value={personalForm.professional_type ?? ''}
                  onSelect={(v) => setPersonalForm({ ...personalForm, professional_type: (v as ProfessionalType) || null })}
                  placeholder="Select type…"
                />
              </Field>
              <Field label="Address" className="md:col-span-2">
                <Input value={personalForm.address} onChange={(e) => setPersonalForm({ ...personalForm, address: e.target.value })} placeholder="123 Main St, City, Country" />
              </Field>
              <Field label="Bio" className="md:col-span-2">
                <Textarea value={personalForm.bio} onChange={(e) => setPersonalForm({ ...personalForm, bio: e.target.value })} placeholder="Tell us about yourself..." rows={3} />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 gap-x-8">
              <FieldDisplay label="Full Name" value={personal.full_name} />
              <FieldDisplay label="Email Address" value={user?.email || ''} />
              <FieldDisplay label="Professional Type" value={personal.professional_type ? PROFESSIONAL_TYPE_LABELS[personal.professional_type] : ''} />
              <FieldDisplay label="Phone Number" value={personal.phone} />
              <FieldDisplay label="Company" value={personal.company} />
              <FieldDisplay label="Location" value={personal.location} />
              <FieldDisplay label="Website" value={personal.website_url} />
              <FieldDisplay label="Address" value={personal.address} />
              <FieldDisplay label="Bio" value={personal.bio} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Services */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />Services
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => { setAddingService(true); setEditingServiceId(null); }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Service
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {services.map((svc) =>
            editingServiceId === svc.id ? (
              <ServiceForm
                key={svc.id}
                initial={{ name: svc.name, description: svc.description, price: svc.price, previous_work: svc.previous_work }}
                onSave={(data) => updateService(svc.id, data)}
                onCancel={() => setEditingServiceId(null)}
              />
            ) : (
              <ServiceCard
                key={svc.id}
                service={svc}
                onEdit={() => { setEditingServiceId(svc.id); setAddingService(false); }}
                onDelete={() => deleteService(svc.id)}
              />
            )
          )}
          {addingService && (
            <ServiceForm
              initial={EMPTY_SERVICE}
              onSave={addService}
              onCancel={() => setAddingService(false)}
            />
          )}
          {services.length === 0 && !addingService && (
            <p className="text-sm text-muted-foreground">No services added yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Skill Tags */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-primary" />Skills & Expertise</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setAddingSkill((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Skill
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {skillTags.map((t) => (
              <Badge key={t} className="text-sm px-3 py-1 gap-2 bg-primary/10 text-primary border-primary/20">
                {t}
                <button type="button" onClick={() => removeSkill(t)} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
            {skillTags.length === 0 && !addingSkill && <p className="text-sm text-muted-foreground">No skills added yet.</p>}
          </div>
          {addingSkill && (
            <div className="flex gap-2 pt-1">
              <Input value={newSkill} onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                placeholder="e.g. AutoCAD, Sustainability, Textiles…" className="flex-1" autoFocus />
              <Button size="sm" onClick={addSkill} disabled={!newSkill.trim()}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddingSkill(false); setNewSkill(''); }}><X className="h-4 w-4" /></Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preferred Factories */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />Preferred Factories</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setAddingFactory((v) => !v)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Factory
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {factories.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {factories.map((f, i) => (
                <div key={i} className="flex items-start justify-between p-3 rounded-xl border bg-muted/30">
                  <div>
                    <p className="font-medium text-sm">{f.name}</p>
                    {f.country && <p className="text-xs text-muted-foreground">{f.country}</p>}
                  </div>
                  <button onClick={() => removeFactory(i)} className="text-muted-foreground hover:text-destructive transition-colors ml-2 shrink-0 mt-0.5">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {factories.length === 0 && !addingFactory && (
            <p className="text-sm text-muted-foreground">No preferred factories added yet.</p>
          )}
          {addingFactory && (
            <div className="rounded-xl border p-4 space-y-3 bg-muted/20">
              {factoryComboOptions.length > 0 ? (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">From your product catalog</label>
                  <SearchCombobox
                    options={factoryComboOptions}
                    value={selectedFactoryName}
                    onSelect={setSelectedFactoryName}
                    placeholder="Search factories…"
                    emptyText="No factories found."
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No factory data in catalog yet. Import products to populate this list.
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setAddingFactory(false); setSelectedFactoryName(''); }}>Cancel</Button>
                <Button size="sm" onClick={addFactory} disabled={!selectedFactoryName}>Add Factory</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Factory Verification */}
      {['manufacturer', 'brand', 'supplier'].includes(personal.professional_type ?? '') && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />Factory Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {factoryVerified ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/30">
                <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                  <Check className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">Verified Factory</p>
                  {factoryClaimedName && (
                    <p className="text-xs text-muted-foreground">{factoryClaimedName}</p>
                  )}
                </div>
                <Badge className="ml-auto bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">
                  Verified
                </Badge>
              </div>
            ) : regRequest ? (
              <div className={`p-3 rounded-xl border ${
                regRequest.status === 'pending'
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : regRequest.status === 'approved'
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-destructive/10 border-destructive/30'
              }`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium capitalize">{regRequest.status}</p>
                  <Badge variant={regRequest.status === 'pending' ? 'secondary' : regRequest.status === 'approved' ? 'default' : 'destructive'} className="text-xs">
                    {regRequest.status}
                  </Badge>
                </div>
                {regRequest.status === 'pending' && (
                  <p className="text-xs text-muted-foreground mt-1">Your factory registration is under review.</p>
                )}
                {regRequest.status === 'rejected' && regRequest.rejection_reason && (
                  <p className="text-xs text-muted-foreground mt-1">{regRequest.rejection_reason}</p>
                )}
              </div>
            ) : showRegForm ? (
              <form onSubmit={submitRegistration} className="rounded-xl border p-4 space-y-3 bg-muted/20">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Company name *</label>
                  <Input
                    value={regForm.company_name}
                    onChange={(e) => setRegForm({ ...regForm, company_name: e.target.value })}
                    placeholder={personal.company || 'Your company name'}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Claim factory from catalog *</label>
                  <SearchCombobox
                    options={factoryOptions.map((f) => ({ value: f.name, label: f.name }))}
                    value={regForm.factory_claimed_name}
                    onSelect={(v) => setRegForm({ ...regForm, factory_claimed_name: v })}
                    placeholder="Search factory catalog…"
                    emptyText="No factories found. Enter manually below."
                  />
                  {!regForm.factory_claimed_name && (
                    <Input
                      value={regForm.factory_claimed_name}
                      onChange={(e) => setRegForm({ ...regForm, factory_claimed_name: e.target.value })}
                      placeholder="Or type factory name manually"
                      className="mt-1.5"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Message to admin (optional)</label>
                  <Textarea
                    value={regForm.message}
                    onChange={(e) => setRegForm({ ...regForm, message: e.target.value })}
                    placeholder="Any additional information…"
                    rows={2}
                    className="resize-none"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button size="sm" type="button" variant="ghost" onClick={() => setShowRegForm(false)}>Cancel</Button>
                  <Button size="sm" type="submit" disabled={regSubmitting || !regForm.company_name.trim() || !regForm.factory_claimed_name.trim()}>
                    {regSubmitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Submit Request
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Register your factory to get a verified badge and unlock factory analytics.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setRegForm({ company_name: personal.company || '', factory_claimed_name: '', message: '' });
                    setShowRegForm(true);
                  }}
                >
                  <Building2 className="h-3.5 w-3.5 mr-1.5" />Register as Verified Factory
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Appointment Availability */}
      <AvailabilitySettings />

      {/* Featured Moodboard */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Star className="h-5 w-5 text-primary" />Featured Moodboard</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setEditingFeatured((v) => !v)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />{featuredMoodboardId ? 'Change' : 'Set'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Pin one moodboard to the top of your public profile.</p>
          {!editingFeatured ? (
            <p className="text-sm font-medium">
              {featuredMoodboardId ? moodboards.find((m) => m.id === featuredMoodboardId)?.title ?? 'Pinned board' : '—'}
            </p>
          ) : (
            <div className="space-y-2">
              <SearchCombobox options={moodboardOptions} value={featuredMoodboardId ?? ''}
                onSelect={(v) => saveFeatured(v || null)} placeholder="Select a moodboard…" />
              <Button size="sm" variant="ghost" onClick={() => setEditingFeatured(false)}>Cancel</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile stats */}
      {isPublic && (
        <Card className="rounded-2xl bg-muted/30">
          <CardContent className="pt-5 pb-5 text-center">
            <p className="text-2xl font-bold">{profileViews}</p>
            <p className="text-xs text-muted-foreground">Profile views</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── Availability Settings (calendar-based) ──────────────────────────────────
interface TimeRange { start: string; end: string; }
type DateMap = Map<string, TimeRange[]>;

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const CAL_DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// 7:00 AM – 9:00 PM, 30-min steps
const TIME_OPTIONS: string[] = [];
for (let h = 7; h <= 21; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:00`);
  if (h < 21) TIME_OPTIONS.push(`${String(h).padStart(2,'0')}:30`);
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function AvailabilitySettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bookingEnabled, setBookingEnabled] = useState(false);
  const [availability, setAvailability] = useState<DateMap>(new Map());
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('user_profiles').select('booking_enabled').eq('user_id', user.id).maybeSingle(),
      supabase.from('appointment_availability').select('available_date, time_ranges').eq('user_id', user.id),
    ]).then(([profileRes, availRes]) => {
      setBookingEnabled(profileRes.data?.booking_enabled ?? false);
      const map: DateMap = new Map();
      ((availRes.data ?? []) as { available_date: string; time_ranges: TimeRange[] }[])
        .forEach((row) => map.set(row.available_date, row.time_ranges ?? []));
      setAvailability(map);
      setLoaded(true);
    });
  }, [user]);

  const setDateRanges = (key: string, ranges: TimeRange[]) => {
    setAvailability((prev) => {
      const next = new Map(prev);
      if (ranges.length === 0) next.delete(key);
      else next.set(key, ranges);
      return next;
    });
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from('user_profiles').update({ booking_enabled: bookingEnabled }).eq('user_id', user.id);
    const entries = Array.from(availability.entries());
    if (entries.length > 0) {
      await supabase.from('appointment_availability').upsert(
        entries.map(([date, ranges]) => ({ user_id: user.id, available_date: date, time_ranges: ranges })),
        { onConflict: 'user_id,available_date' }
      );
    }
    // Delete removed dates (fetch existing and diff)
    const { data: existing } = await supabase
      .from('appointment_availability').select('available_date').eq('user_id', user.id);
    const toDelete = (existing ?? [])
      .map((r: { available_date: string }) => r.available_date)
      .filter((d) => !availability.has(d));
    if (toDelete.length > 0) {
      await supabase.from('appointment_availability')
        .delete().eq('user_id', user.id).in('available_date', toDelete);
    }
    setSaving(false);
    toast({ title: 'Availability saved' });
  };

  if (!loaded) return null;

  // Calendar grid
  const today = new Date(); today.setHours(0,0,0,0);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />Appointment Availability
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Accept bookings</span>
            <Switch checked={bookingEnabled} onCheckedChange={setBookingEnabled} />
          </div>
        </div>
      </CardHeader>

      {bookingEnabled && (
        <CardContent className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Click a future date to set your available time windows. Dates with availability are highlighted.
          </p>

          {/* ── 2-column grid: calendar | editor ───────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: calendar */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm">{MONTH_NAMES[month]} {year}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="p-1 rounded-md hover:bg-accent transition-colors"
                    onClick={() => setViewMonth(new Date(year, month - 1, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded-md hover:bg-accent transition-colors"
                    onClick={() => setViewMonth(new Date(year, month + 1, 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {CAL_DAYS.map((d) => (
                  <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-1">
                {cells.map((date, i) => {
                  if (!date) return <div key={i} />;
                  const past = date < today;
                  const key = dateKey(date);
                  const hasAvail = availability.has(key);
                  const isEditing = editingDate === key;
                  const isToday = date.toDateString() === today.toDateString();
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={past}
                      onClick={() => setEditingDate(isEditing ? null : key)}
                      className={`
                        aspect-square flex items-center justify-center text-sm rounded-lg mx-0.5 relative transition-colors
                        ${isEditing ? 'bg-primary text-primary-foreground font-medium' : ''}
                        ${hasAvail && !isEditing ? 'bg-primary/15 text-primary font-medium' : ''}
                        ${isToday && !isEditing && !hasAvail ? 'ring-1 ring-primary text-primary' : ''}
                        ${!past && !isEditing ? 'hover:bg-accent cursor-pointer' : ''}
                        ${past ? 'text-muted-foreground/30 cursor-not-allowed' : ''}
                      `}
                    >
                      {date.getDate()}
                      {hasAvail && !isEditing && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: time range editor or placeholder */}
            <div className="border rounded-xl p-4 flex flex-col min-h-[260px]">
              {editingDate ? (
                <TimeRangeEditor
                  dateKey={editingDate}
                  ranges={availability.get(editingDate) ?? []}
                  onChange={(ranges) => setDateRanges(editingDate, ranges)}
                  onClose={() => setEditingDate(null)}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Select a date</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">Click any future date on the calendar to configure available hours</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" className="rounded-full" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Availability'}
            </Button>
            {availability.size > 0 && (
              <span className="text-xs text-muted-foreground">
                {availability.size} date{availability.size !== 1 ? 's' : ''} configured
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Time range editor for a single date ─────────────────────────────────────
function TimeRangeEditor({
  dateKey: key,
  ranges,
  onChange,
  onClose,
}: {
  dateKey: string;
  ranges: TimeRange[];
  onChange: (r: TimeRange[]) => void;
  onClose: () => void;
}) {
  const [d, m, y] = [
    parseInt(key.split('-')[2]),
    parseInt(key.split('-')[1]) - 1,
    parseInt(key.split('-')[0]),
  ];
  const label = new Date(y, m, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const addRange = () => onChange([...ranges, { start: '09:00', end: '17:00' }]);
  const removeRange = (i: number) => onChange(ranges.filter((_, idx) => idx !== i));
  const updateRange = (i: number, field: 'start' | 'end', val: string) => {
    onChange(ranges.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  };

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Set available hours for this day</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
          <X className="h-4 w-4" />
        </button>
      </div>

      {ranges.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No time windows yet — add one below.</p>
      )}

      <div className="space-y-2">
        {ranges.map((range, i) => (
          <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg p-2">
            <select
              value={range.start}
              onChange={(e) => updateRange(i, 'start', e.target.value)}
              className="flex-1 min-w-0 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{fmtTime(t)}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground shrink-0">to</span>
            <select
              value={range.end}
              onChange={(e) => updateRange(i, 'end', e.target.value)}
              className="flex-1 min-w-0 rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {TIME_OPTIONS.filter((t) => t > range.start).map((t) => (
                <option key={t} value={t}>{fmtTime(t)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeRange(i)}
              className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRange}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Add time window
      </button>

      {ranges.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Clients can book 1-hour slots within these windows.
        </p>
      )}
    </div>
  );
}

function Field({ label, children, className = '' }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function FieldDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );
}
