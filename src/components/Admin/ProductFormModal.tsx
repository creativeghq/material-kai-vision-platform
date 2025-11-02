import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X, Plus, Trash2 } from 'lucide-react';
import type { Product } from '@/types/unified-material-api';

interface ProductFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSave: (product: Partial<Product>) => Promise<void>;
  mode: 'create' | 'edit';
}

interface PropertyField {
  key: string;
  value: string;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  open,
  onOpenChange,
  product,
  onSave,
  mode,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [longDescription, setLongDescription] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [properties, setProperties] = useState<PropertyField[]>([]);
  const [specifications, setSpecifications] = useState<PropertyField[]>([]);
  const [metadata, setMetadata] = useState<PropertyField[]>([]);

  // Initialize form with product data
  useEffect(() => {
    if (product && mode === 'edit') {
      setName(product.name || '');
      setDescription(product.description || '');
      setLongDescription((product as any).long_description || '');
      setCategory(product.category || '');
      setStatus((product as any).status || 'draft');

      // Convert properties object to array
      if (product.properties) {
        setProperties(
          Object.entries(product.properties).map(([key, value]) => ({
            key,
            value: String(value),
          })),
        );
      }

      // Convert specifications object to array
      if (product.specifications) {
        setSpecifications(
          Object.entries(product.specifications).map(([key, value]) => ({
            key,
            value: String(value),
          })),
        );
      }

      // Convert metadata object to array
      if (product.metadata) {
        setMetadata(
          Object.entries(product.metadata).map(([key, value]) => ({
            key,
            value: String(value),
          })),
        );
      }
    } else if (mode === 'create') {
      // Reset form for create mode
      resetForm();
    }
  }, [product, mode, open]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setLongDescription('');
    setCategory('');
    setStatus('draft');
    setProperties([]);
    setSpecifications([]);
    setMetadata([]);
  };

  const addProperty = (type: 'properties' | 'specifications' | 'metadata') => {
    const setter = type === 'properties' ? setProperties : type === 'specifications' ? setSpecifications : setMetadata;
    setter((prev) => [...prev, { key: '', value: '' }]);
  };

  const removeProperty = (type: 'properties' | 'specifications' | 'metadata', index: number) => {
    const setter = type === 'properties' ? setProperties : type === 'specifications' ? setSpecifications : setMetadata;
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const updateProperty = (
    type: 'properties' | 'specifications' | 'metadata',
    index: number,
    field: 'key' | 'value',
    value: string,
  ) => {
    const setter = type === 'properties' ? setProperties : type === 'specifications' ? setSpecifications : setMetadata;
    setter((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Product name is required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Convert arrays back to objects
      const propertiesObj = properties.reduce((acc, { key, value }) => {
        if (key.trim()) acc[key] = value;
        return acc;
      }, {} as Record<string, unknown>);

      const specificationsObj = specifications.reduce((acc, { key, value }) => {
        if (key.trim()) acc[key] = value;
        return acc;
      }, {} as Record<string, unknown>);

      const metadataObj = metadata.reduce((acc, { key, value }) => {
        if (key.trim()) acc[key] = value;
        return acc;
      }, {} as Record<string, unknown>);

      const productData: Partial<Product> = {
        name: name.trim(),
        description: description.trim(),
        category: category.trim() || undefined,
        properties: Object.keys(propertiesObj).length > 0 ? propertiesObj : undefined,
        specifications: Object.keys(specificationsObj).length > 0 ? specificationsObj : undefined,
        metadata: Object.keys(metadataObj).length > 0 ? metadataObj : undefined,
        ...(mode === 'edit' && product?.id ? { id: product.id } : {}),
      };

      // Add long_description and status for backend
      (productData as any).long_description = longDescription.trim() || undefined;
      (productData as any).status = status;

      await onSave(productData);

      toast({
        title: mode === 'create' ? 'Product Created' : 'Product Updated',
        description: `${name} has been ${mode === 'create' ? 'created' : 'updated'} successfully`,
      });

      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Error saving product:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save product',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderPropertyFields = (
    type: 'properties' | 'specifications' | 'metadata',
    fields: PropertyField[],
    label: string,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addProperty(type)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">No {label.toLowerCase()} added yet</p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder="Key"
                value={field.key}
                onChange={(e) => updateProperty(type, index, 'key', e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Value"
                value={field.value}
                onChange={(e) => updateProperty(type, index, 'value', e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeProperty(type, index)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create New Product' : `Edit Product: ${product?.name}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Fill in the details to create a new product'
              : 'Update the product information below'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Basic Information</h3>

            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter product name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Short Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief product description (150 characters)"
                rows={2}
                maxLength={150}
              />
              <p className="text-xs text-muted-foreground">{description.length}/150 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="longDescription">Long Description</Label>
              <Textarea
                id="longDescription"
                value={longDescription}
                onChange={(e) => setLongDescription(e.target.value)}
                placeholder="Detailed product description"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Flooring, Wall Covering"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(value: any) => setStatus(value)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Properties */}
          {renderPropertyFields('properties', properties, 'Properties')}

          {/* Specifications */}
          {renderPropertyFields('specifications', specifications, 'Specifications')}

          {/* Metadata */}
          {renderPropertyFields('metadata', metadata, 'Metadata')}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {mode === 'create' ? 'Create Product' : 'Save Changes'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

