/** XML Field Mapping Modal — "Fill the Gaps" */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Badge } from '@/components/core/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/core/ui/accordion';
import {
  CheckCircle,
  AlertTriangle,
  Upload,
  Loader2,
  Sparkles,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { edgeErrorMessage } from '@/utils/edgeError';
import { XMLProductPreviewModal } from './XMLProductPreviewModal';
import { formatNumber } from '@/utils/decimal';
import type { AttributeTarget, DetectedField } from './xmlFeedEncoding';

interface XMLFieldMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  detectedFields: DetectedField[];
  suggestedMappings: Record<string, string>;
  totalRows: number;
  category: string;
  attributeTargets: AttributeTarget[];
  xmlBase64: string;
  sourceName: string;
  sourceUrl?: string;
  rowPath?: string;
  onMappingConfirmed: (jobId?: string) => void;
}

/** Product-level targets the importer resolves. Registry fields are added per category as `attr:<field>`. */
const CORE_TARGET_FIELDS: Array<{ value: string; label: string; required: boolean }> = [
  { value: 'name', label: 'Product Name', required: true },
  { value: 'factory_name', label: 'Brand', required: true },
  { value: 'material_category', label: 'Category (per row)', required: false },
  { value: 'description', label: 'Description', required: false },
  { value: 'factory_group_name', label: 'Brand Group', required: false },
  { value: 'external_sku', label: 'SKU / External ID', required: false },
  { value: 'mpn', label: 'MPN (manufacturer part number)', required: false },
  { value: 'barcode', label: 'Barcode / EAN', required: false },
  { value: 'price', label: 'List price (published)', required: false },
  { value: 'supplier_cost', label: 'Supplier cost (never published)', required: false },
  { value: 'currency', label: 'Currency', required: false },
  { value: 'unit', label: 'Selling unit', required: false },
  { value: 'weight', label: 'Weight (kg)', required: false },
  { value: 'images', label: 'Image URLs', required: false },
];

const CORE_TARGETS = new Set(CORE_TARGET_FIELDS.map((t) => t.value));
const ATTRIBUTE_PREFIX = 'attr:';

/** Columns a SUPPLIER'S XML may never name, whatever a mapping says (#365 `AD-34`, invariant 8). */
const NEVER_MAPPABLE = new Set([
  'id', 'workspace_id', 'user_id', 'created_by', 'updated_by',
  'cost', 'cost_source', 'markup_percent', 'supplier_company_id',
  'status', 'is_verified', 'is_locked', 'credits', 'role',
  'attributes_raw',
]);

/**
 * Narrow a mapping to what may be written, and drop source paths the file does not contain
 * (#365 `AD-35`): a mapping whose source is absent reads as complete and imports blank.
 */
function sanitizeMappings(
  mappings: Record<string, string>,
  detected: DetectedField[],
  allowed: Set<string>,
): { clean: Record<string, string>; droppedTargets: string[]; droppedSources: string[] } {
  const known = new Set(detected.map((f) => f.xml_field));
  const clean: Record<string, string> = {};
  const droppedTargets: string[] = [];
  const droppedSources: string[] = [];
  for (const [xmlField, target] of Object.entries(mappings ?? {})) {
    if (!target) continue;
    if (!known.has(xmlField)) { droppedSources.push(xmlField); continue; }
    if (NEVER_MAPPABLE.has(target) || !allowed.has(target)) {
      droppedTargets.push(`${xmlField} → ${target}`);
      clean[xmlField] = 'metadata';
      continue;
    }
    clean[xmlField] = target;
  }
  return { clean, droppedTargets, droppedSources };
}

type GapState =
  | { kind: 'present' }
  | { kind: 'partial'; coverage_pct: number; present_count: number; total_rows: number }
  | { kind: 'blocking_required' }
  | { kind: 'conflict'; xml_fields: string[] }
  | { kind: 'optional_present'; coverage_pct: number }
  | { kind: 'optional_missing' };

