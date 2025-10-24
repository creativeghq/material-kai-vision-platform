import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Settings, ArrowLeft, Home, Sparkles, Activity, CheckCircle, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { BrowserApiIntegrationService } from '@/services/apiGateway/browserApiIntegrationService';

// Import proper TypeScript types
import type {
  MaterialMetafieldDefinition,
} from '@/types/unified-material-api';
import type { MaterialCategory } from '@/types/materials';
import { getMaterialCategories } from '@/services/dynamicMaterialCategoriesService';

/**
 * Available field data types for metafield definitions
 */
const FIELD_TYPES = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select (Dropdown)' },
  { value: 'multiselect', label: 'Multi-Select' },
  { value: 'json', label: 'JSON Object' },
] as const;

/**
 * Form data interface for metafield creation/editing
 */
interface MetafieldFormData {
  field_name: string;
  display_name: string;
  field_type: MaterialMetafieldDefinition['dataType'];
  is_required: boolean;
  description: string;
  extraction_hints: string;
  dropdown_options: string[];
  applies_to_categories: MaterialCategory[];
  is_global: boolean;
  sort_order: number;
}

/**
 * Auto-population result interface
 */
interface AutoPopulationResult {
  document_id: string;
  document_name: string;
  fields_populated: Array<{
    field_name: string;
    old_value: unknown;
    new_value: unknown;
    confidence: number;
    source: 'entity_extraction' | 'ai_analysis' | 'pattern_matching';
  }>;
  entities_extracted: Array<{
    type: string;
    text: string;
    confidence: number;
  }>;
  success: boolean;
  error?: string;
}

/**
 * Auto-population summary interface
 */
interface AutoPopulationSummary {
  total_documents: number;
  documents_processed: number;
  documents_updated: number;
  total_fields_populated: number;
  processing_time_ms: number;
  success_rate: number;
  field_mapping_stats: Array<{
    field_name: string;
    documents_updated: number;
    avg_confidence: number;
    common_values: string[];
  }>;
}

