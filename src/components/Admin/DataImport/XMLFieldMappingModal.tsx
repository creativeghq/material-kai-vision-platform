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
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  AlertTriangle,
  Save,
  Upload,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
  xmlFile: File;
  onMappingConfirmed: () => void;
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

const XMLFieldMappingModal: React.FC<XMLFieldMappingModalProps> = ({
  isOpen,
  onClose,
  detectedFields,
  suggestedMappings,
  xmlFile,
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
        <Badge className="bg-green-100 text-green-700 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          {(confidence * 100).toFixed(0)}%
        </Badge>
      );
    } else if (confidence >= 0.7) {
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
          <Sparkles className="h-3 w-3 mr-1" />
          {(confidence * 100).toFixed(0)}%
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
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

  const handleImport = async () => {
    if (!validateMappings()) return;
    if (!workspaceId) return;

    setIsImporting(true);
    setError(null);

    try {
      // Read XML file
      const xmlText = await xmlFile.text();

      // Encode to base64 (UTF-8 safe)
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(xmlText);
      const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
      const xmlBase64 = btoa(binaryString);

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
              {}
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
            source_name: xmlFile.name,
            field_mappings: { ...finalMappings, ...manualFieldMappings },
            manual_values: manualValues, // Pass manual values separately
            mapping_template_id: templateId,
          },
        }
      );

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Import failed');
      }

      // Success!
      onMappingConfirmed();
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
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted px-4 py-3 grid grid-cols-12 gap-4 font-semibold text-sm">
            <div className="col-span-3">XML Field</div>
            <div className="col-span-3">Sample Values</div>
            <div className="col-span-4">Map To</div>
            <div className="col-span-2">AI Confidence</div>
          </div>

          <div className="divide-y">
            {detectedFields.map((field) => (
              <div key={field.xml_field} className="px-4 py-3 grid grid-cols-12 gap-4 items-center bg-background hover:bg-muted/50 transition-colors">
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
                  <Select
                    value={fieldMappings[field.xml_field] || 'metadata'}
                    onValueChange={(value) => handleMappingChange(field.xml_field, value)}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_FIELDS.map((target) => (
                        <SelectItem key={target.value} value={target.value}>
                          {target.label}
                          {target.required && <span className="text-destructive ml-1">*</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">{getConfidenceBadge(field.confidence)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Manual Input for Missing Required Fields */}
        {getMissingRequiredFields().length > 0 && (
          <div className="space-y-3 bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-yellow-900 mb-2">
                  Missing Required Fields
                </h4>
                <p className="text-sm text-yellow-700 mb-3">
                  The following required fields could not be auto-detected. Please provide values manually:
                </p>
                <div className="space-y-3">
                  {getMissingRequiredFields().map((field) => (
                    <div key={field} className="space-y-1">
                      <Label htmlFor={`manual-${field}`} className="text-yellow-900">
                        {TARGET_FIELDS.find(f => f.value === field)?.label || field}
                        <span className="text-destructive ml-1">*</span>
                      </Label>
                      <Input
                        id={`manual-${field}`}
                        placeholder={`Enter ${TARGET_FIELDS.find(f => f.value === field)?.label || field}`}
                        value={manualValues[field] || ''}
                        onChange={(e) => setManualValues(prev => ({ ...prev, [field]: e.target.value }))}
                        className="bg-white"
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
            onClick={handleImport}
            disabled={isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting Import...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Start Import
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default XMLFieldMappingModal;

