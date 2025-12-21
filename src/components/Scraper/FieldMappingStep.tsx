import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

export interface FieldMapping {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'number' | 'array' | 'object' | 'boolean';
  description: string;
  required: boolean;
}

interface FieldMappingStepProps {
  fields: FieldMapping[];
  onChange: (fields: FieldMapping[]) => void;
}

export const FieldMappingStep: React.FC<FieldMappingStepProps> = ({
  fields,
  onChange,
}) => {
  const [editingField, setEditingField] = useState<FieldMapping | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const defaultField: Omit<FieldMapping, 'id'> = {
    name: '',
    label: '',
    type: 'text',
    description: '',
    required: false,
  };

  const [newField, setNewField] = useState(defaultField);

  const handleAddField = () => {
    if (!newField.name || !newField.label) return;

    const field: FieldMapping = {
      ...newField,
      id: `field_${Date.now()}`,
    };

    onChange([...fields, field]);
    setNewField(defaultField);
    setIsAdding(false);
  };

  const handleUpdateField = () => {
    if (!editingField || !editingField.name || !editingField.label) return;

    onChange(fields.map((f) => (f.id === editingField.id ? editingField : f)));
    setEditingField(null);
  };

  const handleDeleteField = (id: string) => {
    onChange(fields.filter((f) => f.id !== id));
  };

  const renderFieldForm = (
    field: Omit<FieldMapping, 'id'> | FieldMapping,
    setField: (field: Omit<FieldMapping, 'id'> | FieldMapping) => void,
    onSave: () => void,
    onCancel: () => void
  ) => (
    <Card className="border-2 border-primary/20">
      <CardContent className="pt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Field Name *</Label>
            <Input
              value={field.name}
              onChange={(e) => setField({ ...field, name: e.target.value })}
              placeholder="material_name"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used in JSON output (lowercase, underscores)
            </p>
          </div>
          <div>
            <Label>Display Label *</Label>
            <Input
              value={field.label}
              onChange={(e) => setField({ ...field, label: e.target.value })}
              placeholder="Material Name"
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Field Type</Label>
            <Select
              value={field.type}
              onValueChange={(value: any) => setField({ ...field, type: value })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="array">Array</SelectItem>
                <SelectItem value="object">Object</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2 pt-8">
            <Checkbox
              id="required"
              checked={field.required}
              onCheckedChange={(checked) =>
                setField({ ...field, required: !!checked })
              }
            />
            <Label htmlFor="required" className="text-sm">
              Required field
            </Label>
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={field.description}
            onChange={(e) => setField({ ...field, description: e.target.value })}
            placeholder="Describe what this field should contain..."
            className="mt-1 min-h-[80px]"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Help the AI understand what to extract for this field
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <Button onClick={onCancel} variant="ghost" size="sm">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={onSave} size="sm">
            <Check className="h-4 w-4 mr-2" />
            Save Field
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Field Mappings</h3>
          <p className="text-sm text-muted-foreground">
            Define what data to extract from the web pages
          </p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        )}
      </div>

      {/* Add New Field Form */}
      {isAdding &&
        renderFieldForm(
          newField,
          setNewField,
          handleAddField,
          () => {
            setIsAdding(false);
            setNewField(defaultField);
          }
        )}

      {/* Existing Fields List */}
      <div className="space-y-3">
        {fields.map((field) => (
          <div key={field.id}>
            {editingField?.id === field.id ? (
              renderFieldForm(
                editingField,
                (updated) => setEditingField(updated as FieldMapping),
                handleUpdateField,
                () => setEditingField(null)
              )
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{field.label}</h4>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {field.type}
                        </span>
                        {field.required && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Field name: <code className="text-xs bg-muted px-1 py-0.5 rounded">{field.name}</code>
                      </p>
                      {field.description && (
                        <p className="text-sm text-muted-foreground">
                          {field.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setEditingField(field)}
                        variant="ghost"
                        size="sm"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteField(field.id)}
                        variant="ghost"
                        size="sm"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ))}
      </div>

      {fields.length === 0 && !isAdding && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center py-12">
            <p className="text-muted-foreground mb-4">
              No fields defined yet. Add fields to specify what data to extract.
            </p>
            <Button onClick={() => setIsAdding(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Field
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

