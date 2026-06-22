// Manual "ad-hoc" invoice creation (not tied to a quote). Two-panel layout: a structured
// form on the left, a live invoice preview on the right. Each line can be pulled from a
// catalog product (price via get_product_price_for_workspace; color/size/unit prefilled
// from product metadata) and carries full myDATA detail — measurement unit, VAT category,
// income classification — set per line OR via the GLOBAL defaults bar above the rows.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, ChevronLeft, Search, Package, MapPin, Eye } from 'lucide-react';
import { ToastAction } from '@/components/core/ui/toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useQuotaErrorHandler } from '@/hooks/useQuotaErrorHandler';
import { supabase } from '@/integrations/supabase/client';
import { invoicingSetupService, type FinanceBranch } from '@/services/invoicingSetupService';
import { AddressUnitSelect } from '@/modules/crm/components/AddressUnitSelect';
import { formatAddressLine } from '@/services/crm.service';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { servicesService, type ServiceItem } from '@/modules/finance/services/servicesService';
import { financeService, VAT_CATEGORIES, vatPctForCat, extractNet } from '@/modules/finance/services/financeService';
import { DEFAULT_TEMPLATE_ID, resolveColors, getTemplateSpec, buildInvoiceRenderData } from '@/modules/finance/invoice-templates';
import { InvoiceDocument } from '@/modules/finance/components/InvoiceDocument';
import { fiscalConnectorService } from '@/services/fiscalConnectorService';
import { validateVatViaVies } from '@/services/viesService';

interface Customer { type: 'contact' | 'company'; id: string; label: string; }

interface LineItem {
  description: string;
  sku: string;
  quantity: string;
  unit_price: string;
  unit_cost: string;
  discount: string;                // line-level discount amount (currency)
  unit: string;                    // free-text unit label (e.g. "pcs", "m²")
  measurement_unit_code: string;   // myDATA measurement unit code
  color: string;
  size: string;
  vat_category: string;            // myDATA VAT category code
  vat_exemption: string;           // myDATA VAT exemption category (1-31) when 0% VAT
  income_classification_type: string;
  income_classification_category: string;
  // Per-line Novus taxes (amounts in document currency)
  fees: string;
  stamp_duty: string;
  other_taxes: string;
  deductions: string;
  line_comments: string;
  product_id?: string | null;
  expanded?: boolean;
  advancedOpen?: boolean;
}

interface Props {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoiceId: string) => void;
  /** Pre-select the buyer (e.g. opened from a CRM party page). */
  initialCustomer?: Customer | null;
}

const DOC_FAMILY: Record<string, string> = {
  '1': 'Sales invoices', '2': 'Service invoices', '3': 'Proof of expense', '5': 'Credit notes',
  '6': 'Self-billing', '7': 'Contracts', '8': 'Rents / special', '9': 'Delivery notes',
  '11': 'Retail receipts', '13': 'Retail / expenses', '14': 'Cross-border', '15': 'Contractor',
  '16': 'Other', '17': 'Other',
};
function groupDocTypes(types: { code: string; description: string }[]) {
  const groups = new Map<string, { code: string; description: string }[]>();
  for (const t of types) {
    const fam = String(t.code).split('.')[0];
    if (!groups.has(fam)) groups.set(fam, []);
    groups.get(fam)!.push(t);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => Number(a) - Number(b))
    .map(([family, items]) => ({ family, label: DOC_FAMILY[family] ?? `Type ${family}.x`, items }));
}


const MOVE_PURPOSES: [string, string][] = [
  ['1', 'Sale'], ['2', 'Sale on behalf of third party'], ['3', 'Sampling'], ['4', 'Exhibition'],
  ['5', 'Return'], ['6', 'Movement between premises'], ['7', 'Consignment'],
];

const emptyLine = (g?: Partial<LineItem>): LineItem => ({
  description: '', sku: '', quantity: '1', unit_price: '0', unit_cost: '', discount: '', unit: '',
  measurement_unit_code: g?.measurement_unit_code ?? '', color: '', size: '',
  vat_category: g?.vat_category ?? '', vat_exemption: '',
  income_classification_type: g?.income_classification_type ?? '',
  income_classification_category: g?.income_classification_category ?? '',
  fees: '', stamp_duty: '', other_taxes: '', deductions: '', line_comments: '',
});

// Best-effort extraction of color/size/unit from heterogeneous product metadata.
function pickFromMeta(meta: any): { unit?: string; color?: string; size?: string } {
  if (!meta || typeof meta !== 'object') return {};
  const app = meta.appearance ?? {};
  const dims = Array.isArray(meta.dimensions) ? meta.dimensions : [];
  const firstVariant = Array.isArray(meta.variants) && meta.variants[0] ? meta.variants[0] : {};
  const color = app.color ?? app.colour ?? meta.color ?? firstVariant.color ?? '';
  const size = app.size ?? meta.size ?? firstVariant.format ?? firstVariant.size ?? (dims[0]?.label ?? dims[0]?.value ?? '');
  return { unit: meta.unit, color: typeof color === 'string' ? color : '', size: typeof size === 'string' ? size : '' };
}

