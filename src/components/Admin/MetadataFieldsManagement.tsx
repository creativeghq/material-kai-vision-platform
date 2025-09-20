import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Settings, ArrowLeft, Home } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';

// Import proper TypeScript types
import type {
  MaterialMetafieldDefinition
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
  const { toast } = useToast();

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
  }, [loadMetadataFields]);

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
            priority: 'medium'
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
                onClick={() => navigate('/')}
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
              <Button
                className="border border-border bg-background text-foreground h-8 px-3 text-sm flex items-center gap-2"
                onClick={() => navigate('/admin')}
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
              <Button onClick={() => openDialog()}>
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
                  <Label htmlFor="sort_order">Sort Order</Label>
                  <Input
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
                <Label htmlFor="description">Description</Label>
                <Textarea
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
                      <Button type="button" onClick={addDropdownOption}>Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.dropdown_options.map((option, index) => (
                        <Badge key={index} className="cursor-pointer bg-secondary text-secondary-foreground" onClick={() => removeDropdownOption(index)}>
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
                <Button onClick={() => setIsDialogOpen(false)} className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground">
                  Cancel
                </Button>
                <Button onClick={handleSaveField}>
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
        </CardHeader>
        <CardContent>
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
                          onClick={() => openDialog(field)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          className="bg-transparent hover:bg-accent hover:text-accent-foreground h-8 w-8 p-0"
                          onClick={() => handleDeleteField(field)}
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
      </div>
      </div>
    </div>
  );
};
