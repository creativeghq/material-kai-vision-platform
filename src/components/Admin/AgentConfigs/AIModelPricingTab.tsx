import React, { useState, useEffect } from 'react';
import { DollarSign, RefreshCw, Save, Edit2, Clock, Cpu, Image, Sparkles, ToggleLeft, ToggleRight, ExternalLink, Check, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

const CATEGORY_COLORS: Record<string, string> = {
  llm: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  embedding: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  vision: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  generation: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  external_service: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'bg-orange-100 text-orange-700',
  openai: 'bg-green-100 text-green-700',
  voyage: 'bg-purple-100 text-purple-700',
  huggingface: 'bg-yellow-100 text-yellow-700',
  replicate: 'bg-pink-100 text-pink-700',
  twilio: 'bg-red-100 text-red-700',
  apollo: 'bg-cyan-100 text-cyan-700',
  hunter: 'bg-yellow-100 text-yellow-700',
  zerobounce: 'bg-blue-100 text-blue-700',
  firecrawl: 'bg-orange-100 text-orange-700',
  xai: 'bg-slate-100 text-slate-700',
  runway: 'bg-pink-100 text-pink-700',
  late: 'bg-emerald-100 text-emerald-700',
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

export const AIModelPricingTab: React.FC = () => {
  const [pricing, setPricing] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ModelPricing>>({});
  const [saving, setSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadPricing();
  }, []);

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
      input_price_per_million: model.input_price_per_million,
      output_price_per_million: model.output_price_per_million,
      hourly_rate_usd: model.hourly_rate_usd,
      cost_per_generation: model.cost_per_generation,
      cost_per_unit: model.cost_per_unit,
      markup_multiplier: model.markup_multiplier,
      auto_update_enabled: model.auto_update_enabled,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEditing = async () => {
    if (!editingId) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('ai_model_pricing')
        .update({
          ...editValues,
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

      if (error) throw error;

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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const categories = ['all', ...Array.from(new Set(pricing.map(p => p.category).filter(Boolean)))];
  const filteredPricing = selectedCategory === 'all'
    ? pricing
    : pricing.filter(p => p.category === selectedCategory);

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
                <p className="text-2xl font-bold">{pricing.filter(p => p.category === 'llm').length}</p>
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
                <p className="text-2xl font-bold">{pricing.filter(p => p.category === 'embedding').length}</p>
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
                <p className="text-2xl font-bold">{pricing.filter(p => p.category === 'vision').length}</p>
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
                <p className="text-2xl font-bold">{pricing.filter(p => p.category === 'external_service').length}</p>
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
                        <p className="font-medium">{model.model_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{model.model_key}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={PROVIDER_COLORS[model.provider] || 'bg-gray-100 text-gray-700'}>
                        {model.provider}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {model.billing_type === 'token_based' && 'Token'}
                        {model.billing_type === 'time_based' && `Time (${model.gpu_type || 'GPU'})`}
                        {model.billing_type === 'per_generation' && 'Per Gen'}
                        {model.billing_type === 'per_unit' && `Per ${model.unit_label || 'unit'}`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === model.id ? (
                        model.billing_type === 'per_unit' ? (
                          <Input
                            type="number"
                            step="0.0001"
                            value={editValues.cost_per_unit ?? model.cost_per_unit}
                            onChange={e => setEditValues({ ...editValues, cost_per_unit: parseFloat(e.target.value) })}
                            className="w-20 h-7 text-right"
                          />
                        ) : (
                          <Input
                            type="number"
                            step="0.01"
                            value={editValues.input_price_per_million ?? model.input_price_per_million}
                            onChange={e => setEditValues({ ...editValues, input_price_per_million: parseFloat(e.target.value) })}
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
                          value={editValues.output_price_per_million ?? model.output_price_per_million}
                          onChange={e => setEditValues({ ...editValues, output_price_per_million: parseFloat(e.target.value) })}
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
                          value={editValues.markup_multiplier ?? model.markup_multiplier}
                          onChange={e => setEditValues({ ...editValues, markup_multiplier: parseFloat(e.target.value) })}
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
                Sync Now
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
