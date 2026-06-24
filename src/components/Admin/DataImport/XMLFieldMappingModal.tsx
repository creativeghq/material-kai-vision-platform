/**
 * XML Field Mapping Modal — "Fill the Gaps"
 *
 * Dynamic preview panel that detects per-XML what's missing / sparse / in
 * conflict against the platform's product schema and lets the operator
 * resolve each case inline before import.
 *
 * The category was picked on the upload screen — this modal no longer asks
 * for it. Every other target field is rendered per-row based on its detected
 * state:
 *
 *   - blocking_required   (required target with 0 mapped tags OR all empty)
 *   - present             (required target with 1 mapped tag, 100% coverage)
 *   - partial             (required target with 1 mapped tag, partial coverage)
 *   - conflict            (required target with ≥2 mapped tags)
 *   - optional_present    (optional target with at least 1 mapped tag)
 *   - optional_missing    (optional target with no mapped tag)
 *
 * For partial / conflict / optional rows we let the operator type a job-level
 * default value that becomes a per-row fallback at import time — this is the
 * actual escape hatch for sparse supplier feeds (e.g. Panagoulas, which only
 * has <Manufacturer> on ~74% of rows).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
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
import { edgeErrorMessage } from '@/utils/edgeError';
import { XMLProductPreviewModal } from './XMLProductPreviewModal';

interface DetectedField {
  xml_field: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
  data_type: string;
  total_rows?: number;
  present_count?: number;
  coverage_pct?: number;
  distinct_values?: number;
}

interface XMLFieldMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  detectedFields: DetectedField[];
  suggestedMappings: Record<string, string>;
  totalRows: number;
  category: string;
  xmlFile: File | null;
  xmlContent?: string;
  onMappingConfirmed: (jobId?: string) => void;
}

// Target schema. `material_category` is set at the upload step (job-level), so
// it's NOT rendered here as a gap row — it's already known.
const TARGET_FIELDS: Array<{ value: string; label: string; required: boolean }> = [
  { value: 'name', label: 'Product Name', required: true },
  { value: 'factory_name', label: 'Factory / Manufacturer', required: true },
  { value: 'description', label: 'Description', required: false },
  { value: 'factory_group_name', label: 'Factory Group', required: false },
  { value: 'price', label: 'Price', required: false },
  { value: 'color', label: 'Color', required: false },
  { value: 'colors', label: 'Colors (Multiple)', required: false },
  { value: 'dimensions', label: 'Dimensions', required: false },
  { value: 'size', label: 'Size', required: false },
  { value: 'designer', label: 'Designer', required: false },
  { value: 'collection', label: 'Collection', required: false },
  { value: 'finish', label: 'Finish', required: false },
  { value: 'material', label: 'Material', required: false },
  { value: 'images', label: 'Image URLs', required: false },
  { value: 'external_sku', label: 'SKU / External ID', required: false },
];

// Targets that, when mapped, count as "auto-mapped" so we can collapse them.
const KNOWN_TARGETS = new Set(TARGET_FIELDS.map((t) => t.value));

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

/**
 * Roll up the per-XML-field detection into a per-target state used by the
 * Fill-the-Gaps panel. Pure function — no side effects, recomputes on every
 * mapping/manualValues change.
 */
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

  return TARGET_FIELDS.map(({ value: target, label, required }) => {
    const mapped = inverse.get(target) || [];

    if (mapped.length === 0) {
      return {
        target,
        label,
        required,
        mapped_xml_fields: [],
        state: required
          ? { kind: 'blocking_required' as const }
          : { kind: 'optional_missing' as const },
      };
    }

    if (mapped.length > 1) {
      return {
        target,
        label,
        required,
        mapped_xml_fields: mapped,
        state: { kind: 'conflict' as const, xml_fields: mapped },
      };
    }

    // Exactly one mapped XML field — use its coverage.
    const xmlField = mapped[0];
    const detection = detectionByField.get(xmlField);
    const coverage_pct = detection?.coverage_pct ?? (totalRows > 0 ? 100 : 0);
    const present_count = detection?.present_count ?? totalRows;
    const rows = detection?.total_rows ?? totalRows;

    if (coverage_pct === 0 && required) {
      return {
        target,
        label,
        required,
        mapped_xml_fields: mapped,
        state: { kind: 'blocking_required' as const },
      };
    }

    if (coverage_pct >= 100) {
      return {
        target,
        label,
        required,
        mapped_xml_fields: mapped,
        state: required
          ? { kind: 'present' as const }
          : { kind: 'optional_present' as const, coverage_pct },
      };
    }

    return {
      target,
      label,
      required,
      mapped_xml_fields: mapped,
      state: required
        ? {
            kind: 'partial' as const,
            coverage_pct,
            present_count,
            total_rows: rows,
          }
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

const XMLFieldMappingModal: React.FC<XMLFieldMappingModalProps> = ({
  isOpen,
  onClose,
  detectedFields,
  suggestedMappings,
  totalRows,
  category,
  xmlFile,
  xmlContent,
  onMappingConfirmed,
}) => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>(suggestedMappings);
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [templateName, setTemplateName] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<any>(null);
  const [previewValueSources, setPreviewValueSources] = useState<Record<string, 'xml' | 'default'>>({});
  const [previewTotal, setPreviewTotal] = useState(0);
  const [xmlBase64, setXmlBase64] = useState<string>('');

  useEffect(() => {
    const loadWorkspace = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();
      if (workspaceData) setWorkspaceId(workspaceData.workspace_id);
    };
    loadWorkspace();
  }, []);

  // Sync mappings if the parent re-runs detection (e.g. user re-uploads).
  useEffect(() => {
    setFieldMappings(suggestedMappings);
  }, [suggestedMappings]);

  const targetGaps = useMemo(
    () => buildTargetGaps(detectedFields, fieldMappings, totalRows),
    [detectedFields, fieldMappings, totalRows],
  );

  // Auto-mapped XML fields that resolve to a known target without conflict.
  // We hide these in a collapsed accordion to keep the panel focused on gaps.
  const autoMappedCount = useMemo(
    () =>
      detectedFields.filter((f) => {
        const target = fieldMappings[f.xml_field];
        return target && KNOWN_TARGETS.has(target);
      }).length,
    [detectedFields, fieldMappings],
  );

  // Fields the orchestrator routed to 'metadata' or that have no target — these
  // are not gaps either; they go into the JSONB metadata blob automatically.
  const metadataFields = useMemo(
    () =>
      detectedFields.filter((f) => {
        const target = fieldMappings[f.xml_field];
        return !target || target === 'metadata' || !KNOWN_TARGETS.has(target);
      }),
    [detectedFields, fieldMappings],
  );

  const handleMappingChange = (xmlField: string, target: string) => {
    setFieldMappings((prev) => ({ ...prev, [xmlField]: target }));
  };

  const handleManualValueChange = (target: string, value: string) => {
    setManualValues((prev) => ({ ...prev, [target]: value }));
  };

  // Conflict resolver: when the operator picks the winner, route the losing
  // tags to 'metadata' so they're preserved in the JSONB blob (not lost).
  const handleConflictResolve = (target: string, winnerXmlField: string) => {
    setFieldMappings((prev) => {
      const next = { ...prev };
      for (const [xmlField, t] of Object.entries(next)) {
        if (t === target && xmlField !== winnerXmlField) {
          next[xmlField] = 'metadata';
        }
      }
      next[winnerXmlField] = target;
      return next;
    });
  };

  // A blocking_required gap is "resolved" if the operator filled a manual value.
  const blockingRequired = targetGaps.filter(
    (g) => g.state.kind === 'blocking_required' && !manualValues[g.target]?.trim(),
  );
  const conflicts = targetGaps.filter((g) => g.state.kind === 'conflict');
  const canSubmit = blockingRequired.length === 0 && conflicts.length === 0;

  const ensureBase64 = async (): Promise<string> => {
    if (xmlBase64) return xmlBase64;
    let xmlText: string;
    if (xmlFile) xmlText = await xmlFile.text();
    else if (xmlContent) xmlText = xmlContent;
    else throw new Error('No XML content available');
    const encoder = new TextEncoder();
    const uint8Array = encoder.encode(xmlText);
    const binaryString = Array.from(uint8Array, (b) => String.fromCharCode(b)).join('');
    const b64 = btoa(binaryString);
    setXmlBase64(b64);
    return b64;
  };

  const handleGeneratePreview = async () => {
    if (!workspaceId) return;
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
      const b64 = await ensureBase64();
      const { data, error: functionError } = await supabase.functions.invoke(
        'xml-import-orchestrator',
        {
          body: {
            workspace_id: workspaceId,
            xml_content: b64,
            category,
            field_mappings: fieldMappings,
            manual_values: manualValues,
            generate_preview: true,
          },
        },
      );

      if (functionError) throw new Error(await edgeErrorMessage(functionError, 'Failed to generate preview'));
      if (!data?.success) throw new Error(data?.error || 'Failed to generate preview');

      setPreviewProduct(data.preview_product);
      setPreviewValueSources(data.preview_value_sources || {});
      setPreviewTotal(data.total_products || totalRows || 0);
      setShowPreview(true);
    } catch (err: any) {
      console.error('Preview generation error:', err);
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
      let templateId: string | undefined;
      if (saveAsTemplate && templateName) {
        const { data: template, error: templateError } = await supabase
          .from('xml_mapping_templates')
          .insert({
            workspace_id: workspaceId,
            template_name: templateName,
            field_mappings: fieldMappings,
            sample_structure: detectedFields,
            mapping_confidence: detectedFields.reduce(
              (acc, field) => ({ ...acc, [field.xml_field]: field.confidence }),
              {},
            ),
          })
          .select()
          .single();

        if (templateError) {
          console.error('Error saving template:', templateError);
        } else {
          templateId = template.id;
        }
      }

      const b64 = await ensureBase64();
      const { data, error: functionError } = await supabase.functions.invoke(
        'xml-import-orchestrator',
        {
          body: {
            workspace_id: workspaceId,
            category,
            xml_content: b64,
            source_name: xmlFile?.name || 'xml_url_import',
            field_mappings: fieldMappings,
            manual_values: manualValues,
            mapping_template_id: templateId,
          },
        },
      );

      if (functionError) throw new Error(await edgeErrorMessage(functionError, 'Import failed'));
      if (!data?.success) throw new Error(data?.error || 'Import failed');

      const jobId = data.job_id || data.data_import_job_id;
      console.log('✅ XML Import started successfully', { jobId, data });
      onMappingConfirmed(jobId);
      onClose();
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to start import');
    } finally {
      setIsImporting(false);
    }
  };

  const renderGapRow = (gap: TargetGap) => {
    const icon = ROW_ICONS[gap.state.kind];
    const color = ROW_COLORS[gap.state.kind];
    const manualValue = manualValues[gap.target] || '';

    let status: React.ReactNode = null;
    let action: React.ReactNode = null;

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
            Mapped from <code className="text-primary">{gap.mapped_xml_fields[0]}</code> ·{' '}
            {gap.state.coverage_pct}% coverage
          </span>
        );
        action =
          gap.state.coverage_pct < 100 ? (
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
              <p className="text-xs text-muted-foreground">
                ✓ {missing} empty rows will be filled with "{manualValue}"
              </p>
            ) : (
              <p className="text-xs text-warning">
                ⚠ {missing} rows will be skipped at import (required field missing)
              </p>
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
            autoFocus={!manualValue}
          />
        );
        break;

      case 'optional_missing':
        status = <span className="text-xs text-muted-foreground">Not in the XML (optional).</span>;
        action = (
          <Input
            placeholder="Optional default value for every row"
            value={manualValue}
            onChange={(e) => handleManualValueChange(gap.target, e.target.value)}
            className="max-w-md"
          />
        );
        break;

      case 'conflict':
        status = (
          <span className="text-xs text-orange-500">
            {gap.state.xml_fields.length} XML tags map to this target — pick the winner.
          </span>
        );
        action = (
          <Select
            value={gap.mapped_xml_fields[0]}
            onValueChange={(v) => handleConflictResolve(gap.target, v)}
          >
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Pick winning tag" />
            </SelectTrigger>
            <SelectContent>
              {gap.state.xml_fields.map((xmlField) => {
                const detection = detectedFields.find((d) => d.xml_field === xmlField);
                const pct = detection?.coverage_pct ?? 0;
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
      <div
        key={gap.target}
        className={`flex flex-col gap-2 rounded-lg border p-3 ${color}`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{gap.label}</span>
          {gap.required && (
            <Badge variant="outline" className="text-xs h-5">
              required
            </Badge>
          )}
        </div>
        {status && <div>{status}</div>}
        {action && <div>{action}</div>}
      </div>
    );
  };

  // Group rows by severity so the panel scans top-to-bottom: blocking →
  // conflicts → partial → optional → already-fine.
  const severityRank: Record<GapState['kind'], number> = {
    blocking_required: 0,
    conflict: 1,
    partial: 2,
    optional_missing: 3,
    optional_present: 4,
    present: 5,
  };
  const sortedGaps = [...targetGaps].sort(
    (a, b) => severityRank[a.state.kind] - severityRank[b.state.kind],
  );

  const presentGaps = sortedGaps.filter((g) => g.state.kind === 'present');
  const visibleGaps = sortedGaps.filter((g) => g.state.kind !== 'present');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Fill the Gaps
          </DialogTitle>
          <DialogDescription>
            Detected <strong>{detectedFields.length} XML fields</strong> across{' '}
            <strong>{totalRows.toLocaleString()} product rows</strong>. Review and resolve any
            gaps before import.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Gap rows (excluding already-clean targets) */}
        <div className="space-y-2">
          {visibleGaps.length === 0 && (
            <Alert className="border-success/30 bg-success/5">
              <CheckCircle className="h-4 w-4 text-success" />
              <AlertDescription>
                All required fields are present and there are no conflicts. Ready to preview.
              </AlertDescription>
            </Alert>
          )}
          {visibleGaps.map(renderGapRow)}
        </div>

        {/* Collapsed: targets that resolved cleanly */}
        {presentGaps.length > 0 && (
          <Accordion type="single" collapsible className="border rounded-lg">
            <AccordionItem value="auto-mapped">
              <AccordionTrigger className="px-4 text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Auto-mapped ({presentGaps.length})
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

        {/* Collapsed: XML fields routed to metadata */}
        {metadataFields.length > 0 && (
          <Accordion type="single" collapsible className="border rounded-lg">
            <AccordionItem value="metadata">
              <AccordionTrigger className="px-4 text-sm">
                <span className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  Unmapped → metadata ({metadataFields.length})
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3 space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  These XML fields don't match a known target and will be stored in the product's{' '}
                  <code>metadata</code> JSONB blob. You can override by mapping them to a target.
                </p>
                {metadataFields.map((f) => (
                  <div key={f.xml_field} className="flex items-center justify-between gap-2 text-sm">
                    <code className="text-xs text-primary">{f.xml_field}</code>
                    <Select
                      value={fieldMappings[f.xml_field] || 'metadata'}
                      onValueChange={(v) => handleMappingChange(f.xml_field, v)}
                    >
                      <SelectTrigger className="w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="metadata">metadata (default)</SelectItem>
                        {TARGET_FIELDS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                            {t.required ? ' *' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Save as template */}
        <div className="space-y-3 bg-muted/50 p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="save-template"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="save-template" className="cursor-pointer">
              Save as mapping template for future imports
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

        {/* Footer info + actions */}
        <div className="text-xs text-muted-foreground border-t pt-3">
          Auto-mapped: {autoMappedCount} · Routed to metadata: {metadataFields.length} · Total rows:{' '}
          {totalRows.toLocaleString()}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button onClick={handleGeneratePreview} disabled={isImporting || !canSubmit}>
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating Preview...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Preview &amp; Import
              </>
            )}
          </Button>
        </div>
      </DialogContent>

      <XMLProductPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        product={previewProduct}
        valueSources={previewValueSources}
        onConfirm={handleConfirmImport}
        onEdit={() => setShowPreview(false)}
        totalProducts={previewTotal}
      />
    </Dialog>
  );
};

export default XMLFieldMappingModal;
