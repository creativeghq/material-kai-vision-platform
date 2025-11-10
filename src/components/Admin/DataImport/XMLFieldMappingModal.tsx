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
import { useWorkspace } from '@/contexts/WorkspaceContext';

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
  const { currentWorkspace } = useWorkspace();
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>(suggestedMappings);
  const [templateName, setTemplateName] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [category, setCategory] = useState('materials');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMappingChange = (xmlField: string, targetField: string) => {
    setFieldMappings((prev) => ({
      ...prev,
      [xmlField]: targetField,
    }));
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) {
      return (
        <Badge className="bg-green-600 text-white">
          <CheckCircle className="h-3 w-3 mr-1" />
          {(confidence * 100).toFixed(0)}%
        </Badge>
      );
    } else if (confidence >= 0.7) {
      return (
        <Badge className="bg-yellow-600 text-white">
          <Sparkles className="h-3 w-3 mr-1" />
          {(confidence * 100).toFixed(0)}%
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-red-600 text-white">
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
      if (!mappedFields.includes(required)) {
        setError(`Missing required field: ${required}`);
        return false;
      }
    }

    return true;
  };

  const handleImport = async () => {
    if (!validateMappings()) return;
    if (!currentWorkspace) return;

    setIsImporting(true);
    setError(null);

    try {
      // Read XML file
      const xmlText = await xmlFile.text();
      const xmlBase64 = btoa(xmlText);

      // Save template if requested
      let templateId: string | undefined;
      if (saveAsTemplate && templateName) {
        const { data: template, error: templateError } = await supabase
          .from('xml_mapping_templates')
          .insert({
            workspace_id: currentWorkspace.id,
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

      // Call Edge Function to create import job
      const { data, error: functionError } = await supabase.functions.invoke(
        'xml-import-orchestrator',
        {
          body: {
            workspace_id: currentWorkspace.id,
            category: category,
            xml_content: xmlBase64,
            source_name: xmlFile.name,
            field_mappings: fieldMappings,
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-800 text-white border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-blue-400" />
            Review Field Mappings
          </DialogTitle>
          <DialogDescription className="text-gray-400">
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
          <Label htmlFor="category" className="text-white">
            Material Category
          </Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="category" className="bg-gray-700 border-gray-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-700 border-gray-600">
              <SelectItem value="materials">Materials</SelectItem>
              <SelectItem value="tiles">Tiles</SelectItem>
              <SelectItem value="flooring">Flooring</SelectItem>
              <SelectItem value="wallpaper">Wallpaper</SelectItem>
              <SelectItem value="furniture">Furniture</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Field Mappings Table */}
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-700/50 px-4 py-3 grid grid-cols-12 gap-4 font-semibold text-sm">
            <div className="col-span-3">XML Field</div>
            <div className="col-span-3">Sample Values</div>
            <div className="col-span-4">Map To</div>
            <div className="col-span-2">AI Confidence</div>
          </div>

          <div className="divide-y divide-gray-700">
            {detectedFields.map((field) => (
              <div key={field.xml_field} className="px-4 py-3 grid grid-cols-12 gap-4 items-center">
                <div className="col-span-3">
                  <code className="text-sm text-blue-300">{field.xml_field}</code>
                </div>

                <div className="col-span-3">
                  <div className="text-xs text-gray-400 space-y-1">
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
                    <SelectTrigger className="bg-gray-700 border-gray-600 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-700 border-gray-600">
                      {TARGET_FIELDS.map((target) => (
                        <SelectItem key={target.value} value={target.value}>
                          {target.label}
                          {target.required && <span className="text-red-400 ml-1">*</span>}
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

        {/* Save as Template */}
        <div className="space-y-3 bg-gray-700/30 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="save-template"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="save-template" className="text-white cursor-pointer">
              Save as mapping template for future imports
            </Label>
          </div>

          {saveAsTemplate && (
            <Input
              placeholder="Template name (e.g., 'Supplier ABC Catalog')"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              className="bg-gray-700 border-gray-600 text-white"
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
          <Button variant="outline" onClick={onClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting}
            className="bg-blue-600 hover:bg-blue-700"
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