export const MetadataFieldsManagement: React.FC = () => {
  const navigate = useNavigate();
  const [fields, setFields] = useState<MaterialMetafieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<MaterialMetafieldDefinition | null>(null);
  const [formData, setFormData] = useState<MetafieldFormData>({
    field_name: '',
    display_name: '',
    field_type: 'string',
    is_required: false,
    description: '',
    extraction_hints: '',
    dropdown_options: [],
    applies_to_categories: [],
    is_global: false,
    sort_order: 0,
  });
  const [dropdownOptionInput, setDropdownOptionInput] = useState('');

  // Auto-population state
  const [autoPopulationResults, setAutoPopulationResults] = useState<AutoPopulationResult[]>([]);
  const [autoPopulationSummary, setAutoPopulationSummary] = useState<AutoPopulationSummary | null>(null);
  const [isAutoPopulating, setIsAutoPopulating] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [availableDocuments, setAvailableDocuments] = useState<Array<{id: string, name: string, has_metadata: boolean}>>([]);

  const { toast } = useToast();

  // Load available documents for auto-population
  const loadAvailableDocuments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('id, name, metadata')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const documents = (data || []).map((doc: Record<string, unknown>) => ({
        id: doc.id,
        name: doc.name || `Document ${String(doc.id).slice(0, 8)}`,
        has_metadata: Boolean(doc.metadata && Object.keys(doc.metadata as Record<string, unknown>).length > 0),
      }));

      setAvailableDocuments(documents);
    } catch (error) {
      console.error('Error loading available documents:', error);
    }
  }, []);

  // Auto-populate metadata using entity extraction
  const autoPopulateMetadata = useCallback(async () => {
    if (selectedDocuments.length === 0) {
      toast({
        title: 'No Documents Selected',
        description: 'Please select documents to auto-populate metadata for.',
        variant: 'destructive',
      });
      return;
    }

    setIsAutoPopulating(true);
    setAutoPopulationResults([]);
    setAutoPopulationSummary(null);

    try {
      const apiService = BrowserApiIntegrationService.getInstance();

      const result = await apiService.callSupabaseFunction('mivaa-gateway', {
        action: 'auto_populate_metadata',
        payload: {
          document_ids: selectedDocuments,
          metadata_fields: fields.map(field => ({
            field_name: field.name,
            field_type: field.dataType,
            extraction_hints: (field as any).metadata?.extractionHints || '',
            applies_to_categories: field.applicableCategories || [],
          })),
          confidence_threshold: 0.6,
          include_entity_extraction: true,
          update_existing: true,
        },
      });

      if (!result.success) {
        throw new Error(`Auto-population failed: ${result.error?.message || 'Unknown error'}`);
      }

      const data = result.data;

      // Process results
      const results: AutoPopulationResult[] = data.results || [];
      const summary: AutoPopulationSummary = {
        total_documents: selectedDocuments.length,
        documents_processed: data.documents_processed || 0,
        documents_updated: data.documents_updated || 0,
        total_fields_populated: data.total_fields_populated || 0,
        processing_time_ms: data.processing_time_ms || 0,
        success_rate: data.success_rate || 0,
        field_mapping_stats: data.field_mapping_stats || [],
      };

      setAutoPopulationResults(results);
      setAutoPopulationSummary(summary);

      toast({
        title: 'Auto-Population Complete',
        description: `Successfully processed ${summary.documents_processed} documents and populated ${summary.total_fields_populated} metadata fields.`,
      });

      // Note: Metadata fields will be refreshed on next page load

    } catch (error) {
      console.error('Error during auto-population:', error);
      toast({
        title: 'Auto-Population Failed',
        description: error instanceof Error ? error.message : 'Failed to auto-populate metadata',
        variant: 'destructive',
      });
    } finally {
      setIsAutoPopulating(false);
    }
  }, [selectedDocuments, fields, toast]);

  // Get available material categories dynamically
  const [materialCategories, setMaterialCategories] = useState<MaterialCategory[]>([]);

  useEffect(() => {
    const loadCategories = async () => {
      const categories = await getMaterialCategories();
      setMaterialCategories(categories as unknown as MaterialCategory[]);
    };

    loadCategories();
  }, []);

  const loadMetadataFields = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch real data from material_metadata_fields table (verified to exist with 121 rows)
      const { data, error } = await supabase
        .from('material_metadata_fields')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        throw error;
      }

      // Transform database data to match MaterialMetafieldDefinition interface
      const transformedFields: MaterialMetafieldDefinition[] = (data || []).map((field: Record<string, unknown>) => ({
        id: field.id as string,
        name: field.field_name as string,
        displayName: field.display_name || field.field_name,
        dataType: field.field_type as MaterialMetafieldDefinition['dataType'],
        required: Boolean(field.is_required),
        description: field.description as string || '',
        validation: field.validation_rules || {},
        defaultValue: field.default_value,
        applicableCategories: Array.isArray(field.applies_to_categories) ? field.applies_to_categories as MaterialCategory[] : [],
        display: {
          order: Number(field.display_order) || 0,
          section: field.display_section || 'general',
          helpText: String(field.help_text || (field.description as string) || ''),
        },
        constraints: field.constraints || {},
        metadata: {
          extractionHints: field.extraction_hints || '',
          isGlobal: field.is_global || false,
          appliesTo: Array.isArray(field.applies_to_categories) ? field.applies_to_categories as MaterialCategory[] : [],
        },
        createdAt: field.created_at as string,
        updatedAt: field.updated_at as string,
        createdBy: field.created_by as string || '',
      }));

      setFields(transformedFields);
      console.log(`Loaded ${transformedFields.length} metadata fields from database`);
    } catch (error) {
      console.error('Error loading metadata fields:', error);
      toast({
        title: 'Error',
        description: 'Failed to load metadata fields from database',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadMetadataFields();
    loadAvailableDocuments();
  }, [loadMetadataFields, loadAvailableDocuments]);

  const resetForm = () => {
    setFormData({
      field_name: '',
      display_name: '',
      field_type: 'string',
      is_required: false,
      description: '',
      extraction_hints: '',
      dropdown_options: [],
      applies_to_categories: [],
      is_global: false,
      sort_order: Math.max(...fields.map(f => f.display?.order || 0), 0) + 1,
    });
    setDropdownOptionInput('');
    setEditingField(null);
  };

  const openDialog = (field?: MaterialMetafieldDefinition) => {
    if (field) {
      // Map from MaterialMetafieldDefinition to form data structure
      setFormData({
        field_name: field.name,
        display_name: field.name, // Use name as display name for now
        field_type: field.dataType,
        is_required: field.required,
        description: field.description || '',
        extraction_hints: '', // This will be a new field
        dropdown_options: field.validation?.options?.map(opt => opt.value) || [],
        applies_to_categories: field.applicableCategories,
        is_global: field.applicableCategories.length === 0, // If no specific categories, it's global
        sort_order: field.display?.order || 0,
      });
      setEditingField(field);
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSaveField = async () => {
    try {
      const fieldData: Record<string, unknown> = {
        ...formData,
        dropdown_options: formData.field_type === 'select' ? formData.dropdown_options : null,
        applies_to_categories: formData.is_global ? null : formData.applies_to_categories,
      };

      if (editingField) {
        const { error } = await supabase
          .from('agent_tasks')
          .update(fieldData as Record<string, unknown>)
          .eq('id', editingField.id);

        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Metadata field updated successfully',
        });
      } else {
        const { error } = await supabase
          .from('agent_tasks')
          .insert([{
            task_name: fieldData.field_name as string,
            task_type: 'metadata_field',
            description: fieldData.description as string || '',
            input_data: fieldData as Json,
            status: 'pending',
            priority: 'medium',
          }]);

        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Metadata field created successfully',
        });
      }

      setIsDialogOpen(false);
      resetForm();
      loadMetadataFields();
    } catch (error) {
      console.error('Error saving metadata field:', error);
      toast({
        title: 'Error',
        description: 'Failed to save metadata field',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteField = async (field: MaterialMetafieldDefinition) => {
    if (!confirm(`Are you sure you want to delete the "${field.name}" field?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('agent_tasks')
        .delete()
        .eq('id', field.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Metadata field deleted successfully',
      });
      loadMetadataFields();
    } catch (error) {
      console.error('Error deleting metadata field:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete metadata field',
        variant: 'destructive',
      });
    }
  };

  const addDropdownOption = () => {
    if (dropdownOptionInput.trim()) {
      setFormData(prev => ({
        ...prev,
        dropdown_options: [...prev.dropdown_options, dropdownOptionInput.trim()],
      }));
      setDropdownOptionInput('');
    }
  };

  const removeDropdownOption = (index: number) => {
    setFormData(prev => ({
      ...prev,
      dropdown_options: prev.dropdown_options.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                className="border border-border bg-background text-foreground h-8 px-3 text-sm flex items-center gap-2"
                onClick={() => navigate('/')} onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
              <Button
                className="border border-border bg-background text-foreground h-8 px-3 text-sm flex items-center gap-2"
                onClick={() => navigate('/admin')} onKeyDown={(e) => e.key === 'Enter' && navigate('/admin')}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Metadata Fields Management</h1>
              <p className="text-sm text-muted-foreground">
                Configure standardized metadata fields for material categories
              </p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()} onKeyDown={(e) => e.key === 'Enter' && openDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Field
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingField ? 'Edit Metadata Field' : 'Create Metadata Field'}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="field_name">Field Name (Code)</Label>
                  <Input
                    id="field_name"
                    value={formData.field_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, field_name: e.target.value }))}
                    placeholder="e.g., manufacturer"
                  />
                </div>
                <div>
                  <Label htmlFor="display_name">Display Name</Label>
                  <Input
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    placeholder="e.g., Manufacturer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="field_type">Field Type</Label>
                  <Select
                    value={formData.field_type}
                    onValueChange={(value: MaterialMetafieldDefinition['dataType']) => setFormData(prev => ({ ...prev, field_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="sort_order">Sort Order</Label><Input
                    id="sort_order"
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_required"
                    checked={formData.is_required}
                    onCheckedChange={(checked: boolean) => setFormData(prev => ({ ...prev, is_required: !!checked }))}
                  />
                  <Label htmlFor="is_required">Required Field</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_global"
                    checked={formData.is_global}
                    onCheckedChange={(checked: boolean) => setFormData(prev => ({ ...prev, is_global: !!checked }))}
                  />
                  <Label htmlFor="is_global">Global (All Categories)</Label>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label><Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this field represents..."
                />
              </div>

              <div>
                <Label htmlFor="extraction_hints">AI Extraction Hints</Label>
                <Textarea
                  id="extraction_hints"
                  value={formData.extraction_hints}
                  onChange={(e) => setFormData(prev => ({ ...prev, extraction_hints: e.target.value }))}
                  placeholder="Hints for AI to extract this field from documents..."
                />
              </div>

              {formData.field_type === 'select' && (
                <div>
                  <Label>Dropdown Options</Label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={dropdownOptionInput}
                        onChange={(e) => setDropdownOptionInput(e.target.value)}
                        placeholder="Add option..."
                        onKeyPress={(e) => e.key === 'Enter' && addDropdownOption()}
                      />
                      <Button type="button" onClick={addDropdownOption} onKeyDown={(e) => e.key === 'Enter' && addDropdownOption()}>Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.dropdown_options.map((option, index) => (
                        <Badge key={index} className="cursor-pointer bg-secondary text-secondary-foreground" onClick={() => removeDropdownOption(index)} onKeyDown={(e) => e.key === 'Enter' && removeDropdownOption(index)}>
                          {option} ×
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!formData.is_global && (
                <div>
                  <Label>Applies to Categories</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {materialCategories.map((category: MaterialCategory) => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`category_${category}`}
                          checked={formData.applies_to_categories.includes(category)}
                          onCheckedChange={(checked: boolean) => {
                            if (checked) {
                              setFormData(prev => ({
                                ...prev,
                                applies_to_categories: [...prev.applies_to_categories, category],
                              }));
                            } else {
                              setFormData(prev => ({
                                ...prev,
                                applies_to_categories: prev.applies_to_categories.filter(c => c !== category),
                              }));
                            }
                          }}
                        />
                        <Label htmlFor={`category_${category}`} className="capitalize">
                          {category}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button onClick={() => setIsDialogOpen(false)} onKeyDown={(e) => e.key === 'Enter' && setIsDialogOpen(false)} className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground">
                  Cancel
                </Button>
                <Button onClick={handleSaveField} onKeyDown={(e) => e.key === 'Enter' && handleSaveField()}>
                  {editingField ? 'Update' : 'Create'} Field
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configured Metadata Fields
          </CardTitle>
        </CardHeader><CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Sort Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{field.name}</div>
                        <div className="text-sm text-muted-foreground">{field.name}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="capitalize border border-border bg-background text-foreground">
                        {field.dataType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {field.applicableCategories.length === 0 ? (
                        <Badge>Global</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {field.applicableCategories?.slice(0, 2).map((cat: MaterialCategory) => (
                            <Badge key={cat} className="text-xs capitalize bg-secondary text-secondary-foreground">
                              {cat}
                            </Badge>
                          ))}
                          {(field.applicableCategories?.length || 0) > 2 && (
                            <Badge className="text-xs bg-secondary text-secondary-foreground">
                              +{(field.applicableCategories?.length || 0) - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {field.required ? (
                        <Badge className="bg-destructive text-destructive-foreground">Required</Badge>
                      ) : (
                        <Badge className="bg-secondary text-secondary-foreground">Optional</Badge>
                      )}
                    </TableCell>
                    <TableCell>{field.display?.order || 0}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          className="bg-transparent hover:bg-accent hover:text-accent-foreground h-8 w-8 p-0"
                          onClick={() => openDialog(field)} onKeyDown={(e) => e.key === 'Enter' && openDialog()}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          className="bg-transparent hover:bg-accent hover:text-accent-foreground h-8 w-8 p-0"
                          onClick={() => handleDeleteField(field)} onKeyDown={(e) => e.key === 'Enter' && handleDeleteField(field)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Auto-Population Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Auto-Populate Metadata
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Automatically populate metadata fields using AI entity extraction and analysis
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Document Selection */}
          <div>
            <Label className="text-base font-medium">Select Documents</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Choose documents to auto-populate metadata for ({availableDocuments.length} available)
            </p>
            <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 mb-3">
                  <Checkbox
                    id="select-all"
                    checked={selectedDocuments.length === availableDocuments.length}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedDocuments(availableDocuments.map(doc => doc.id));
                      } else {
                        setSelectedDocuments([]);
                      }
                    }}
                  />
                  <Label htmlFor="select-all" className="font-medium">
                    Select All ({availableDocuments.length})
                  </Label>
                </div>
                {availableDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`doc-${doc.id}`}
                      checked={selectedDocuments.includes(doc.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedDocuments(prev => [...prev, doc.id]);
                        } else {
                          setSelectedDocuments(prev => prev.filter(id => id !== doc.id));
                        }
                      }}
                    />
                    <Label htmlFor={`doc-${doc.id}`} className="flex-1 text-sm">
                      {doc.name}
                    </Label>
                    {doc.has_metadata && (
                      <Badge className="text-xs bg-blue-100 text-blue-800">
                        Has Metadata
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Auto-Population Controls */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Selected: {selectedDocuments.length} documents
              </p>
              <p className="text-xs text-muted-foreground">
                Will use {fields.length} metadata field definitions for extraction
              </p>
            </div>
            <Button
              onClick={autoPopulateMetadata} onKeyDown={(e) => e.key === 'Enter' && autoPopulateMetadata()}
              disabled={isAutoPopulating || selectedDocuments.length === 0}
              className="flex items-center gap-2"
            >
              {isAutoPopulating ? (
                <>
                  <Activity className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Auto-Populate Metadata
                </>
              )}
            </Button>
          </div>

          {/* Auto-Population Results */}
          {autoPopulationSummary && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Auto-Population Results
              </h4>

              <div className="grid md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{autoPopulationSummary.documents_processed}</div>
                  <div className="text-sm text-muted-foreground">Documents Processed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{autoPopulationSummary.documents_updated}</div>
                  <div className="text-sm text-muted-foreground">Documents Updated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{autoPopulationSummary.total_fields_populated}</div>
                  <div className="text-sm text-muted-foreground">Fields Populated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{autoPopulationSummary.success_rate.toFixed(1)}%</div>
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                </div>
              </div>

              {autoPopulationSummary.field_mapping_stats.length > 0 && (
                <div>
                  <h5 className="font-medium mb-2">Field Mapping Statistics</h5>
                  <div className="space-y-2">
                    {autoPopulationSummary.field_mapping_stats.slice(0, 5).map((stat, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{stat.field_name}</span>
                        <div className="flex items-center gap-2">
                          <Badge className="text-xs">
                            {stat.documents_updated} docs
                          </Badge>
                          <Badge className="text-xs bg-green-100 text-green-800">
                            {stat.avg_confidence.toFixed(1)}% confidence
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 text-xs text-muted-foreground">
                Processing completed in {Math.round(autoPopulationSummary.processing_time_ms / 1000)}s
              </div>
            </div>
          )}

          {/* Individual Results */}
          {autoPopulationResults.length > 0 && (
            <div>
              <h4 className="font-medium mb-3">Individual Document Results</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {autoPopulationResults.slice(0, 10).map((result, index) => (
                  <div key={index} className="border rounded p-3 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{result.document_name}</span>
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      )}
                    </div>

                    {result.success ? (
                      <div>
                        <p className="text-muted-foreground mb-1">
                          Populated {result.fields_populated.length} fields,
                          extracted {result.entities_extracted.length} entities
                        </p>
                        {result.fields_populated.slice(0, 3).map((field, i) => (
                          <div key={i} className="text-xs text-muted-foreground">
                            • {field.field_name}: {String(field.new_value)} ({field.confidence.toFixed(1)}%)
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-red-600 text-xs">{result.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      </div>
    </div>
  );
};