interface TargetGap {
  target: string;
  label: string;
  required: boolean;
  state: GapState;
  mapped_xml_fields: string[];
}

/** Per-target state for the Fill-the-Gaps panel, rolled up from the per-field detection. */
function buildTargetGaps(
  detectedFields: DetectedField[],
  fieldMappings: Record<string, string>,
  totalRows: number,
): TargetGap[] {
  const inverse = new Map<string, string[]>();
  for (const [xmlField, target] of Object.entries(fieldMappings)) {
    if (!target) continue;
    if (!inverse.has(target)) inverse.set(target, []);
    inverse.get(target)!.push(xmlField);
  }
  const detectionByField = new Map(detectedFields.map((f) => [f.xml_field, f]));

  return CORE_TARGET_FIELDS.map(({ value: target, label, required }) => {
    const mapped = inverse.get(target) || [];
    if (mapped.length === 0) {
      return {
        target, label, required, mapped_xml_fields: [],
        state: required ? { kind: 'blocking_required' as const } : { kind: 'optional_missing' as const },
      };
    }
    if (mapped.length > 1 && target !== 'images') {
      return { target, label, required, mapped_xml_fields: mapped, state: { kind: 'conflict' as const, xml_fields: mapped } };
    }
    const detection = detectionByField.get(mapped[0]);
    const coverage_pct = detection?.coverage_pct ?? (totalRows > 0 ? 100 : 0);
    const present_count = detection?.present_count ?? totalRows;
    const rows = detection?.total_rows ?? totalRows;
    if (coverage_pct === 0 && required) {
      return { target, label, required, mapped_xml_fields: mapped, state: { kind: 'blocking_required' as const } };
    }
    if (coverage_pct >= 100) {
      return {
        target, label, required, mapped_xml_fields: mapped,
        state: required ? { kind: 'present' as const } : { kind: 'optional_present' as const, coverage_pct },
      };
    }
    return {
      target, label, required, mapped_xml_fields: mapped,
      state: required
        ? { kind: 'partial' as const, coverage_pct, present_count, total_rows: rows }
        : { kind: 'optional_present' as const, coverage_pct },
    };
  });
}

const ROW_COLORS: Record<GapState['kind'], string> = {
  blocking_required: 'border-destructive/40 bg-destructive/5',
  partial: 'border-warning/40 bg-warning/5',
  conflict: 'border-orange-500/40 bg-orange-500/5',
  present: 'border-success/30 bg-success/5',
  optional_present: 'border-border bg-card/30',
  optional_missing: 'border-border bg-card/30',
};

const ROW_ICONS: Record<GapState['kind'], React.ReactNode> = {
  blocking_required: <XCircle className="h-4 w-4 text-destructive" />,
  partial: <AlertTriangle className="h-4 w-4 text-warning" />,
  conflict: <AlertTriangle className="h-4 w-4 text-orange-500" />,
  present: <CheckCircle className="h-4 w-4 text-success" />,
  optional_present: <CheckCircle className="h-4 w-4 text-muted-foreground" />,
  optional_missing: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
};

interface MappingTemplate {
  id: string;
  template_name: string;
  field_mappings: Record<string, string> | null;
  manual_values: Record<string, string> | null;
}

