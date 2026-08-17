import React, { useState, useEffect } from 'react';
import { formatDate as formatDateValue } from '@/utils/datetime';
import { DollarSign, RefreshCw, Edit2, Clock, Cpu, Image, Sparkles, ToggleLeft, ToggleRight, ExternalLink, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { edgeError } from '@/utils/edgeError';
import { statusTone } from '@/utils/statusTone';

interface ModelPricing {
  id: string;
  model_key: string;
  model_name: string;
  provider: string;
  billing_type: 'token_based' | 'time_based' | 'per_generation' | 'per_unit';
  input_price_per_million: number;
  output_price_per_million: number;
  hourly_rate_usd: number;
  cost_per_generation: number;
  cost_per_unit: number;
  unit_label: string | null;
  markup_multiplier: number;
  auto_update_enabled: boolean;
  auto_update_source_url: string | null;
  last_auto_updated_at: string | null;
  is_active: boolean;
  category: string;
  gpu_type: string | null;
  notes: string | null;
  source_url: string | null;
  last_verified_at: string | null;
  updated_at: string;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  llm: Sparkles,
  embedding: Cpu,
  vision: Image,
  generation: Image,
  external_service: ExternalLink,
};



// Display names for categories (handles acronyms properly)
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  llm: 'LLM',
  embedding: 'Embedding',
  vision: 'Vision',
  generation: 'Generation',
  external_service: 'External Services',
  other: 'Other',
};

/** One `ai_usage_logs.model_name` and whether `ai_model_pricing` knows about it. */
interface UsageCoverageRow {
  model_key: string;
  calls: number;
  billed_usd: number;
  last_used_at: string | null;
  has_pricing_row: boolean;
  pricing_active: boolean;
}

/** The numeric columns this tab may edit. Everything else on the row is set elsewhere. */
type PriceField =
  | 'input_price_per_million'
  | 'output_price_per_million'
  | 'hourly_rate_usd'
  | 'cost_per_generation'
  | 'cost_per_unit'
  | 'markup_multiplier';

const PRICE_FIELD_LABELS: Record<PriceField, string> = {
  input_price_per_million: 'Input price',
  output_price_per_million: 'Output price',
  hourly_rate_usd: 'Hourly rate',
  cost_per_generation: 'Cost per generation',
  cost_per_unit: 'Cost per unit',
  markup_multiplier: 'Markup',
};

/**
 * Parse one edited price field. Mirrors the `ai_model_pricing_costs_sane` /
 * `ai_model_pricing_markup_positive` CHECK constraints so the operator gets a message instead of a
 * Postgres error — the DB is the enforcement, this is the explanation.
 *
 * `markup_multiplier` is the one field where 0 is rejected rather than allowed: a zero markup
 * bills every AI call in the platform at nothing, forever, with no error anywhere.
 */
function parsePriceField(field: PriceField, raw: string): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { error: `${PRICE_FIELD_LABELS[field]} cannot be blank.` };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { error: `${PRICE_FIELD_LABELS[field]} must be a number.` };
  if (value < 0) return { error: `${PRICE_FIELD_LABELS[field]} cannot be negative.` };
  if (field === 'markup_multiplier' && value <= 0) {
    return { error: 'Markup must be greater than 0 — a zero markup bills all usage at nothing.' };
  }
  return { value };
}

