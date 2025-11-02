import React, { useState } from 'react';
import { Package } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

import { DynamicMaterialForm, MaterialData } from './DynamicMaterialForm';

interface MaterialFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (materialData: MaterialData) => void;
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
  { value: 'other', label: 'Other' },
];

export const MaterialFormModal: React.FC<MaterialFormModalProps> = ({
  open,
  onOpenChange,
  onSave,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('metals');

  const handleSave = async (materialData: MaterialData) => {
    if (onSave) {
      await onSave(materialData);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Add New Material
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="category-select">
              First, select a material category:
            </Label>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger id="category-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {materialCategories.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DynamicMaterialForm
            selectedCategory={selectedCategory}
            onSave={handleSave}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