const XMLFieldMappingModal: React.FC<XMLFieldMappingModalProps> = ({
  isOpen,
  onClose,
  detectedFields,
  suggestedMappings,
  totalRows,
  category,
  attributeTargets,
  xmlBase64,
  sourceName,
  sourceUrl,
  rowPath,
  onMappingConfirmed,
}) => {
  const { activeWorkspaceId: workspaceId } = useWorkspace();
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [sanitizeNotice, setSanitizeNotice] = useState<{ targets: string[]; sources: string[] }>({ targets: [], sources: [] });
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [templateName, setTemplateName] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<any>(null);
  const [previewValueSources, setPreviewValueSources] = useState<Record<string, 'xml' | 'default'>>({});
  const [previewTotal, setPreviewTotal] = useState(0);

  const allowedTargets = useMemo(
    () => new Set<string>([
      ...CORE_TARGETS, 'metadata',
      ...attributeTargets.map((t) => `${ATTRIBUTE_PREFIX}${t.field_name}`),
    ]),
    [attributeTargets],
  );
  const targetLabel = useMemo(() => {
    const m = new Map<string, string>(CORE_TARGET_FIELDS.map((t) => [t.value, t.label]));
    for (const t of attributeTargets) m.set(`${ATTRIBUTE_PREFIX}${t.field_name}`, t.label);
    return m;
  }, [attributeTargets]);

  useEffect(() => {
    if (!workspaceId) return;
    supabase
      .from('xml_mapping_templates')
      .select('id, template_name, field_mappings, manual_values')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .then(({ data, error: tplError }) => {
        if (tplError) setError(`Could not load mapping templates: ${tplError.message}`);
        else setTemplates((data ?? []) as unknown as MappingTemplate[]);
      });
  }, [workspaceId]);

  const applyMappings = (raw: Record<string, string>) => {
    const { clean, droppedTargets, droppedSources } = sanitizeMappings(raw, detectedFields, allowedTargets);
    setSanitizeNotice({ targets: droppedTargets, sources: droppedSources });
    setFieldMappings(clean);
  };

  useEffect(() => {
    applyMappings(suggestedMappings);
  }, [suggestedMappings, detectedFields, allowedTargets]);

  const handleTemplatePick = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    applyMappings({ ...suggestedMappings, ...(tpl.field_mappings ?? {}) });
    setManualValues(tpl.manual_values ?? {});
  };

  const targetGaps = useMemo(
    () => buildTargetGaps(detectedFields, fieldMappings, totalRows),
    [detectedFields, fieldMappings, totalRows],
  );

  const mappedCount = useMemo(
    () => detectedFields.filter((f) => {
      const t = fieldMappings[f.xml_field];
      return t && t !== 'metadata';
    }).length,
    [detectedFields, fieldMappings],
  );

  const handleMappingChange = (xmlField: string, target: string) => {
    setFieldMappings((prev) => ({ ...prev, [xmlField]: target }));
  };

  const handleManualValueChange = (target: string, value: string) => {
    setManualValues((prev) => ({ ...prev, [target]: value }));
  };

  const handleConflictResolve = (target: string, winnerXmlField: string) => {
    setFieldMappings((prev) => {
      const next = { ...prev };
      for (const [xmlField, t] of Object.entries(next)) {
        if (t === target && xmlField !== winnerXmlField) next[xmlField] = 'metadata';
      }
      next[winnerXmlField] = target;
      return next;
    });
  };

  const blockingRequired = targetGaps.filter(
    (g) => g.state.kind === 'blocking_required' && !manualValues[g.target]?.trim(),
  );
  const conflicts = targetGaps.filter((g) => g.state.kind === 'conflict');
  const canSubmit = blockingRequired.length === 0 && conflicts.length === 0 && !!workspaceId && !!xmlBase64;

  const cleanManualValues = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(manualValues)) {
      if (v?.trim() && allowedTargets.has(k)) out[k] = v.trim();
    }
    return out;
  };

  const requestBody = () => ({
    workspace_id: workspaceId,
    xml_content: xmlBase64,
    category,
    row_path: rowPath,
    field_mappings: sanitizeMappings(fieldMappings, detectedFields, allowedTargets).clean,
    manual_values: cleanManualValues(),
  });

  const handleGeneratePreview = async () => {
    if (!canSubmit) {
      setError(
        blockingRequired.length > 0
          ? `Resolve required gaps: ${blockingRequired.map((g) => g.label).join(', ')}`
          : `Resolve conflicts: ${conflicts.map((g) => g.label).join(', ')}`,
      );
      return;
    }
    setIsImporting(true);
    setError(null);
    try {
      const { data, error: functionError } = await supabase.functions.invoke('xml-import-orchestrator', {
        body: { ...requestBody(), generate_preview: true },
      });
      if (functionError) throw new Error(await edgeErrorMessage(functionError, 'Failed to generate preview'));
      if (!data?.success) throw new Error(data?.error || 'Failed to generate preview');
      setPreviewProduct(data.preview_product);
      setPreviewValueSources(data.preview_value_sources || {});
      setPreviewTotal(data.total_products || totalRows || 0);
      setShowPreview(true);
    } catch (err: any) {
      setError(err.message || 'Failed to generate preview');
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!workspaceId) return;
    setIsImporting(true);
    setError(null);
    try {
      let mappingTemplateId = templateId;
      if (saveAsTemplate && templateName.trim()) {
        const { data: template, error: templateError } = await supabase
          .from('xml_mapping_templates')
          .insert({
            workspace_id: workspaceId,
            template_name: templateName.trim(),
            field_mappings: sanitizeMappings(fieldMappings, detectedFields, allowedTargets).clean,
            manual_values: cleanManualValues(),
            sample_structure: detectedFields,
            mapping_confidence: detectedFields.reduce(
              (acc, field) => ({ ...acc, [field.xml_field]: field.confidence }),
              {},
            ),
          } as never)
          .select('id')
          .single();
        if (templateError) throw new Error(`Could not save the mapping template: ${templateError.message}`);
        mappingTemplateId = (template as { id: string }).id;
      }

      const { data, error: functionError } = await supabase.functions.invoke('xml-import-orchestrator', {
        body: {
          ...requestBody(),
          source_name: sourceName,
          source_url: sourceUrl,
          mapping_template_id: mappingTemplateId,
        },
      });
      if (functionError) throw new Error(await edgeErrorMessage(functionError, 'Import failed'));
      if (!data?.success) throw new Error(data?.error || 'Import failed');
      onMappingConfirmed(data.job_id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to start import');
    } finally {
      setIsImporting(false);
    }
  };

  const renderTargetSelect = (xmlField: string, className = 'w-[260px]') => (
    <Select
      value={fieldMappings[xmlField] || 'metadata'}
      onValueChange={(v) => handleMappingChange(xmlField, v)}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="metadata">Keep as extra data</SelectItem>
        <SelectGroup>
          <SelectLabel>Product</SelectLabel>
          {CORE_TARGET_FIELDS.map((t) => (
            <SelectItem key={t.value} value={t.value}>{t.label}{t.required ? ' *' : ''}</SelectItem>
          ))}
        </SelectGroup>
        {attributeTargets.length > 0 && (
          <SelectGroup>
            <SelectLabel>Category fields</SelectLabel>
            {attributeTargets.map((t) => (
              <SelectItem key={t.field_name} value={`${ATTRIBUTE_PREFIX}${t.field_name}`}>{t.label}</SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );

  const renderGapRow = (gap: TargetGap) => {
    const manualValue = manualValues[gap.target] || '';
    let status: React.ReactNode = null;
    let action: React.ReactNode = null;
    const isCategory = gap.target === 'material_category';

    switch (gap.state.kind) {
      case 'present':
        status = (
          <span className="text-xs text-muted-foreground">
            Mapped from <code className="text-primary">{gap.mapped_xml_fields[0]}</code> · 100% coverage
          </span>
        );
        break;
      case 'optional_present':
        status = (
          <span className="text-xs text-muted-foreground">
            Mapped from <code className="text-primary">{gap.mapped_xml_fields.join(', ')}</code> ·{' '}
            {gap.state.coverage_pct}% coverage
            {isCategory && ` · rows that do not resolve use “${category}”`}
          </span>
        );
        action = gap.state.coverage_pct < 100 && !isCategory ? (
          <Input
            placeholder="Optional default for empty rows"
            value={manualValue}
            onChange={(e) => handleManualValueChange(gap.target, e.target.value)}
            className="max-w-md"
          />
        ) : null;
        break;
      case 'partial': {
        const { coverage_pct, present_count, total_rows } = gap.state;
        const missing = total_rows - present_count;
        status = (
          <span className="text-xs text-warning">
            Mapped from <code className="text-primary">{gap.mapped_xml_fields[0]}</code> · only{' '}
            {coverage_pct}% coverage ({present_count}/{total_rows})
          </span>
        );
        action = (
          <div className="space-y-1">
            <Input
              placeholder={`Default value for the ${missing} empty rows (leave blank to drop them)`}
              value={manualValue}
              onChange={(e) => handleManualValueChange(gap.target, e.target.value)}
              className="max-w-md"
            />
            {manualValue.trim() ? (
              <p className="text-xs text-muted-foreground">{missing} empty rows will be filled with “{manualValue}”</p>
            ) : (
              <p className="text-xs text-warning">{missing} rows will be skipped at import (required field missing)</p>
            )}
          </div>
        );
        break;
      }
      case 'blocking_required':
        status = (
          <span className="text-xs text-destructive">
            {gap.mapped_xml_fields.length === 0
              ? 'Not present in the XML — type a value to apply to every row.'
              : `Mapped from ${gap.mapped_xml_fields[0]} but no row has a value.`}
          </span>
        );
        action = (
          <Input
            placeholder={`Enter ${gap.label} (required)`}
            value={manualValue}
            onChange={(e) => handleManualValueChange(gap.target, e.target.value)}
            className="max-w-md"
          />
        );
        break;
      case 'optional_missing':
        if (isCategory) {
          status = <span className="text-xs text-muted-foreground">Not mapped — every row uses “{category}”.</span>;
          break;
        }
        status = <span className="text-xs text-muted-foreground">Not in the XML (optional).</span>;
        action = gap.target === 'images' ? null : (
          <Input
            placeholder={gap.target === 'currency' ? 'e.g. EUR — prices without a currency are refused' : 'Optional default value for every row'}
            value={manualValue}
            onChange={(e) => handleManualValueChange(gap.target, e.target.value)}
            className="max-w-md"
          />
        );
        break;
      case 'conflict':
        status = (
          <span className="text-xs text-orange-500">
            {gap.state.xml_fields.length} XML fields map to this target — pick the winner.
          </span>
        );
        action = (
          <Select value={gap.mapped_xml_fields[0]} onValueChange={(v) => handleConflictResolve(gap.target, v)}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Pick winning field" />
            </SelectTrigger>
            <SelectContent>
              {gap.state.xml_fields.map((xmlField) => {
                const pct = detectedFields.find((d) => d.xml_field === xmlField)?.coverage_pct ?? 0;
                return (
                  <SelectItem key={xmlField} value={xmlField}>
                    <code>{xmlField}</code> · {pct}% coverage
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        );
        break;
    }

    return (
      <div key={gap.target} className={`flex flex-col gap-2 rounded-lg border p-3 ${ROW_COLORS[gap.state.kind]}`}>
        <div className="flex items-center gap-2">
          {ROW_ICONS[gap.state.kind]}
          <span className="font-medium text-sm">{gap.label}</span>
          {gap.required && <Badge variant="outline" className="text-xs h-5">required</Badge>}
        </div>
        {status && <div>{status}</div>}
        {action && <div>{action}</div>}
      </div>
    );
  };

  const severityRank: Record<GapState['kind'], number> = {
    blocking_required: 0, conflict: 1, partial: 2, optional_missing: 3, optional_present: 4, present: 5,
  };
  const sortedGaps = [...targetGaps].sort((a, b) => severityRank[a.state.kind] - severityRank[b.state.kind]);
  const visibleGaps = sortedGaps.filter((g) => g.state.kind !== 'present');
  const presentGaps = sortedGaps.filter((g) => g.state.kind === 'present');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Fill the Gaps
          </DialogTitle>
          <DialogDescription>
            Detected <strong>{detectedFields.length} XML fields</strong> across{' '}
            <strong>{formatNumber(totalRows)} product rows</strong>. Review and resolve any gaps before import.
          </DialogDescription>
        </DialogHeader>

        {templates.length > 0 && (
          <div className="flex items-center gap-3">
            <Label className="text-sm">Mapping template</Label>
            <Select value={templateId} onValueChange={handleTemplatePick}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Apply a saved template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {(sanitizeNotice.targets.length > 0 || sanitizeNotice.sources.length > 0) && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {sanitizeNotice.targets.length > 0 && (
                <p>
                  <span className="font-medium">{sanitizeNotice.targets.length} mapping(s) named a field this import cannot set</span>{' '}
                  — kept as extra data instead: {sanitizeNotice.targets.join(', ')}
                </p>
              )}
              {sanitizeNotice.sources.length > 0 && (
                <p>
                  <span className="font-medium">{sanitizeNotice.sources.length} mapping(s) named a field this file does not contain</span>{' '}
                  — dropped: {sanitizeNotice.sources.join(', ')}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          {visibleGaps.map(renderGapRow)}
        </div>

        {presentGaps.length > 0 && (
          <Accordion type="single" collapsible className="border rounded-lg">
            <AccordionItem value="auto-mapped">
              <AccordionTrigger className="px-4 text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Complete ({presentGaps.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3 space-y-2">
                {presentGaps.map((g) => (
                  <div key={g.target} className="flex items-center justify-between text-sm">
                    <span>{g.label}</span>
                    <code className="text-xs text-primary">{g.mapped_xml_fields[0]}</code>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <Accordion type="single" collapsible className="border rounded-lg">
          <AccordionItem value="fields">
            <AccordionTrigger className="px-4 text-sm">
              <span className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                All XML fields ({detectedFields.length})
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                Map a field to a product target or to one of the <strong>{category}</strong> fields. Anything
                left as extra data is stored on the product under its XML path.
              </p>
              {detectedFields.map((f) => (
                <div key={f.xml_field} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <code className="text-xs text-primary break-all">{f.xml_field}</code>
                    <p className="text-xs text-muted-foreground truncate">{f.sample_values.slice(0, 2).join(' · ')}</p>
                  </div>
                  {renderTargetSelect(f.xml_field)}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="space-y-3 bg-muted/50 p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <Checkbox
              id="save-template"
              checked={saveAsTemplate}
              onCheckedChange={(v) => setSaveAsTemplate(v === true)}
              className="rounded"
            />
            <Label htmlFor="save-template" className="cursor-pointer">
              Save mappings and defaults as a template for future imports
            </Label>
          </div>
          {saveAsTemplate && (
            <Input
              placeholder="Template name (e.g. 'Panagoulas catalog')"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          )}
        </div>

        <div className="text-xs text-muted-foreground border-t pt-3">
          Mapped: {mappedCount} · Extra data: {detectedFields.length - mappedCount} · Total rows:{' '}
          {formatNumber(totalRows)}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isImporting}>Cancel</Button>
          <Button onClick={handleGeneratePreview} disabled={isImporting || !canSubmit}>
            {isImporting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating Preview...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" />Preview &amp; Import</>
            )}
          </Button>
        </div>
      </DialogContent>

      <XMLProductPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        product={previewProduct}
        valueSources={previewValueSources}
        targetLabel={(t) => targetLabel.get(`${ATTRIBUTE_PREFIX}${t}`) ?? t}
        onConfirm={handleConfirmImport}
        onEdit={() => setShowPreview(false)}
        totalProducts={previewTotal}
        isImporting={isImporting}
      />
    </Dialog>
  );
};

export default XMLFieldMappingModal;
