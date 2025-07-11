import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Info, Upload, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
}

interface DynamicMaterialFormProps {
  selectedCategory: string;
  onSave?: (materialData: any) => void;
  initialData?: any;
}

const materialCategories = [
  { value: 'metals', label: 'Metals' },
  { value: 'plastics', label: 'Plastics' },
  { value: 'ceramics', label: 'Ceramics' },
  { value: 'composites', label: 'Composites' },
  { value: 'textiles', label: 'Textiles' },
  { value: 'wood', label: 'Wood' },
  { value: 'glass', label: 'Glass' },
  { value: 'rubber', label: 'Rubber' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'other', label: 'Other' }
];

export const DynamicMaterialForm: React.FC<DynamicMaterialFormProps> = ({
  selectedCategory,
  onSave,
  initialData
}) => {
  const [metadataFields, setMetadataFields] = useState<MetadataField[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({
    name: '',
    description: '',
    category: selectedCategory,
    ...initialData
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadMetadataFields();
  }, [selectedCategory]);

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      category: selectedCategory,
      ...initialData
    }));
  }, [selectedCategory, initialData]);

  const loadMetadataFields = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('material_metadata_fields')
        .select('*')
        .or(`is_global.eq.true,applies_to_categories.cs.{${selectedCategory}}`)
        .order('sort_order');

      if (error) throw error;
      setMetadataFields(data || []);
    } catch (error) {
      console.error('Error loading metadata fields:', error);
      toast({
        title: 'Error',
        description: 'Failed to load form fields',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const handleSave = async () => {
    // Validate required fields
    const requiredFields = metadataFields.filter(field => field.is_required);
    const missingFields = requiredFields.filter(field => !formData[field.field_name]);
    
    if (!formData.name) {
      toast({
        title: 'Validation Error',
        description: 'Material name is required',
        variant: 'destructive'
      });
      return;
    }

    if (missingFields.length > 0) {
      toast({
        title: 'Validation Error',
        description: `Please fill in required fields: ${missingFields.map(f => f.display_name).join(', ')}`,
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    try {
      // Prepare metadata object
      const metadata: Record<string, any> = {};
      metadataFields.forEach(field => {
        if (formData[field.field_name] !== undefined && formData[field.field_name] !== '') {
          metadata[field.field_name] = formData[field.field_name];
        }
      });

      const materialData = {
        name: formData.name,
        description: formData.description,
        category: formData.category,
        metadata,
        properties: {},
        chemical_composition: {},
        safety_data: {},
        standards: []
      };

      if (onSave) {
        await onSave(materialData);
      } else {
        // Default save to database
        const { error } = await supabase
          .from('materials_catalog')
          .insert([materialData]);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Material saved successfully'
        });

        // Reset form
        setFormData({
          name: '',
          description: '',
          category: selectedCategory
        });
      }
    } catch (error) {
      console.error('Error saving material:', error);
      toast({
        title: 'Error',
        description: 'Failed to save material',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (field: MetadataField) => {
    const value = formData[field.field_name] || '';

    switch (field.field_type) {
      case 'text':
        return (
          <Input
            value={value}
            onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
            placeholder={field.description}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(field.field_name, parseFloat(e.target.value) || '')}
            placeholder={field.description}
          />
        );

      case 'dropdown':
        return (
          <Select
            value={value}
            onValueChange={(selectedValue) => handleFieldChange(field.field_name, selectedValue)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.display_name.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.dropdown_options?.map(option => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={!!value}
              onCheckedChange={(checked) => handleFieldChange(field.field_name, !!checked)}
            />
            <Label>{field.description || 'Yes/No'}</Label>
          </div>
        );

      case 'date':
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !value && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value ? format(new Date(value), "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value ? new Date(value) : undefined}
                onSelect={(date) => handleFieldChange(field.field_name, date?.toISOString())}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">Loading form...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Add New Material - {materialCategories.find(c => c.value === selectedCategory)?.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Basic Information</h3>
          
          <div>
            <Label htmlFor="name">
              Material Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder="Enter material name"
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder="Describe the material..."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => handleFieldChange('category', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {materialCategories.map(category => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dynamic Metadata Fields */}
        {metadataFields.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Metadata Fields</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {metadataFields.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.field_name} className="flex items-center gap-2">
                    {field.display_name}
                    {field.is_required && <span className="text-destructive">*</span>}
                    {field.is_global && <Badge variant="secondary" className="text-xs">Global</Badge>}
                    {field.description && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                          <div className="space-y-2">
                            <p className="text-sm">{field.description}</p>
                            {field.extraction_hints && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">AI Extraction Hints:</p>
                                <p className="text-xs text-muted-foreground">{field.extraction_hints}</p>
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </Label>
                  {renderField(field)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-2 pt-4">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Material'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};