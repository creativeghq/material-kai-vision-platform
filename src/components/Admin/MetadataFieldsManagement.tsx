import React, { useState, useEffect } from 'react';
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
import { Plus, Edit, Trash2, Settings, Database, Info, ArrowLeft, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MetadataField {
  id: string;
  field_name: string;
  display_name: string;
  field_type: string; // Changed from union type to string
  is_required: boolean;
  description?: string;
  extraction_hints?: string;
  dropdown_options?: string[];
  applies_to_categories?: string[]; // Changed from enum array to string array
  is_global: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const materialCategories = [
  'metals', 'plastics', 'ceramics', 'composites', 'textiles', 
  'wood', 'glass', 'rubber', 'concrete', 'other'
];

const fieldTypes = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' }
];

export const MetadataFieldsManagement: React.FC = () => {
  const navigate = useNavigate();
  const [fields, setFields] = useState<MetadataField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<MetadataField | null>(null);
  const [formData, setFormData] = useState<{
    field_name: string;
    display_name: string;
    field_type: string;
    is_required: boolean;
    description: string;
    extraction_hints: string;
    dropdown_options: string[];
    applies_to_categories: string[];
    is_global: boolean;
    sort_order: number;
  }>({
    field_name: '',
    display_name: '',
    field_type: 'text',
    is_required: false,
    description: '',
    extraction_hints: '',
    dropdown_options: [],
    applies_to_categories: [],
    is_global: false,
    sort_order: 0
  });
  const [dropdownOptionInput, setDropdownOptionInput] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadMetadataFields();
  }, []);

  const loadMetadataFields = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('material_metadata_fields')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      setFields(data || []);
    } catch (error) {
      console.error('Error loading metadata fields:', error);
      toast({
        title: 'Error',
        description: 'Failed to load metadata fields',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      field_name: '',
      display_name: '',
      field_type: 'text',
      is_required: false,
      description: '',
      extraction_hints: '',
      dropdown_options: [],
      applies_to_categories: [],
      is_global: false,
      sort_order: Math.max(...fields.map(f => f.sort_order), 0) + 1
    });
    setDropdownOptionInput('');
    setEditingField(null);
  };

  const openDialog = (field?: MetadataField) => {
    if (field) {
      setFormData({
        field_name: field.field_name,
        display_name: field.display_name,
        field_type: field.field_type,
        is_required: field.is_required,
        description: field.description || '',
        extraction_hints: field.extraction_hints || '',
        dropdown_options: field.dropdown_options || [],
        applies_to_categories: field.applies_to_categories || [],
        is_global: field.is_global,
        sort_order: field.sort_order
      });
      setEditingField(field);
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSaveField = async () => {
    try {
      const fieldData: any = {
        ...formData,
        dropdown_options: formData.field_type === 'dropdown' ? formData.dropdown_options : null,
        applies_to_categories: formData.is_global ? null : formData.applies_to_categories
      };

      if (editingField) {
        const { error } = await supabase
          .from('material_metadata_fields')
          .update(fieldData)
          .eq('id', editingField.id);

        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Metadata field updated successfully'
        });
      } else {
        const { error } = await supabase
          .from('material_metadata_fields')
          .insert([fieldData]);

        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Metadata field created successfully'
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
        variant: 'destructive'
      });
    }
  };

  const handleDeleteField = async (field: MetadataField) => {
    if (!confirm(`Are you sure you want to delete the "${field.display_name}" field?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('material_metadata_fields')
        .delete()
        .eq('id', field.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Metadata field deleted successfully'
      });
      loadMetadataFields();
    } catch (error) {
      console.error('Error deleting metadata field:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete metadata field',
        variant: 'destructive'
      });
    }
  };

  const addDropdownOption = () => {
    if (dropdownOptionInput.trim()) {
      setFormData(prev => ({
        ...prev,
        dropdown_options: [...prev.dropdown_options, dropdownOptionInput.trim()]
      }));
      setDropdownOptionInput('');
    }
  };

  const removeDropdownOption = (index: number) => {
    setFormData(prev => ({
      ...prev,
      dropdown_options: prev.dropdown_options.filter((_, i) => i !== index)
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
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/')}
                className="flex items-center gap-2"
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/admin')}
                className="flex items-center gap-2"
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
                    onValueChange={(value: string) => setFormData(prev => ({ ...prev, field_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldTypes.map(type => (
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
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_required: !!checked }))}
                  />
                  <Label htmlFor="is_required">Required Field</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_global"
                    checked={formData.is_global}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_global: !!checked }))}
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

              {formData.field_type === 'dropdown' && (
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
                        <Badge key={index} variant="secondary" className="cursor-pointer" onClick={() => removeDropdownOption(index)}>
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
                    {materialCategories.map(category => (
                      <div key={category} className="flex items-center space-x-2">
                        <Checkbox
                          id={`category_${category}`}
                          checked={formData.applies_to_categories.includes(category)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData(prev => ({
                                ...prev,
                                applies_to_categories: [...prev.applies_to_categories, category]
                              }));
                            } else {
                              setFormData(prev => ({
                                ...prev,
                                applies_to_categories: prev.applies_to_categories.filter(c => c !== category)
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
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
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
                        <div className="font-medium">{field.display_name}</div>
                        <div className="text-sm text-muted-foreground">{field.field_name}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {field.field_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {field.is_global ? (
                        <Badge>Global</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {field.applies_to_categories?.slice(0, 2).map(cat => (
                            <Badge key={cat} variant="secondary" className="text-xs capitalize">
                              {cat}
                            </Badge>
                          ))}
                          {(field.applies_to_categories?.length || 0) > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{(field.applies_to_categories?.length || 0) - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {field.is_required ? (
                        <Badge variant="destructive">Required</Badge>
                      ) : (
                        <Badge variant="secondary">Optional</Badge>
                      )}
                    </TableCell>
                    <TableCell>{field.sort_order}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDialog(field)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
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