export const NewInvoiceDialog: React.FC<Props> = ({ workspaceId, open, onOpenChange, onCreated, initialCustomer }) => {
  const { toast } = useToast();
  const handleQuotaError = useQuotaErrorHandler();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Parties
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);
  const [customerAddr, setCustomerAddr] = useState<any>(null);
  // Chosen sub-unit address (null = the party's main address).
  const [addrUnitId, setAddrUnitId] = useState<string | null>(null);
  const [validatingVat, setValidatingVat] = useState(false);
  // Buyer risk-gate (finance_settings) + the buyer's current open balance for the credit-limit check.
  const [riskRules, setRiskRules] = useState({ block_inactive: true, block_unvalidated: false, warn_over: true, block_over: false });
  const [buyerOutstanding, setBuyerOutstanding] = useState(0);
  // #227 — order-level paid-upfront (cash) discount
  const [paidUpfront, setPaidUpfront] = useState(false);
  const [cashPct, setCashPct] = useState(0);
  useEffect(() => {
    if (!workspaceId) return;
    financeService.getActiveCashDiscountPct(workspaceId).then(setCashPct).catch(() => {});
  }, [workspaceId]);

  // #193 — validate the counterpart's VAT via VIES before invoicing (caches onto crm_companies).
  const validateCounterpartVat = async () => {
    if (!customer || customer.type !== 'company' || !customerAddr?.vat_number) return;
    try {
      setValidatingVat(true);
      const res = await validateVatViaVies({
        countryCode: customerAddr.country_code || 'EL',
        vatNumber: customerAddr.vat_number,
        companyId: customer.id,
      });
      const { data } = await supabase.from('crm_companies').select('*').eq('id', customer.id).maybeSingle();
      if (data) setCustomerAddr(data);
      toast({
        title: res.valid ? 'VAT validated (VIES)' : res.skipped_reason ? 'Validation skipped' : 'VAT not valid',
        description: res.message || res.legal_name || undefined,
        variant: res.valid === false && !res.skipped_reason ? 'destructive' : undefined,
      });
    } catch (e: any) {
      toast({ title: 'Validation failed', description: e?.message, variant: 'destructive' });
    } finally {
      setValidatingVat(false);
    }
  };
  const [issuer, setIssuer] = useState<any>(null);
  // Inline "add client"
  const [addingClient, setAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', vat: '', email: '' });

  // Header
  const [documentType, setDocumentType] = useState('1.1');
  const [currency, setCurrency] = useState('EUR');
  const [vatRate, setVatRate] = useState('24');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [issueNow, setIssueNow] = useState(true);
  const [categoryId, setCategoryId] = useState('');
  const [branchCode, setBranchCode] = useState('0');
  const [docLanguage, setDocLanguage] = useState<'el' | 'en'>('en');
  const [withholdingCode, setWithholdingCode] = useState('');
  const [paymentMethodCode, setPaymentMethodCode] = useState('3'); // default "On credit"
  const [paymentMethodInfo, setPaymentMethodInfo] = useState('');
  const [vatSuspension, setVatSuspension] = useState(false);
  const [selfPricing, setSelfPricing] = useState(false);
  const [exchangeRate, setExchangeRate] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<{ code: string; description: string }[]>([]);
  // Reference-screen fields
  const [pricesIncludeVat, setPricesIncludeVat] = useState(false);
  const [digitalFee, setDigitalFee] = useState('');
  const [relatedDocument, setRelatedDocument] = useState('');
  const [printTerms, setPrintTerms] = useState(true);
  const [includeInMyf, setIncludeInMyf] = useState(true);
  const [printOnlineCode, setPrintOnlineCode] = useState(true);
  const [infoBox, setInfoBox] = useState('');
  const [logoMode, setLogoMode] = useState<'auto' | 'none'>('auto');
  const [submitNow, setSubmitNow] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [sendSms, setSendSms] = useState(false);
  const [moveStock, setMoveStock] = useState(true);
  const [nextNumber, setNextNumber] = useState<{ series: string | null; number: number | null } | null>(null);

  // Catalogs
  const [docTypes, setDocTypes] = useState<{ code: string; description: string }[]>([]);
  const [incTypes, setIncTypes] = useState<{ code: string; description: string }[]>([]);
  const [incCats, setIncCats] = useState<{ code: string; description: string }[]>([]);
  const [units, setUnits] = useState<{ code: string; description: string }[]>([]);
  const [withholdings, setWithholdings] = useState<{ code: string; description: string; rate: number | null }[]>([]);
  const [docDefaults, setDocDefaults] = useState<Record<string, { type: string | null; category: string | null; wh: string | null }>>({});
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [branches, setBranches] = useState<FinanceBranch[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);

  // Global line defaults
  const [gUnit, setGUnit] = useState('');
  const [gVat, setGVat] = useState('');
  const [gIncType, setGIncType] = useState('');
  const [gIncCat, setGIncCat] = useState('');

  // Lines
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  // Product search (per active row)
  const [prodSearch, setProdSearch] = useState('');
  const [prodResults, setProdResults] = useState<any[]>([]);
  const [prodOpenRow, setProdOpenRow] = useState<number | null>(null);

  // Shipping
  const [hasShipping, setHasShipping] = useState(false);
  const [shipFrom, setShipFrom] = useState('');
  const [shipTo, setShipTo] = useState('');
  const [transportDate, setTransportDate] = useState('');
  const [transportTime, setTransportTime] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [responsible, setResponsible] = useState('');
  const [movePurpose, setMovePurpose] = useState('1');

  // #207 — B2G (public-sector) invoicing. Same myDATA envelope + a B2G reference block.
  const [isB2g, setIsB2g] = useState(false);
  const [b2gContractRef, setB2gContractRef] = useState('');
  const [b2gBuyerRef, setB2gBuyerRef] = useState('');
  const [b2gBuyerReg, setB2gBuyerReg] = useState('');
  const [b2gBuyerIdentifier, setB2gBuyerIdentifier] = useState('');
  const [b2gBudgetIdentifier, setB2gBudgetIdentifier] = useState('');
  const [b2gDueDate, setB2gDueDate] = useState('');

  // ── Reset on open ──
  useEffect(() => {
    if (!open) return;
    // Pre-select the buyer when opened from a party page; the [customer] effect
    // below loads its address. Otherwise start blank.
    setCustomer(initialCustomer ?? null); setCustomerSearch(''); setCustomerOptions([]); setCustomerAddr(null);
    setAddingClient(false); setNewClient({ name: '', vat: '', email: '' });
    setDocumentType('1.1'); setCurrency('EUR'); setVatRate('24'); setPaymentTermsDays('30');
    setIssueDate(new Date().toISOString().slice(0, 10)); setNotes(''); setIssueNow(true);
    setCategoryId(''); setBranchCode('0'); setDocLanguage('en'); setWithholdingCode('');
    setPaymentMethodCode('3'); setPaymentMethodInfo(''); setVatSuspension(false); setSelfPricing(false); setExchangeRate('');
    setPricesIncludeVat(false); setDigitalFee(''); setRelatedDocument(''); setPrintTerms(true); setIncludeInMyf(true); setMoveStock(true);
    setPrintOnlineCode(true); setInfoBox(''); setLogoMode('auto'); setSubmitNow(false); setSendEmail(false); setSendSms(false); setNextNumber(null);
    setGUnit(''); setGVat(''); setGIncType(''); setGIncCat('');
    setLines([emptyLine()]);
    setHasShipping(false); setShipFrom(''); setShipTo(''); setTransportDate(''); setTransportTime('');
    setVehicleNumber(''); setResponsible(''); setMovePurpose('1');
    setIsB2g(false); setB2gContractRef(''); setB2gBuyerRef(''); setB2gBuyerReg('');
    setB2gBuyerIdentifier(''); setB2gBudgetIdentifier(''); setB2gDueDate('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCustomer?.id, initialCustomer?.type]);

  // ── Load catalogs + issuer ──
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [allTypes, enabled, ic, cat, wh, mu, pm, fs] = await Promise.all([
        invoicingSetupService.listReference('invoice_type'),
        invoicingSetupService.getDocTypeSettings(workspaceId),
        invoicingSetupService.listReference('income_classification_type'),
        invoicingSetupService.listReference('income_classification_category'),
        invoicingSetupService.listReference('withholding_tax'),
        invoicingSetupService.listReference('measurement_unit'),
        invoicingSetupService.listReference('payment_method'),
        supabase.from('finance_settings').select('*').eq('workspace_id', workspaceId).maybeSingle(),
      ]);
      setWithholdings(wh.map((w) => ({ code: w.code, description: w.description, rate: w.rate })));
      setUnits(mu.map((u) => ({ code: u.code, description: u.description })));
      setPaymentMethods(pm.map((p) => ({ code: p.code, description: p.description })));
      setIssuer(fs.data ?? null);
      financeCategoriesService.list(workspaceId).then(setCategories).catch(() => setCategories([]));
      servicesService.list(workspaceId).then(setServices).catch(() => setServices([]));
      invoicingSetupService.listBranches(workspaceId).then((b) => { setBranches(b); setBranchCode(String(b.find((x) => x.branch_code === 0)?.branch_code ?? 0)); }).catch(() => setBranches([]));
      const enabledCodes = Object.values(enabled).filter((e) => e.enabled).map((e) => e.code);
      const visible = enabledCodes.length ? allTypes.filter((t) => enabledCodes.includes(t.code)) : allTypes;
      setDocTypes(visible.map((t) => ({ code: t.code, description: t.description })));
      setIncTypes(ic.map((t) => ({ code: t.code, description: t.description })));
      setIncCats(cat.map((t) => ({ code: t.code, description: t.description })));
      setDocDefaults(Object.fromEntries(Object.values(enabled).map((e) => [e.code, { type: e.default_income_classification_type, category: e.default_income_classification_category, wh: e.default_withholding_code }])));
      if (visible.length && !visible.some((t) => t.code === '1.1')) setDocumentType(visible[0].code);
    })();
  }, [open, workspaceId]);

  // ── Customer search ──
  useEffect(() => {
    if (!open) return;
    const term = customerSearch.trim();
    if (term.length < 2) { setCustomerOptions([]); return; }
    const t = setTimeout(async () => {
      const [contacts, companies] = await Promise.all([
        supabase.from('crm_contacts').select('id, name, first_name, last_name, email').or(`name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`).limit(6),
        supabase.from('crm_companies').select('id, name').ilike('name', `%${term}%`).limit(6),
      ]);
      const opts: Customer[] = [];
      for (const c of contacts.data ?? []) opts.push({ type: 'contact', id: c.id, label: c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id });
      for (const c of companies.data ?? []) opts.push({ type: 'company', id: c.id, label: `${c.name} (company)` });
      setCustomerOptions(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [customerSearch, open]);

  // Load the workspace's buyer risk-gate rules once per open.
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const s = await financeService.getSettings(workspaceId);
        setRiskRules({
          block_inactive: s.risk_block_inactive_vat,
          block_unvalidated: s.risk_block_unvalidated_vat,
          warn_over: s.risk_warn_over_credit_limit,
          block_over: s.risk_block_over_credit_limit,
        });
      } catch { /* keep safe defaults */ }
    })();
  }, [open, workspaceId]);

  // Fetch the chosen customer's address (for preview + delivery prefill) + their open balance.
  useEffect(() => {
    if (!customer) { setCustomerAddr(null); setBuyerOutstanding(0); return; }
    (async () => {
      const table = customer.type === 'company' ? 'crm_companies' : 'crm_contacts';
      const { data } = await supabase.from(table).select('*').eq('id', customer.id).maybeSingle();
      setCustomerAddr(data ?? null);
      // #207 — adopt the party's commercial defaults: ΜΥΦ inclusion preference and
      // (for 0%-VAT lines) the party's default myDATA VAT-exemption category.
      if (data && (data as any).include_in_myf === false) setIncludeInMyf(false);
      // Public-sector segment → default to B2G issuance + prefill the buyer registration id.
      if (data && (data as any).contact_group === 'public_sector') {
        setIsB2g(true);
        if ((data as any).vat_number) setB2gBuyerReg(String((data as any).vat_number));
      }
      // Outstanding = sum of still-owed amounts on issued/partially-paid/overdue invoices.
      const col = customer.type === 'company' ? 'customer_company_id' : 'customer_contact_id';
      const { data: openRows } = await supabase
        .from('invoices')
        .select('amount_due')
        .eq('workspace_id', workspaceId)
        .eq(col, customer.id)
        .in('status', ['issued', 'partially_paid', 'overdue']);
      setBuyerOutstanding((openRows ?? []).reduce((s: number, r: any) => s + (Number(r.amount_due) || 0), 0));
    })();
  }, [customer, workspaceId]);

  // Reset the chosen sub-unit when the customer changes (the picker re-adopts the new
  // party's default unit, if any).
  useEffect(() => { setAddrUnitId(null); }, [customer?.id]);

  // Preview the series + next number for this doc type + establishment (read-only).
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: br } = await supabase.from('finance_branches').select('id').eq('workspace_id', workspaceId).eq('branch_code', parseInt(branchCode, 10) || 0).maybeSingle();
      let q = supabase.from('document_series').select('series, next_number, branch_id').eq('workspace_id', workspaceId).eq('doc_code', documentType).eq('is_active', true);
      const { data: rows } = await q;
      const list = rows ?? [];
      const match = list.find((r: any) => r.branch_id === (br as any)?.id) ?? list.find((r: any) => r.branch_id === null);
      setNextNumber(match ? { series: (match as any).series, number: (match as any).next_number } : null);
    })();
  }, [open, workspaceId, documentType, branchCode]);

  // ── Product search (debounced) ──
  useEffect(() => {
    if (prodOpenRow === null) return;
    const term = prodSearch.trim();
    if (term.length < 2) { setProdResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('products').select('id, name, sku, item_type, metadata').ilike('name', `%${term}%`).limit(8);
      setProdResults(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [prodSearch, prodOpenRow]);

  const update = (idx: number, patch: Partial<LineItem>) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine({ measurement_unit_code: gUnit, vat_category: gVat, income_classification_type: gIncType, income_classification_category: gIncCat })]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  // Apply a global default to every existing row.
  const applyGlobal = (field: keyof LineItem, value: string) => setLines((prev) => prev.map((l) => ({ ...l, [field]: value })));

  const pickProduct = async (idx: number, p: any) => {
    const meta = pickFromMeta(p.metadata);
    let price = '';
    try {
      const { data } = await supabase.rpc('get_product_price_for_workspace', { p_workspace_id: workspaceId, p_product_id: p.id });
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.suggested_sell != null) price = String(row.suggested_sell);
    } catch { /* price optional */ }
    update(idx, {
      product_id: p.id,
      description: p.name ?? '',
      sku: p.sku ?? '',
      unit: meta.unit ?? '',
      color: meta.color ?? '',
      size: meta.size ?? '',
      ...(price ? { unit_price: price } : {}),
      expanded: true,
    });
    setProdOpenRow(null); setProdSearch(''); setProdResults([]);
  };

  const pickService = (idx: number, s: ServiceItem) => {
    update(idx, {
      product_id: s.id,
      description: s.name,
      unit_price: s.list_price != null ? String(s.list_price) : '0',
      vat_category: s.vat_category != null ? String(s.vat_category) : '',
      income_classification_type: s.income_classification_type ?? gIncType,
      income_classification_category: s.income_classification_category ?? gIncCat,
      expanded: true,
    });
    setProdOpenRow(null); setProdSearch(''); setProdResults([]);
  };
  const matchedServices = (term: string) => term.length < 2 ? [] : services.filter((s) => s.name.toLowerCase().includes(term.toLowerCase())).slice(0, 6);

  // Shipping prefills
  const fmtAddr = (a: any) => a ? [a.business_address ?? a.street ?? a.address, a.business_street_number ?? a.street_number, a.business_postal_code ?? a.postal_code, a.business_city ?? a.city].filter(Boolean).join(' ') : '';
  const useHqAddress = () => setShipFrom(fmtAddr(issuer));
  const useCustomerDelivery = () => setShipTo(fmtAddr(customerAddr));

  const createClient = async () => {
    if (!newClient.name.trim()) { toast({ title: 'Client name required', variant: 'destructive' }); return; }
    const { data, error } = await supabase.from('crm_companies').insert({
      workspace_id: workspaceId, name: newClient.name.trim(), vat_number: newClient.vat || null, email: newClient.email || null,
    }).select('id, name').single();
    if (error) { if (!handleQuotaError(error)) toast({ title: 'Failed to add client', description: error.message, variant: 'destructive' }); return; }
    setCustomer({ type: 'company', id: data.id, label: `${data.name} (company)` });
    setAddingClient(false); setNewClient({ name: '', vat: '', email: '' });
  };

  // ── Totals (per-line VAT via category when set, else global rate) ──
  // Net for one line, honoring the VAT-inclusive toggle (price already contains VAT).
  const lineNetOf = (l: LineItem) => {
    const q = parseFloat(l.quantity) || 0, p = parseFloat(l.unit_price) || 0, disc = parseFloat(l.discount) || 0;
    const pct = vatPctForCat(l.vat_category || undefined, parseFloat(vatRate) || 0);
    const gross = Math.max(0, q * p - disc);
    return pricesIncludeVat ? extractNet(gross, pct) : gross;
  };
  const totals = useMemo(() => {
    let net = 0, vat = 0, fees = 0, stamp = 0, other = 0, deduct = 0;
    for (const l of lines) {
      const lineNet = lineNetOf(l);
      const pct = vatPctForCat(l.vat_category || undefined, parseFloat(vatRate) || 0);
      net += lineNet; vat += lineNet * (pct / 100);
      fees += parseFloat(l.fees) || 0; stamp += parseFloat(l.stamp_duty) || 0;
      other += parseFloat(l.other_taxes) || 0; deduct += parseFloat(l.deductions) || 0;
    }
    // #227 — paid-upfront (cash) discount: scale net + vat proportionally (preserves per-line VAT rates).
    const cashFactor = paidUpfront ? (1 - cashPct / 100) : 1;
    const cashDiscount = net * (1 - cashFactor);
    net = net * cashFactor;
    vat = vat * cashFactor;
    const digital = parseFloat(digitalFee) || 0;
    const wh = withholdings.find((w) => w.code === withholdingCode);
    const withheld = wh?.rate ? net * (Number(wh.rate) / 100) : 0;
    const total = net + vat + fees + stamp + other + digital - withheld - deduct;
    return { net, vat, fees, stamp, other, deduct, digital, withheld, cashDiscount, total };
  }, [lines, vatRate, withholdingCode, withholdings, pricesIncludeVat, digitalFee, paidUpfront, cashPct]);

  // Buyer risk evaluation against the workspace rules. `vat_validated===false` means ΑΑΔΕ flagged
  // the ΑΦΜ inactive (or VIES rejected it); `null` means it was never checked. Credit limit lives
  // on the CRM company row; we compare current open balance + this invoice against it.
  const buyerRisk = useMemo(() => {
    const a = customerAddr;
    const hasVat = !!a?.vat_number;
    const inactiveVat = hasVat && a?.vat_validated === false;
    const unvalidatedVat = hasVat && (a?.vat_validated === null || a?.vat_validated === undefined);
    const creditLimit = a?.credit_limit != null ? Number(a.credit_limit) : null;
    const projected = buyerOutstanding + (totals.total || 0);
    const overCreditLimit = creditLimit != null && creditLimit > 0 && projected > creditLimit;
    const blocks: string[] = [];
    if (riskRules.block_inactive && inactiveVat) blocks.push('the buyer VAT number is inactive / not recognised');
    if (riskRules.block_unvalidated && unvalidatedVat) blocks.push('the buyer VAT has never been validated');
    if (riskRules.block_over && overCreditLimit) blocks.push('this invoice exceeds the buyer credit limit');
    const warns: string[] = [];
    if (riskRules.warn_over && !riskRules.block_over && overCreditLimit) {
      warns.push(`Pushes the buyer to ${projected.toFixed(2)} ${currency}, over their ${creditLimit!.toFixed(2)} ${currency} credit limit.`);
    }
    if (unvalidatedVat && !riskRules.block_unvalidated) {
      warns.push('Buyer VAT has not been validated against AADE/VIES.');
    }
    return { inactiveVat, unvalidatedVat, overCreditLimit, creditLimit, projected, blocks, warns, hardBlocked: blocks.length > 0 };
  }, [customerAddr, buyerOutstanding, totals.total, riskRules, currency]);

  // Apply the configured default withholding for the active doc type once the doc-type
  // defaults have loaded (covers the common case where the operator never changes the
  // doc-type Select). Preserves an explicit choice via `cur ||`. #207
  useEffect(() => {
    const def = docDefaults[documentType];
    if (def?.wh) setWithholdingCode((cur) => cur || def.wh!);
  }, [documentType, docDefaults]);

  const applyDocDefault = (code: string) => {
    const def = docDefaults[code];
    if (def?.type) {
      setGIncType(def.type); setGIncCat(def.category ?? '');
      setLines((ls) => ls.map((l) => l.income_classification_type ? l : { ...l, income_classification_type: def.type!, income_classification_category: def.category ?? l.income_classification_category }));
    }
    // Pre-fill the configured default withholding for this doc type (only when the
    // operator hasn't already chosen one). #207 central withholding defaults.
    if (def?.wh) setWithholdingCode((cur) => cur || def.wh!);
  };

  const handleSave = async () => {
    if (!customer) { toast({ title: 'Pick a customer', variant: 'destructive' }); return; }
    const clean = lines.filter((l) => l.description.trim() && parseFloat(l.quantity) > 0);
    if (clean.length === 0) { toast({ title: 'Add at least one line item', variant: 'destructive' }); return; }
    if (buyerRisk.hardBlocked) {
      toast({
        title: 'Invoice blocked by risk check',
        description: `Cannot issue because ${buyerRisk.blocks.join('; ')}. Fix the buyer in CRM, or relax the rule under Finance → Settings → Buyer risk checks.`,
        variant: 'destructive',
      });
      return;
    }
    try {
      setBusy(true);
      // Use a DERIVED draft number (no counter advance). The gapless myDATA series/aa is
      // allocated at issue by mark_invoice_issued — never at draft-create — so a deleted or
      // failed draft can't gap the legal serial sequence.
      const { data: draftNumber, error: numErr } = await supabase.rpc('next_invoice_number', { p_workspace_id: workspaceId });
      if (numErr) throw numErr;

      // Snapshot the workspace's invoice design template + resolved colors onto this invoice,
      // so changing the workspace template later never restyles an already-created invoice.
      const { data: tplSettings } = await supabase.from('finance_settings')
        .select('invoice_template_id, invoice_template_colors').eq('workspace_id', workspaceId).maybeSingle();
      const snapshotTemplateId = (tplSettings as any)?.invoice_template_id || DEFAULT_TEMPLATE_ID;
      const snapshotTemplateColors = resolveColors(snapshotTemplateId, (tplSettings as any)?.invoice_template_colors);

      const { data: invoice, error: insErr } = await supabase.from('invoices').insert({
        workspace_id: workspaceId,
        internal_number: draftNumber as string, series: null, series_number: null,
        customer_contact_id: customer.type === 'contact' ? customer.id : null,
        customer_company_id: customer.type === 'company' ? customer.id : null,
        // Always insert as draft. "Issue now" routes through mark_invoice_issued
        // below so the legal_number (gapless) + issued_at + due_at are assigned
        // by the same RPC the quote path uses — inline status:'issued' here was
        // skipping legal_number assignment entirely.
        status: 'draft',
        currency, subtotal_net: Number(totals.net.toFixed(2)), vat_rate: Number(vatRate),
        vat_amount: Number(totals.vat.toFixed(2)), total: Number(totals.total.toFixed(2)),
        total_withheld_amount: Number(totals.withheld.toFixed(2)),
        total_fees_amount: Number(totals.fees.toFixed(2)), total_stamp_duty_amount: Number(totals.stamp.toFixed(2)),
        total_other_taxes_amount: Number(totals.other.toFixed(2)), total_deductions_amount: Number(totals.deduct.toFixed(2)),
        payment_method_code: paymentMethodCode ? parseInt(paymentMethodCode, 10) : null,
        payment_method_info: paymentMethodInfo || null,
        vat_payment_suspension: vatSuspension, self_pricing: selfPricing,
        exchange_rate: currency !== 'EUR' && exchangeRate ? parseFloat(exchangeRate) : null,
        prices_include_vat: pricesIncludeVat,
        paid_upfront: paidUpfront,
        cash_discount_pct: paidUpfront ? cashPct : 0,
        digital_transaction_fee: parseFloat(digitalFee) || 0,
        related_document: relatedDocument || null,
        print_terms: printTerms, include_in_myf: includeInMyf, print_online_code: printOnlineCode, move_stock: moveStock,
        info_box: infoBox || null, logo_mode: logoMode,
        payment_terms_days: parseInt(paymentTermsDays, 10) || 30, notes: notes || null,
        document_type: documentType, category_id: categoryId || null, branch_code: parseInt(branchCode, 10) || 0,
        doc_language: docLanguage,
        template_id: snapshotTemplateId, template_colors: snapshotTemplateColors,
        customer_address_unit_id: addrUnitId,
        has_shipping: hasShipping,
        ship_from: hasShipping ? (shipFrom || null) : null, ship_to: hasShipping ? (shipTo || null) : null,
        transport_date: hasShipping && transportDate ? transportDate : null, transport_time: hasShipping ? (transportTime || null) : null,
        vehicle_number: hasShipping ? (vehicleNumber || null) : null, responsible: hasShipping ? (responsible || null) : null,
        move_purpose: hasShipping ? movePurpose : null,
        // #207 — B2G (public-sector) flag + reference block (consumed by the connector).
        is_b2g: isB2g,
        b2g_details: isB2g ? {
          contractReference: b2gContractRef || null,
          buyerReference: b2gBuyerRef || null,
          buyerLegalRegistrationIdentifier: b2gBuyerReg || null,
          buyerIdentifier: b2gBuyerIdentifier || null,
          budgetIdentifier: b2gBudgetIdentifier || null,
          dueDate: b2gDueDate || null,
        } : null,
        issued_at: null,
        due_at: null,
      }).select().single();
      if (insErr) throw insErr;

      const itemsPayload = clean.map((l) => {
        const q = parseFloat(l.quantity); const p = parseFloat(l.unit_price);
        const disc = parseFloat(l.discount) || 0;
        const pct = vatPctForCat(l.vat_category || undefined, parseFloat(vatRate) || 0);
        const net = lineNetOf(l);
        // Store the NET unit price so per-line myDATA VAT stays correct when prices include VAT.
        const unitNet = pricesIncludeVat ? extractNet(p, pct) : p;
        return {
          invoice_id: invoice.id, description: l.description.trim(), sku: l.sku.trim() || null,
          quantity: q, unit_price: Number(unitNet.toFixed(4)), unit: l.unit || null,
          measurement_unit_code: l.measurement_unit_code ? parseInt(l.measurement_unit_code, 10) : null,
          discounted_price: disc || null, net_value: Number(net.toFixed(2)), line_total: Number(net.toFixed(2)),
          unit_cost_snapshot: l.unit_cost.trim() ? parseFloat(l.unit_cost) : null,
          selected_color: l.color || null, selected_size: l.size || null,
          vat_category: l.vat_category ? parseInt(l.vat_category, 10) : null,
          // #207 — 0%-VAT lines fall back to the customer's default myDATA exemption
          // category (crm party.vat_exemption_reason) when the line leaves it blank.
          vat_exemption_category: l.vat_exemption
            ? parseInt(l.vat_exemption, 10)
            : (pct === 0 && customerAddr?.vat_exemption_reason
                ? (parseInt(String(customerAddr.vat_exemption_reason), 10) || null)
                : null),
          income_classification_type: l.income_classification_type || null,
          income_classification_category: l.income_classification_category || null,
          fees_amount: parseFloat(l.fees) || 0, stamp_duty_amount: parseFloat(l.stamp_duty) || 0,
          other_taxes_amount: parseFloat(l.other_taxes) || 0, deductions_amount: parseFloat(l.deductions) || 0,
          line_comments: l.line_comments || null,
          product_id: l.product_id || null,
        };
      });
      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      // Issue now → allocate the gapless legal_number + issued_at + due_at via
      // the same RPC the quote flow uses. (Draft stays unnumbered.)
      if (issueNow) await financeService.markInvoiceIssued(invoice.id);

      // Optional post-create actions chosen on the form.
      if (submitNow && issueNow) {
        try {
          const sub = await fiscalConnectorService.submitInvoice(invoice.id);
          // #193 — credit exhaustion at issue: the invoice is issued but the myDATA transmission
          // was blocked for lack of credits. Surface a top-up CTA; retransmit from the invoice page.
          const fr = sub?.fiscal;
          if (fr && fr.ok === false && fr.code === 'insufficient_credits') {
            toast({
              title: 'Out of credits — not sent to myDATA',
              description: `The invoice was issued but couldn't be transmitted (balance ${fr.balance ?? 0}). Top up, then retransmit from the invoice page.`,
              action: <ToastAction altText="Top up credits" onClick={() => navigate('/billing/credits')}>Top up</ToastAction>,
              variant: 'destructive',
            });
          }
        } catch (e: any) { toast({ title: 'myDATA submission deferred', description: e?.message, variant: 'destructive' }); }
      }
      if (sendEmail) { try { await financeService.sendInvoiceEmail(invoice.id); } catch { /* surfaced on detail */ } }
      if (sendSms) { try { await financeService.sendInvoiceSms(invoice.id); } catch { /* surfaced on detail */ } }

      toast({ title: 'Invoice created', description: (draftNumber as string) ?? undefined });
      onCreated(invoice.id);
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message ?? 'Error', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  // ── Live preview: same renderer + workspace template/colors as the real PDF, driven by the form ──
  const previewTemplateId = issuer?.invoice_template_id || DEFAULT_TEMPLATE_ID;
  const previewSpec = useMemo(() => getTemplateSpec(previewTemplateId), [previewTemplateId]);
  const previewColors = useMemo(() => resolveColors(previewTemplateId, issuer?.invoice_template_colors), [previewTemplateId, issuer]);
  const dueDatePreview = useMemo(() => {
    const d = new Date(issueDate); d.setDate(d.getDate() + (parseInt(paymentTermsDays, 10) || 0));
    return d.toISOString().slice(0, 10);
  }, [issueDate, paymentTermsDays]);
  const previewData = useMemo(() => buildInvoiceRenderData({
    invoice: {
      doc_language: 'en', currency, document_type: documentType,
      internal_number: nextNumber?.number != null ? `${nextNumber.series ?? ''}${nextNumber.number}` : 'DRAFT',
      issued_at: issueDate || null, due_at: dueDatePreview, related_document: relatedDocument || null,
      vat_rate: parseFloat(vatRate) || 0,
      cash_discount_pct: paidUpfront ? cashPct : 0,
      total: totals.total, amount_paid: 0, amount_due: totals.total,
      total_fees_amount: totals.fees, total_stamp_duty_amount: totals.stamp,
      total_other_taxes_amount: totals.other, total_deductions_amount: totals.deduct,
      total_withheld_amount: totals.withheld, digital_transaction_fee: totals.digital,
      payment_method_code: paymentMethodCode ? parseInt(paymentMethodCode, 10) : null,
      payment_method_info: paymentMethodInfo || null,
      has_shipping: hasShipping, ship_from: hasShipping ? shipFrom : null, ship_to: hasShipping ? shipTo : null,
      vehicle_number: hasShipping ? vehicleNumber : null, move_purpose: hasShipping ? movePurpose : null,
      print_terms: printTerms, print_online_code: printOnlineCode, info_box: infoBox || null,
      notes: notes || null, logo_mode: logoMode, fiscal_mark: null,
    },
    items: lines.filter((l) => l.description.trim()).map((l) => {
      const pct = vatPctForCat(l.vat_category || undefined, parseFloat(vatRate) || 0);
      const net = lineNetOf(l);
      return {
        description: l.description, sku: l.sku || null, quantity: parseFloat(l.quantity) || 0,
        unit: l.unit || null, measurement_unit_code: l.measurement_unit_code ? parseInt(l.measurement_unit_code, 10) : null,
        unit_price: parseFloat(l.unit_price) || 0, net_value: net, line_total: net,
        vat_category: l.vat_category ? parseInt(l.vat_category, 10) : null, vat_percent: pct,
        selected_color: l.color || null, selected_size: l.size || null, line_comments: l.line_comments || null,
      };
    }),
    settings: issuer,
    customer: customerAddr ?? (customer ? { name: customer.label.replace(' (company)', '') } : null),
    branch: null, logoUrl: null,
  }), [issuer, previewColors, currency, documentType, nextNumber, issueDate, dueDatePreview, relatedDocument, vatRate, paidUpfront, cashPct, totals, paymentMethodCode, paymentMethodInfo, hasShipping, shipFrom, shipTo, vehicleNumber, movePurpose, printTerms, printOnlineCode, infoBox, notes, logoMode, lines, customer, customerAddr]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[1500px] h-[96vh] max-h-[96vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="border-b border-border/60 px-5 py-3 shrink-0">
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>

        {/* ───────── Editable form (left) + live styled-template preview (right) ───────── */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 overflow-y-auto bg-muted/20">
          <div className="mx-auto max-w-3xl space-y-5 rounded-lg border border-border/50 bg-background px-6 py-6 my-6 shadow-sm">
            {/* Document type quick-pick (segmented control) — mirrors Oxygen's top tabs */}
            <div className="flex flex-wrap gap-2">
              {([['1.1', 'Sales invoice'], ['2.1', 'Service invoice'], ['11.1', 'Receipt'], ['9.3', 'Delivery note']] as const)
                .filter(([code]) => !docTypes.length || docTypes.some((t) => t.code === code))
                .map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => { setDocumentType(code); applyDocDefault(code); }}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${documentType === code ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                  >
                    {label}
                  </button>
                ))}
            </div>

            {/* Parties + document */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Billed to</Label>
                {!addingClient && <button type="button" className="text-xs text-primary hover:underline" onClick={() => setAddingClient(true)}>+ Add new client</button>}
              </div>
              {addingClient ? (
                <div className="grid grid-cols-3 gap-2 rounded-md border border-border/60 p-3">
                  <Input className="h-8 text-xs col-span-3" placeholder="Company name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
                  <Input className="h-8 text-xs" placeholder="VAT no." value={newClient.vat} onChange={(e) => setNewClient({ ...newClient, vat: e.target.value })} />
                  <Input className="h-8 text-xs col-span-2" placeholder="Email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                  <div className="col-span-3 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setAddingClient(false)}>Cancel</Button>
                    <Button size="sm" onClick={createClient}>Add client</Button>
                  </div>
                </div>
              ) : customer ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                    <span className="text-sm">{customer.label}</span>
                    <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>Change</Button>
                  </div>
                  {customer.type === 'company' && customerAddr?.vat_number && (
                    <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-1.5 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">VAT {customerAddr.vat_number}</span>
                        {customerAddr.vat_validated
                          ? <Badge variant="outline" className="border-emerald-500/50 text-emerald-500">VIES validated</Badge>
                          : <Badge variant="outline" className="border-amber-500/50 text-amber-500">Not validated</Badge>}
                      </span>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" disabled={validatingVat} onClick={validateCounterpartVat}>
                        {validatingVat ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Validate via VIES'}
                      </Button>
                    </div>
                  )}

                  {/* Buyer risk gate (ΑΑΔΕ status + credit limit). Hard blocks are red and disable
                      issuance; soft warnings are amber and informational. Rules: Finance → Settings. */}
                  {buyerRisk.hardBlocked && (
                    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <strong>Issuance blocked:</strong> {buyerRisk.blocks.join('; ')}. Fix the buyer in CRM or change the rule under Finance → Settings.
                    </div>
                  )}
                  {!buyerRisk.hardBlocked && buyerRisk.warns.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                      {buyerRisk.warns.map((w, i) => <div key={i}>⚠ {w}</div>)}
                    </div>
                  )}

                  {/* Bill-to address: main address or one of the party's sub-units. */}
                  <AddressUnitSelect
                    companyId={customer.type === 'company' ? customer.id : null}
                    contactId={customer.type === 'contact' ? customer.id : null}
                    value={addrUnitId}
                    onChange={(id) => setAddrUnitId(id)}
                    label="Bill-to address"
                    mainAddressLine={customerAddr ? formatAddressLine(customerAddr) : undefined}
                  />
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Search contacts or companies…" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
                  {customerOptions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border/60 bg-popover shadow-md">
                      {customerOptions.map((o) => (
                        <button key={`${o.type}-${o.id}`} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setCustomer(o); setCustomerSearch(''); setCustomerOptions([]); }}>{o.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground col-span-2">Invoice details</Label>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Document type (myDATA)</Label>
                <Select value={documentType} onValueChange={(v) => { setDocumentType(v); applyDocDefault(v); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {groupDocTypes(docTypes.length ? docTypes : [{ code: '1.1', description: 'Sales Invoice' }]).map((g) => (
                      <React.Fragment key={g.family}>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{g.label}</div>
                        {g.items.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>)}
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {nextNumber ? `Series ${nextNumber.series ?? ''} · next number ${nextNumber.number}` : 'No series — auto-numbered (set series in Settings → Documents)'}
                </p>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Related document (optional)</Label>
                <Input className="h-9" value={relatedDocument} onChange={(e) => setRelatedDocument(e.target.value)} placeholder="e.g. related invoice no. or myDATA MARK" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date issued</Label>
                <Input type="date" className="h-9" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment terms (days)</Label>
                <Input type="number" min="0" className="h-9" value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="EUR">EUR (€)</SelectItem><SelectItem value="USD">USD ($)</SelectItem><SelectItem value="GBP">GBP (£)</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default VAT %</Label>
                <Input type="number" step="0.01" className="h-9" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={categoryId || 'none'} onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {/* Document language selector deferred until translations launch — invoices are English-only for now. */}
              {branches.length > 1 && (
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Establishment</Label>
                  <Select value={branchCode} onValueChange={setBranchCode}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={String(b.branch_code)}>#{b.branch_code} {b.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </section>

            {/* Global line defaults */}
            <section className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Global line defaults — applied to all rows</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={gUnit || 'none'} onValueChange={(v) => { const val = v === 'none' ? '' : v; setGUnit(val); applyGlobal('measurement_unit_code', val); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Measurement unit" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Unit…</SelectItem>{units.map((u) => <SelectItem key={u.code} value={u.code}>{u.description}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={gVat || 'none'} onValueChange={(v) => { const val = v === 'none' ? '' : v; setGVat(val); applyGlobal('vat_category', val); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="VAT category" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">VAT category…</SelectItem>{VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={gIncType || 'none'} onValueChange={(v) => { const val = v === 'none' ? '' : v; setGIncType(val); applyGlobal('income_classification_type', val); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Income type" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Income type…</SelectItem>{incTypes.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={gIncCat || 'none'} onValueChange={(v) => { const val = v === 'none' ? '' : v; setGIncCat(val); applyGlobal('income_classification_category', val); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Income category" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Income category…</SelectItem>{incCats.map((t) => <SelectItem key={t.code} value={t.code}>{t.description}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </section>

            {/* Line items */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Items / services</Label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded" checked={pricesIncludeVat} onChange={(e) => setPricesIncludeVat(e.target.checked)} />
                    Prices include VAT
                  </label>
                  {/* #227 — paid-upfront (cash) discount; disabled until a cash rule exists */}
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer" title={cashPct === 0 ? 'Set a Paid-upfront rule in Finance → Settings → Pricing' : `${cashPct}% off when paid upfront`}>
                    <input type="checkbox" className="h-3.5 w-3.5 rounded" checked={paidUpfront} disabled={cashPct === 0} onChange={(e) => setPaidUpfront(e.target.checked)} />
                    Paid upfront{cashPct > 0 ? ` (−${cashPct}%)` : ''}
                  </label>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={addLine}><Plus className="h-3 w-3 mr-1" /> Add row</Button>
                </div>
              </div>
              <div className="space-y-2">
                {lines.map((l, idx) => {
                  const lineNet = lineNetOf(l);
                  return (
                    <div key={idx} className="rounded-md border border-border/60">
                      <div className="flex items-start gap-2 p-2">
                        <button type="button" className="mt-2 text-muted-foreground" onClick={() => update(idx, { expanded: !l.expanded })}>
                          {l.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div className="flex-1 space-y-1">
                          <div className="relative">
                            <Input className="h-8 text-sm" placeholder="Description" value={l.description} onChange={(e) => update(idx, { description: e.target.value })} />
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline" onClick={() => { setProdOpenRow(idx); setProdSearch(''); setProdResults([]); }}>
                              <Package className="h-3 w-3" /> {l.product_id ? 'Linked product' : 'Pick from products'}
                            </button>
                            {(l.color || l.size) && <span className="text-[11px] text-muted-foreground">· {[l.color, l.size].filter(Boolean).join(' / ')}</span>}
                          </div>
                          {prodOpenRow === idx && (
                            <div className="rounded-md border border-border/60 bg-popover p-2">
                              <Input autoFocus className="h-8 text-xs" placeholder="Search products & services…" value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} />
                              <div className="mt-1 max-h-40 overflow-auto">
                                {matchedServices(prodSearch.trim()).map((s) => (
                                  <button key={`s-${s.id}`} type="button" className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => pickService(idx, s)}>
                                    <span>{s.name}</span><span className="text-[10px] text-muted-foreground">service</span>
                                  </button>
                                ))}
                                {prodResults.map((pr) => (
                                  <button key={pr.id} type="button" className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => pickProduct(idx, pr)}>
                                    <span>{pr.name}{pr.sku ? ` · ${pr.sku}` : ''}</span><span className="text-[10px] text-muted-foreground">product</span>
                                  </button>
                                ))}
                                {prodSearch.length >= 2 && prodResults.length === 0 && matchedServices(prodSearch.trim()).length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No matches</div>}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="w-16"><Input className="h-8 text-right text-sm" type="number" min="0" step="0.01" value={l.quantity} onChange={(e) => update(idx, { quantity: e.target.value })} placeholder="Qty" /></div>
                        <div className="w-24"><Input className="h-8 text-right text-sm" type="number" min="0" step="0.01" value={l.unit_price} onChange={(e) => update(idx, { unit_price: e.target.value })} placeholder="Price" /></div>
                        <div className="w-20"><Input className="h-8 text-right text-sm" type="number" min="0" step="0.01" value={l.discount} onChange={(e) => update(idx, { discount: e.target.value })} placeholder="Disc." title="Discount amount" /></div>
                        <div className="w-20 pt-2 text-right text-sm tabular-nums">{lineNet.toFixed(2)}</div>
                        {lines.length > 1 && <button type="button" className="mt-2 text-muted-foreground hover:text-destructive" onClick={() => removeLine(idx)}><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                      {l.expanded && (
                        <div className="grid grid-cols-2 gap-2 border-t border-border/40 bg-muted/20 p-3 sm:grid-cols-3">
                          <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">SKU</Label><Input className="h-7 text-xs" value={l.sku} onChange={(e) => update(idx, { sku: e.target.value })} /></div>
                          <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Color</Label><Input className="h-7 text-xs" value={l.color} onChange={(e) => update(idx, { color: e.target.value })} /></div>
                          <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Size / format</Label><Input className="h-7 text-xs" value={l.size} onChange={(e) => update(idx, { size: e.target.value })} /></div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Measurement unit</Label>
                            <Select value={l.measurement_unit_code || 'none'} onValueChange={(v) => update(idx, { measurement_unit_code: v === 'none' ? '' : v })}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Unit" /></SelectTrigger>
                              <SelectContent><SelectItem value="none">—</SelectItem>{units.map((u) => <SelectItem key={u.code} value={u.code}>{u.description}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">VAT category</Label>
                            <Select value={l.vat_category || 'none'} onValueChange={(v) => update(idx, { vat_category: v === 'none' ? '' : v })}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Default" /></SelectTrigger>
                              <SelectContent><SelectItem value="none">Default ({vatRate}%)</SelectItem>{VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Discount ({currency})</Label><Input className="h-7 text-xs text-right" type="number" min="0" step="0.01" value={l.discount} onChange={(e) => update(idx, { discount: e.target.value })} placeholder="0.00" /></div>
                          <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Unit cost (COGS)</Label><Input className="h-7 text-xs text-right" type="number" min="0" step="0.01" value={l.unit_cost} onChange={(e) => update(idx, { unit_cost: e.target.value })} placeholder="—" /></div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-[10px] text-muted-foreground">Kind of expense (income classification)</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <Select value={l.income_classification_type || 'none'} onValueChange={(v) => update(idx, { income_classification_type: v === 'none' ? '' : v })}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                                <SelectContent><SelectItem value="none">—</SelectItem>{incTypes.map((t) => <SelectItem key={t.code} value={t.code}>{t.code}</SelectItem>)}</SelectContent>
                              </Select>
                              <Select value={l.income_classification_category || 'none'} onValueChange={(v) => update(idx, { income_classification_category: v === 'none' ? '' : v })}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                                <SelectContent><SelectItem value="none">—</SelectItem>{incCats.map((t) => <SelectItem key={t.code} value={t.code}>{t.description}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          </div>
                          {vatPctForCat(l.vat_category || undefined, parseFloat(vatRate) || 0) === 0 && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">VAT exemption category (1–31)</Label>
                              <Input className="h-7 text-xs" type="number" min="1" max="31" value={l.vat_exemption} onChange={(e) => update(idx, { vat_exemption: e.target.value })} placeholder="Required for 0% VAT" />
                            </div>
                          )}
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-[10px] text-muted-foreground">Line comments</Label>
                            <Input className="h-7 text-xs" value={l.line_comments} onChange={(e) => update(idx, { line_comments: e.target.value })} placeholder="Shown on this line of the invoice" />
                          </div>
                          <div className="sm:col-span-3">
                            <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => update(idx, { advancedOpen: !l.advancedOpen })}>
                              {l.advancedOpen ? '− Hide' : '+ Advanced taxes'} (fees · stamp duty · other taxes · deductions)
                            </button>
                            {l.advancedOpen && (
                              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Fees ({currency})</Label><Input className="h-7 text-xs text-right" type="number" min="0" step="0.01" value={l.fees} onChange={(e) => update(idx, { fees: e.target.value })} placeholder="0.00" /></div>
                                <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Stamp duty ({currency})</Label><Input className="h-7 text-xs text-right" type="number" min="0" step="0.01" value={l.stamp_duty} onChange={(e) => update(idx, { stamp_duty: e.target.value })} placeholder="0.00" /></div>
                                <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Other taxes ({currency})</Label><Input className="h-7 text-xs text-right" type="number" min="0" step="0.01" value={l.other_taxes} onChange={(e) => update(idx, { other_taxes: e.target.value })} placeholder="0.00" /></div>
                                <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Deductions ({currency})</Label><Input className="h-7 text-xs text-right" type="number" min="0" step="0.01" value={l.deductions} onChange={(e) => update(idx, { deductions: e.target.value })} placeholder="0.00" /></div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Document taxes */}
            <section className="grid grid-cols-2 gap-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground col-span-2">Taxes</Label>
              <div className="space-y-1">
                <Label className="text-xs">Withholding tax</Label>
                <Select value={withholdingCode || 'none'} onValueChange={(v) => setWithholdingCode(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{withholdings.map((w) => <SelectItem key={w.code} value={w.code}>{w.description}{w.rate ? ` — ${w.rate}%` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Digital transaction fee</Label>
                <Input className="h-9 text-right" type="number" min="0" step="0.01" value={digitalFee} onChange={(e) => setDigitalFee(e.target.value)} placeholder="0.00" />
              </div>
            </section>

            {/* Payment */}
            <section className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Payment</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Payment method (myDATA)</Label>
                  <Select value={paymentMethodCode} onValueChange={setPaymentMethodCode}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Payment method…" /></SelectTrigger>
                    <SelectContent>{paymentMethods.map((p) => <SelectItem key={p.code} value={p.code}>{p.code} — {p.description}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Payment note</Label>
                  <Input className="h-9" value={paymentMethodInfo} onChange={(e) => setPaymentMethodInfo(e.target.value)} placeholder="e.g. IBAN, card ref, “on credit”" />
                </div>
                {currency !== 'EUR' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Exchange rate → EUR</Label>
                    <Input className="h-9" type="number" step="0.0001" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="e.g. 1.0850" />
                  </div>
                )}
                <label className="flex items-center gap-2 self-end text-xs">
                  <input type="checkbox" className="h-4 w-4 rounded" checked={vatSuspension} onChange={(e) => setVatSuspension(e.target.checked)} />
                  VAT payment suspension
                </label>
                <label className="flex items-center gap-2 self-end text-xs">
                  <input type="checkbox" className="h-4 w-4 rounded" checked={selfPricing} onChange={(e) => setSelfPricing(e.target.checked)} />
                  Self-pricing
                </label>
              </div>
            </section>

            {/* Shipping */}
            <section className="rounded-md border border-border/60 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Invoice with shipping</div>
                  <p className="text-xs text-muted-foreground">Adds a transport block (combined invoice + delivery note).</p>
                </div>
                <Switch checked={hasShipping} onCheckedChange={setHasShipping} />
              </div>
              {hasShipping && (
                <div className="space-y-2">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Loading place</Label>
                        <button type="button" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline" onClick={useHqAddress}><MapPin className="h-3 w-3" /> Use HQ details</button>
                      </div>
                      <Input className="h-8 text-xs" value={shipFrom} onChange={(e) => setShipFrom(e.target.value)} placeholder="Loading address" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Delivery place</Label>
                        <button type="button" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-40" disabled={!customerAddr} onClick={useCustomerDelivery}><MapPin className="h-3 w-3" /> Customer delivery address</button>
                      </div>
                      <Input className="h-8 text-xs" value={shipTo} onChange={(e) => setShipTo(e.target.value)} placeholder="Delivery address" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Date</Label><Input type="date" className="h-8 text-xs" value={transportDate} onChange={(e) => setTransportDate(e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Time</Label><Input type="time" className="h-8 text-xs" value={transportTime} onChange={(e) => setTransportTime(e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Vehicle</Label><Input className="h-8 text-xs" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="ABC-1234" /></div>
                    <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Responsible</Label><Input className="h-8 text-xs" value={responsible} onChange={(e) => setResponsible(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Purpose</Label>
                    <Select value={movePurpose} onValueChange={setMovePurpose}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{MOVE_PURPOSES.map(([v, lbl]) => <SelectItem key={v} value={v}>{v} — {lbl}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes shown on the invoice" />
            </section>

            {/* #207 — B2G (public-sector e-invoicing). Hidden for retail (11.x) docs. */}
            {!documentType.startsWith('11') && (
              <section className="rounded-md border border-border/60 p-3 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">B2G — public-sector invoice</span>
                  <input type="checkbox" className="h-4 w-4 rounded" checked={isB2g} onChange={(e) => setIsB2g(e.target.checked)} />
                </label>
                {isB2g && (
                  <>
                    <p className="text-[11px] text-muted-foreground">Transmitted on the same myDATA envelope with the public-buyer reference block. Fill the references provided by the contracting authority.</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Contract reference (ΑΔΑΜ)</Label><Input className="h-8 text-xs" value={b2gContractRef} onChange={(e) => setB2gContractRef(e.target.value)} placeholder="e.g. 20SYMV006467658" /></div>
                      <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Buyer reference</Label><Input className="h-8 text-xs" value={b2gBuyerRef} onChange={(e) => setB2gBuyerRef(e.target.value)} placeholder="contracting authority" /></div>
                      <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Buyer legal registration id</Label><Input className="h-8 text-xs" value={b2gBuyerReg} onChange={(e) => setB2gBuyerReg(e.target.value)} placeholder="defaults to buyer VAT" /></div>
                      <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Buyer identifier (ΚΗΜΔΗΣ/KAE)</Label><Input className="h-8 text-xs" value={b2gBuyerIdentifier} onChange={(e) => setB2gBuyerIdentifier(e.target.value)} placeholder="e.g. 1007.909.0001" /></div>
                      <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Budget identifier</Label><Input className="h-8 text-xs" value={b2gBudgetIdentifier} onChange={(e) => setB2gBudgetIdentifier(e.target.value)} placeholder="ΚΑΕ / budget code" /></div>
                      <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Payment due date</Label><Input type="date" className="h-8 text-xs" value={b2gDueDate} onChange={(e) => setB2gDueDate(e.target.value)} /></div>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Document & delivery options (Ρυθμίσεις Παραστατικού) */}
            <section className="rounded-md border border-border/60 p-3 space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Document &amp; delivery options</Label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <label className="flex items-center justify-between cursor-pointer"><span>Submit to myDATA on issue</span><input type="checkbox" className="h-4 w-4 rounded" checked={submitNow} onChange={(e) => setSubmitNow(e.target.checked)} /></label>
                <label className="flex items-center justify-between cursor-pointer"><span>Print online code / QR</span><input type="checkbox" className="h-4 w-4 rounded" checked={printOnlineCode} onChange={(e) => setPrintOnlineCode(e.target.checked)} /></label>
                <label className="flex items-center justify-between cursor-pointer"><span>Include in MYF report</span><input type="checkbox" className="h-4 w-4 rounded" checked={includeInMyf} onChange={(e) => setIncludeInMyf(e.target.checked)} /></label>
                <label className="flex items-center justify-between cursor-pointer"><span>Move stock on issue (decrement warehouse)</span><input type="checkbox" className="h-4 w-4 rounded" checked={moveStock} onChange={(e) => setMoveStock(e.target.checked)} /></label>
                <label className="flex items-center justify-between cursor-pointer"><span>Print terms & comments</span><input type="checkbox" className="h-4 w-4 rounded" checked={printTerms} onChange={(e) => setPrintTerms(e.target.checked)} /></label>
                <label className="flex items-center justify-between cursor-pointer"><span>Send by email on create</span><input type="checkbox" className="h-4 w-4 rounded" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /></label>
                <label className="flex items-center justify-between cursor-pointer"><span>Send by SMS on create</span><input type="checkbox" className="h-4 w-4 rounded" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} /></label>
                <div className="flex items-center justify-between"><span>Logo</span>
                  <Select value={logoMode} onValueChange={(v: any) => setLogoMode(v)}>
                    <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="auto">Business logo</SelectItem><SelectItem value="none">No logo</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Info box (printed, ≤250 chars)</Label>
                <Input className="h-8 text-xs" maxLength={250} value={infoBox} onChange={(e) => setInfoBox(e.target.value)} placeholder="Extra printed note, e.g. warranty / delivery terms" />
              </div>
            </section>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded" checked={issueNow} onChange={(e) => setIssueNow(e.target.checked)} />
              Issue now (assigns the legal number + date)
            </label>
          </div>
          </div>

          {/* Live preview — same renderer + active workspace template/colors as the real PDF. */}
          <div className="hidden lg:flex w-[620px] xl:w-[680px] shrink-0 flex-col border-l border-border/60 bg-muted/40">
            <div className="flex items-center justify-between px-4 h-10 shrink-0 border-b border-border/60 bg-background/60">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Live preview</span>
              <Button size="sm" variant="ghost" className="h-7 rounded-full gap-1.5 text-xs" onClick={() => setShowPreview(true)}>
                <Eye className="h-3.5 w-3.5" /> Full size
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-5 no-card-hover">
              <div style={{ zoom: 0.72 }}><InvoiceDocument spec={previewSpec} colors={previewColors} data={previewData} /></div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 px-5 py-3 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={() => setShowPreview(true)} disabled={busy}><Eye className="h-4 w-4 mr-1.5" /> Preview</Button>
          <Button onClick={handleSave} disabled={busy || buyerRisk.hardBlocked} title={buyerRisk.hardBlocked ? buyerRisk.blocks.join('; ') : undefined}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create invoice'}</Button>
        </DialogFooter>

        {/* Full styled-template preview overlay (Oxygen-style "Προεπισκόπηση") */}
        {showPreview && (
          <div className="absolute inset-0 z-50 flex flex-col bg-muted/40">
            <div className="flex items-center justify-between border-b border-border/60 bg-background px-4 h-14 shrink-0">
              <span className="text-sm font-medium">Invoice preview</span>
              <Button size="sm" variant="ghost" className="rounded-full gap-1.5" onClick={() => setShowPreview(false)}><ChevronLeft className="h-4 w-4" /> Back to edit</Button>
            </div>
            <div className="flex-1 overflow-auto flex justify-center px-6 py-6 no-card-hover">
              <div className="h-fit"><InvoiceDocument spec={previewSpec} colors={previewColors} data={previewData} /></div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