export const AIModelPricingTab: React.FC = () => {
  const [pricing, setPricing] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Raw input STRINGS, not numbers. `parseFloat('')` is NaN and Postgres `numeric` accepts NaN, so
  // the previous `onChange={… parseFloat(e.target.value)}` stored NaN the moment a field was
  // cleared — after which every cost derived from this row was NaN, silently. Parsing is deferred
  // to save, where it can refuse. (#365 AD-31)
  const [editValues, setEditValues] = useState<Partial<Record<PriceField, string>>>({});
  const [usageByModelKey, setUsageByModelKey] = useState<Record<string, number>>({});
  const [unpriced, setUnpriced] = useState<UsageCoverageRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadPricing();
    loadUsageCoverage();
  }, []);

  /**
   * Which models are actually being CHARGED FOR, and which of those this table has never heard of.
   * The platform rule is that a missing price means "no verified cost, never a guess" — a pricing
   * surface that cannot show the gap makes that rule unenforceable by the person responsible for
   * it (#365 AD-33). Also feeds the "this model already has logged usage" warning on save.
   */
  const loadUsageCoverage = async () => {
    // Cast: get_ai_model_usage_coverage returns jsonb and is not in the generated types
    // (types:generate has no token locally and CI never regenerates).
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string, args: Record<string, unknown>,
    ) => Promise<{ data: { models?: UsageCoverageRow[] } | null; error: unknown }>)(
      'get_ai_model_usage_coverage', { p_days: 365 },
    );
    if (error || !data?.models) {
      // Leave `unpriced` at null — the panel then says the check could not run, rather than
      // rendering an empty list that reads as "everything is priced".
      console.warn('[AIModelPricingTab] usage-coverage lookup failed:', error);
      setUnpriced(null);
      return;
    }
    const rows = data.models;
    setUsageByModelKey(Object.fromEntries(rows.map((r) => [r.model_key, Number(r.calls) || 0])));
    setUnpriced(rows.filter((r) => !r.has_pricing_row));
  };

  const loadPricing = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('ai_model_pricing')
        .select('*')
        .order('category', { ascending: true })
        .order('provider', { ascending: true })
        .order('model_name', { ascending: true });

      // Dev-only diagnostic: surface any legacy model_keys that should never appear.
      // Keeps prod console clean while still alerting devs running locally.
      if (import.meta.env.DEV && data) {
        const legacyKeys = data
          .map((r) => r.model_key)
          .filter((k) =>
            /^claude-(3-|4-5-|opus-4-5)/.test(k) || /^gpt-/.test(k),
          );
        if (legacyKeys.length > 0) {
          console.error(
            '[AIModelPricingTab] Legacy model_keys arrived from API — these should not exist:',
            legacyKeys,
          );
        }
      }

      if (error) throw error;
      setPricing(data || []);
    } catch (error) {
      console.error('Error loading pricing:', error);
      toast({ title: 'Error', description: 'Failed to load pricing data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (model: ModelPricing) => {
    setEditingId(model.id);
    setEditValues({
      input_price_per_million: String(model.input_price_per_million ?? ''),
      output_price_per_million: String(model.output_price_per_million ?? ''),
      hourly_rate_usd: String(model.hourly_rate_usd ?? ''),
      cost_per_generation: String(model.cost_per_generation ?? ''),
      cost_per_unit: String(model.cost_per_unit ?? ''),
      markup_multiplier: String(model.markup_multiplier ?? ''),
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({});
  };

  /** Live per-field validity, so a bad value is visible before the operator presses save. */
  const isFieldInvalid = (field: PriceField): boolean => {
    const raw = editValues[field];
    if (raw === undefined) return false;
    return 'error' in parsePriceField(field, raw);
  };

  const saveEditing = async () => {
    if (!editingId) return;
    const model = pricing.find((m) => m.id === editingId);
    if (!model) return;

    // Build an explicit, validated patch. Never spread the edit state into the write: it is
    // untrusted form input and this table is the platform's single USD source.
    const patch: Partial<Record<PriceField, number>> = {};
    for (const [field, raw] of Object.entries(editValues) as [PriceField, string][]) {
      const parsed = parsePriceField(field, raw);
      if ('error' in parsed) {
        toast({ title: 'Invalid price', description: parsed.error, variant: 'destructive' });
        return;
      }
      patch[field] = parsed.value;
    }
    if (Object.keys(patch).length === 0) return;

    // Editing a price in place also re-values every past call of this model, because cost
    // reporting recomputes from the current row (#365 AD-32). Say so before it happens.
    const loggedCalls = usageByModelKey[model.model_key] ?? 0;
    if (loggedCalls > 0) {
      const ok = window.confirm(
        `${model.model_name} already has ${loggedCalls.toLocaleString()} logged call(s).

` +
        'Cost reporting recomputes from the current row, so changing this price also changes ' +
        'what those past calls are reported to have cost. Continue?',
      );
      if (!ok) return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('ai_model_pricing')
        .update({
          ...patch,
          last_verified_at: new Date().toISOString(),
        })
        .eq('id', editingId);

      if (error) throw error;

      toast({ title: 'Success', description: 'Pricing updated successfully' });
      setEditingId(null);
      setEditValues({});
      loadPricing();
    } catch (error) {
      console.error('Error saving pricing:', error);
      toast({ title: 'Error', description: 'Failed to save pricing', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleAutoUpdate = async (model: ModelPricing) => {
    try {
      const { error } = await supabase
        .from('ai_model_pricing')
        .update({ auto_update_enabled: !model.auto_update_enabled })
        .eq('id', model.id);

      if (error) throw error;
      loadPricing();
      toast({
        title: model.auto_update_enabled ? 'Auto-update disabled' : 'Auto-update enabled',
        description: `${model.model_name} will ${model.auto_update_enabled ? 'no longer' : 'now'} be updated automatically`,
      });
    } catch (error) {
      console.error('Error toggling auto-update:', error);
      toast({ title: 'Error', description: 'Failed to toggle auto-update', variant: 'destructive' });
    }
  };

  const syncPricesNow = async (forceAll: boolean = false) => {
    try {
      setSyncing(true);
      toast({
        title: 'Syncing prices...',
        description: forceAll ? 'Checking all models for price updates' : 'Checking auto-update enabled models',
      });

      const { data, error } = await supabase.functions.invoke('ai-pricing-updater', {
        body: { force_update: forceAll },
      });

      if (error) throw await edgeError(error);

      const result = data;
      if (result.success) {
        toast({
          title: 'Price sync complete',
          description: `${result.stats.models_updated} models updated, ${result.stats.models_checked} checked`,
        });
        loadPricing();
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error syncing prices:', error);
      toast({
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Failed to sync prices',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const formatPrice = (value: number, decimals: number = 4) => {
    return value ? `$${value.toFixed(decimals)}` : '-';
  };

  const formatDate = (dateString: string | null) => formatDateValue(dateString, { fallback: 'Never' });

  // Retired/replaced models are deactivated (is_active=false) rather than deleted so
  // their historical ai_usage_logs still resolve. Hide them by default so the tab only
  // shows models the platform actually uses; the toggle brings them back for auditing.
  const inactiveCount = pricing.filter(p => !p.is_active).length;
  const visiblePricing = showInactive ? pricing : pricing.filter(p => p.is_active);

  const categories = ['all', ...Array.from(new Set(visiblePricing.map(p => p.category).filter(Boolean)))];
  const filteredPricing = selectedCategory === 'all'
    ? visiblePricing
    : visiblePricing.filter(p => p.category === selectedCategory);

  // Group by category
  const groupedPricing = filteredPricing.reduce((acc, model) => {
    const key = model.category || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(model);
    return acc;
  }, {} as Record<string, ModelPricing[]>);

  const calculateBilledCost = (model: ModelPricing, inputTokens: number = 1000, outputTokens: number = 500) => {
    let rawCost = 0;
    if (model.billing_type === 'token_based') {
      rawCost = (inputTokens / 1000000) * model.input_price_per_million +
                (outputTokens / 1000000) * model.output_price_per_million;
    } else if (model.billing_type === 'time_based') {
      rawCost = (5 / 3600) * model.hourly_rate_usd; // 5 seconds
    } else if (model.billing_type === 'per_generation') {
      rawCost = model.cost_per_generation;
    } else if (model.billing_type === 'per_unit') {
      rawCost = model.cost_per_unit;
    }
    return rawCost * model.markup_multiplier;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Models being billed that this table has never heard of. Rendered before the summary
          cards on purpose: the counts below only describe rows that EXIST. (#365 AD-33) */}
      {unpriced === null ? (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            Could not check which models are missing a pricing row — this list is unknown, not empty.
          </CardContent>
        </Card>
      ) : unpriced.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {unpriced.length} model{unpriced.length === 1 ? '' : 's'} with usage but no pricing row
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These appear in <code>ai_usage_logs</code> over the last year and have no row here, so
              nothing in this table governs what they cost. A missing price means no verified cost —
              never a guessed one.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model key</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead>Last used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unpriced.map((row) => (
                  <TableRow key={row.model_key}>
                    <TableCell className="font-mono text-xs">{row.model_key}</TableCell>
                    <TableCell className="text-right text-xs">{Number(row.calls).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs">{formatPrice(Number(row.billed_usd), 4)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(row.last_used_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100">
                <Sparkles className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">LLM Models</p>
                <p className="text-2xl font-bold">{visiblePricing.filter(p => p.category === 'llm').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Cpu className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Embedding Models</p>
                <p className="text-2xl font-bold">{visiblePricing.filter(p => p.category === 'embedding').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Image className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vision Models</p>
                <p className="text-2xl font-bold">{visiblePricing.filter(p => p.category === 'vision').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-100">
                <ExternalLink className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">External Services</p>
                <p className="text-2xl font-bold">{visiblePricing.filter(p => p.category === 'external_service').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Platform Markup</p>
                <p className="text-2xl font-bold">50%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Filter */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {categories.map(category => (
            <Button
              key={category}
              variant={selectedCategory === category ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category)}
            >
              {category === 'all' ? 'All' : (CATEGORY_DISPLAY_NAMES[category] || category)}
            </Button>
          ))}
        </div>
        {inactiveCount > 0 && (
          <div className="flex items-center gap-2">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive" className="text-sm text-muted-foreground cursor-pointer">
              Show retired ({inactiveCount})
            </Label>
          </div>
        )}
      </div>

      {/* Pricing Tables by Category */}
      {Object.entries(groupedPricing).map(([category, models]) => (
        <Card key={category}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {CATEGORY_ICONS[category] && React.createElement(CATEGORY_ICONS[category], { className: 'h-5 w-5' })}
                <CardTitle>{CATEGORY_DISPLAY_NAMES[category] || category} Models</CardTitle>
                <Badge variant="secondary">{models.length}</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={loadPricing}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Billing Type</TableHead>
                  <TableHead className="text-right">Input/1M</TableHead>
                  <TableHead className="text-right">Output/1M</TableHead>
                  <TableHead className="text-right">Markup</TableHead>
                  <TableHead className="text-right">Example Cost</TableHead>
                  <TableHead>Auto-Update</TableHead>
                  <TableHead>Last Verified</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map(model => (
                  <TableRow key={model.id}>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{model.model_name}</p>
                          {!model.is_active && (
                            <span className={`text-xs capitalize ${statusTone('Retired')}`}>Retired</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{model.model_key}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground capitalize">{model.provider}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground capitalize">
                        {model.billing_type === 'token_based' && 'Token'}
                        {model.billing_type === 'time_based' && `Time (${model.gpu_type || 'GPU'})`}
                        {model.billing_type === 'per_generation' && 'Per Gen'}
                        {model.billing_type === 'per_unit' && `Per ${model.unit_label || 'unit'}`}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === model.id ? (
                        model.billing_type === 'per_unit' ? (
                          <Input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={editValues.cost_per_unit ?? ''}
                            onChange={e => setEditValues({ ...editValues, cost_per_unit: e.target.value })}
                            aria-invalid={isFieldInvalid('cost_per_unit')}
                            className="w-20 h-7 text-right"
                          />
                        ) : (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editValues.input_price_per_million ?? ''}
                            onChange={e => setEditValues({ ...editValues, input_price_per_million: e.target.value })}
                            aria-invalid={isFieldInvalid('input_price_per_million')}
                            className="w-20 h-7 text-right"
                          />
                        )
                      ) : (
                        model.billing_type === 'token_based' ? formatPrice(model.input_price_per_million, 2) :
                        model.billing_type === 'time_based' ? `${formatPrice(model.hourly_rate_usd, 2)}/hr` :
                        model.billing_type === 'per_unit' ? `${formatPrice(model.cost_per_unit, 4)}/${model.unit_label || 'unit'}` :
                        formatPrice(model.cost_per_generation, 3)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === model.id && model.billing_type === 'token_based' ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editValues.output_price_per_million ?? ''}
                          onChange={e => setEditValues({ ...editValues, output_price_per_million: e.target.value })}
                          aria-invalid={isFieldInvalid('output_price_per_million')}
                          className="w-20 h-7 text-right"
                        />
                      ) : (
                        model.billing_type === 'token_based' ? formatPrice(model.output_price_per_million, 2) : '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === model.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={editValues.markup_multiplier ?? ''}
                          onChange={e => setEditValues({ ...editValues, markup_multiplier: e.target.value })}
                          aria-invalid={isFieldInvalid('markup_multiplier')}
                          className="w-16 h-7 text-right"
                        />
                      ) : (
                        <span className="text-emerald-600 font-medium">
                          {((model.markup_multiplier - 1) * 100).toFixed(0)}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs text-muted-foreground">
                        {formatPrice(calculateBilledCost(model), 4)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleAutoUpdate(model)}
                        className="flex items-center gap-1"
                      >
                        {model.auto_update_enabled ? (
                          <ToggleRight className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(model.last_verified_at)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {editingId === model.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={saveEditing}
                              disabled={saving}
                              className="h-7 w-7"
                            >
                              <Check className="h-4 w-4 text-emerald-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={cancelEditing}
                              className="h-7 w-7"
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startEditing(model)}
                              className="h-7 w-7"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            {model.source_url && (
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                className="h-7 w-7"
                              >
                                <a href={model.source_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Auto-Update Controls */}
      <Card className="dashboard-card border-primary/20">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Auto-Update Schedule</p>
                <p className="text-sm text-muted-foreground">
                  Models with auto-update enabled will have their prices checked weekly from their source URLs.
                  The edge function runs every Sunday at midnight UTC.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {pricing.filter(p => p.auto_update_enabled).length} of {pricing.length} models have auto-update enabled
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncPricesNow(false)}
                disabled={syncing}
                className="rounded-full"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                Sync now
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncPricesNow(true)}
                disabled={syncing}
                className="rounded-full"
              >
                Sync All
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIModelPricingTab;
