/**
 * XML Field Mapping Modal
 *
 * Interactive UI for reviewing and adjusting AI-suggested field mappings
 * Allows users to map XML fields to product schema and save as templates
 */

import React, { useState } from 'react';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/core/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/core/ui/popover';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import {
  CheckCircle,
  AlertTriangle,
  Upload,
  Loader2,
  Sparkles,
  ChevronsUpDown,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { XMLProductPreviewModal } from './XMLProductPreviewModal';

interface DetectedField {
  xml_field: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
  data_type: string;
}

interface XMLFieldMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  detectedFields: DetectedField[];
  suggestedMappings: Record<string, string>;
  xmlFile: File | null;
  xmlContent?: string; // Optional: for URL-based XML content
  onMappingConfirmed: (jobId?: string) => void;
}

// Target schema fields
const TARGET_FIELDS = [
  { value: 'name', label: 'Product Name', required: true },
  { value: 'factory_name', label: 'Factory/Manufacturer', required: true },
  { value: 'material_category', label: 'Material Category', required: true },
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
  { value: 'metadata', label: 'Additional Metadata', required: false },
];

// Searchable Combobox for field mapping
interface FieldMappingComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

const FieldMappingCombobox: React.FC<FieldMappingComboboxProps> = ({
  value,
  onValueChange,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);

  const selectedField = TARGET_FIELDS.find((field) => field.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">
            {selectedField ? (
              <>
                {selectedField.label}
                {selectedField.required && <span className="text-red-500 ml-1">*</span>}
              </>
            ) : (
              'Select field...'
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search fields..." />
          <CommandList>
            <CommandEmpty>No field found.</CommandEmpty>
            <CommandGroup heading="Required Fields">
              {TARGET_FIELDS.filter((f) => f.required).map((field) => (
                <CommandItem
                  key={field.value}
                  value={field.value}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? '' : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === field.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {field.label}
                  <span className="text-red-500 ml-1">*</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Optional Fields">
              {TARGET_FIELDS.filter((f) => !f.required).map((field) => (
                <CommandItem
                  key={field.value}
                  value={field.value}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? '' : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === field.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {field.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const XMLFieldMappingModal: React.FC<XMLFieldMappingModalProps> = ({
  isOpen,
  onClose,
  detectedFields,
  suggestedMappings,
  xmlFile,
  xmlContent,
  onMappingConfirmed,
}) => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>(suggestedMappings);
  const [templateName, setTemplateName] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [category, setCategory] = useState('materials');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualValues, setManualValues] = useState<Record<string, string>>({
    factory_name: '',
    name: '',
    material_category: '',
  });
  const [categories, setCategories] = useState<Array<{ category_key: string; display_name: string; name: string }>>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<any>(null);
  const [totalProducts, setTotalProducts] = useState(0);
  const [xmlBase64, setXmlBase64] = useState<string>('');

  // Load workspace ID and categories on mount
  React.useEffect(() => {
    const loadData = async () => {
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

      if (workspaceData) {
        setWorkspaceId(workspaceData.workspace_id);
      }

      // Load material categories from database
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('material_categories')
        .select('category_key, name, display_name')
        .eq('is_active', true)
        .order('sort_order');

      if (!categoriesError && categoriesData) {
        setCategories(categoriesData);
        // Set first category as default if available
        if (categoriesData.length > 0 && !category) {
          setCategory(categoriesData[0].category_key);
        }
      }
    };

    loadData();
  }, []);

  const handleMappingChange = (xmlField: string, targetField: string) => {
    setFieldMappings((prev) => ({
      ...prev,
      [xmlField]: targetField,
    }));
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) {
      return (
        <Badge className="bg-[hsl(var(--success-bg))] text-success border-success/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          {(confidence * 100).toFixed(0)}%
        </Badge>
      );
    } else if (confidence >= 0.7) {
      return (
        <Badge className="bg-[hsl(var(--warning-bg))] text-warning border-warning/30">
          <Sparkles className="h-3 w-3 mr-1" />
          {(confidence * 100).toFixed(0)}%
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-[hsl(var(--error-bg))] text-destructive border-destructive/30">
          <AlertTriangle className="h-3 w-3 mr-1" />
          {(confidence * 100).toFixed(0)}%
        </Badge>
      );
    }
  };

  const validateMappings = (): boolean => {
    const requiredFields = ['name', 'factory_name', 'material_category'];
    const mappedFields = Object.values(fieldMappings);

    for (const required of requiredFields) {
      // Check if field is mapped OR has a manual value
      if (!mappedFields.includes(required) && !manualValues[required]) {
        setError(`Missing required field: ${required}. Please map it or provide a manual value.`);
        return false;
      }
    }

    return true;
  };

  const getMissingRequiredFields = (): string[] => {
    const requiredFields = ['name', 'factory_name', 'material_category'];
    const mappedFields = Object.values(fieldMappings);
    return requiredFields.filter(field => !mappedFields.includes(field));
  };

  const handleGeneratePreview = async () => {
    if (!validateMappings()) return;
    if (!workspaceId) return;

    setIsImporting(true);
    setError(null);

    try {
      // Read XML content - either from file or from prop
      let xmlText: string;
      if (xmlFile) {
        xmlText = await xmlFile.text();
      } else if (xmlContent) {
        xmlText = xmlContent;
      } else {
        throw new Error('No XML content available');
      }

      // Encode to base64 (UTF-8 safe)
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(xmlText);
      const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
      const base64 = btoa(binaryString);
      setXmlBase64(base64);

      // Generate preview
      const { data, error: functionError } = await supabase.functions.invoke(
        'xml-import-orchestrator',
        {
          body: {
            workspace_id: workspaceId,
            xml_content: base64,
            field_mappings: fieldMappings,
            manual_values: manualValues,
            generate_preview: true,
          },
        },
      );

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to generate preview');
      }

      // Show preview modal
      setPreviewProduct(data.preview_product);
      setTotalProducts(data.total_products || 0);
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

      // Save template if requested
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
              (acc, field) => ({
                ...acc,
                [field.xml_field]: field.confidence,
              }),
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

      // Merge manual values into field mappings
      const finalMappings = { ...fieldMappings };
      const missingFields = getMissingRequiredFields();

      // Add manual values as special mappings
      const manualFieldMappings: Record<string, string> = {};
      for (const field of missingFields) {
        if (manualValues[field]) {
          manualFieldMappings[`__manual_${field}`] = field;
        }
      }

      // Call Edge Function to create import job
      const { data, error: functionError } = await supabase.functions.invoke(
        'xml-import-orchestrator',
        {
          body: {
            workspace_id: workspaceId,
            category: category,
            xml_content: xmlBase64,
            source_name: xmlFile?.name || 'xml_url_import',
            field_mappings: { ...finalMappings, ...manualFieldMappings },
            manual_values: manualValues, // Pass manual values separately
            mapping_template_id: templateId,
          },
        },
      );

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Import failed');
      }

      // Success! Pass job ID to parent for redirect
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Review Field Mappings
          </DialogTitle>
          <DialogDescription>
            AI has suggested mappings for {detectedFields.length} fields. Review and adjust as needed.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Category Selection */}
        <div className="space-y-2">
          <Label htmlFor="category">
            Material Category
          </Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.length > 0 ? (
                categories.map((cat) => (
                  <SelectItem key={cat.category_key} value={cat.category_key}>
                    {cat.display_name || cat.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="materials" disabled>
                  Loading categories...
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Field Mappings Table */}
        <div className="border rounded-lg overflow-x-auto">
          <div className="bg-muted px-4 py-3 grid grid-cols-12 gap-4 font-semibold text-sm min-w-[600px]">
            <div className="col-span-3">XML Field</div>
            <div className="col-span-3">Sample Values</div>
            <div className="col-span-4">Map To</div>
            <div className="col-span-2">AI Confidence</div>
          </div>

          <div className="divide-y">
            {detectedFields.map((field) => (
              <div key={field.xml_field} className="px-4 py-3 grid grid-cols-12 gap-4 items-center bg-background hover:bg-muted/50 transition-colors min-w-[600px]">
                <div className="col-span-3">
                  <code className="text-sm text-primary font-mono">{field.xml_field}</code>
                </div>

                <div className="col-span-3">
                  <div className="text-xs text-muted-foreground space-y-1">
                    {field.sample_values.slice(0, 2).map((value, idx) => (
                      <div key={idx} className="truncate" title={value}>
                        {value}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="col-span-4">
                  <FieldMappingCombobox
                    value={fieldMappings[field.xml_field] || 'metadata'}
                    onValueChange={(value) => handleMappingChange(field.xml_field, value)}
                  />
                </div>

                <div className="col-span-2">{getConfidenceBadge(field.confidence)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Manual Input for Missing Required Fields */}
        {getMissingRequiredFields().length > 0 && (
          <div className="space-y-3 bg-[hsl(var(--warning-bg))] border border-warning/30 p-4 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold mb-2">
                  Missing Required Fields
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  The following required fields could not be auto-detected. Please provide values manually:
                </p>
                <div className="space-y-3">
                  {getMissingRequiredFields().map((field) => (
                    <div key={field} className="space-y-1">
                      <Label htmlFor={`manual-${field}`}>
                        {TARGET_FIELDS.find(f => f.value === field)?.label || field}
                        <span className="text-destructive ml-1">*</span>
                      </Label>
                      <Input
                        id={`manual-${field}`}
                        placeholder={`Enter ${TARGET_FIELDS.find(f => f.value === field)?.label || field}`}
                        value={manualValues[field] || ''}
                        onChange={(e) => setManualValues(prev => ({ ...prev, [field]: e.target.value }))}
                        className=""
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save as Template */}
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
              placeholder="Template name (e.g., 'Supplier ABC Catalog')"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleGeneratePreview}
            disabled={isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating Preview...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Preview & Import
              </>
            )}
          </Button>
        </div>
      </DialogContent>

      {/* Product Preview Modal */}
      <XMLProductPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        product={previewProduct}
        onConfirm={handleConfirmImport}
        onEdit={() => setShowPreview(false)}
        totalProducts={totalProducts}
      />
    </Dialog>
  );
};

export default XMLFieldMappingModal;

