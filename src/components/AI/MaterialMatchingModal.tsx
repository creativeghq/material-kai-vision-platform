import React, { useState } from 'react';
import { X, ShoppingCart, Download, ExternalLink, DollarSign } from 'lucide-react';

interface Material {
  id: string;
  name: string;
  image_url?: string;
  metadata?: {
    price?: number;
    unit?: string;
    quantity?: number;
    manufacturer?: string;
    category?: string;
  };
  description?: string;
}

interface MaterialMatchingModalProps {
  materials: Material[];
  onClose: () => void;
  onExportToMoodboard?: (selectedMaterials: Material[]) => void;
  onEstimateCost?: (materialIds: string[]) => void;
}

export const MaterialMatchingModal: React.FC<MaterialMatchingModalProps> = ({
  materials,
  onClose,
  onExportToMoodboard,
  onEstimateCost,
}) => {
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());

  const toggleMaterial = (materialId: string) => {
    const newSelected = new Set(selectedMaterials);
    if (newSelected.has(materialId)) {
      newSelected.delete(materialId);
    } else {
      newSelected.add(materialId);
    }
    setSelectedMaterials(newSelected);
  };

  const handleExportToMoodboard = () => {
    if (onExportToMoodboard) {
      const selected = materials.filter(m => selectedMaterials.has(m.id));
      onExportToMoodboard(selected);
    }
  };

  const handleEstimateCost = () => {
    if (onEstimateCost) {
      onEstimateCost(Array.from(selectedMaterials));
    }
  };

  const totalCost = materials
    .filter(m => selectedMaterials.has(m.id))
    .reduce((sum, m) => {
      const price = m.metadata?.price || 0;
      const quantity = m.metadata?.quantity || 1;
      return sum + (price * quantity);
    }, 0);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">Matched Materials</h2>
              <p className="text-white/80">
                {materials.length} materials found • {selectedMaterials.size} selected
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Materials Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {materials.map(material => {
              const isSelected = selectedMaterials.has(material.id);
              const price = material.metadata?.price || 0;
              const unit = material.metadata?.unit || 'unit';
              
              return (
                <div
                  key={material.id}
                  onClick={() => toggleMaterial(material.id)}
                  className={`relative bg-white border-2 rounded-xl overflow-hidden cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-600 shadow-lg ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                  }`}
                >
                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 z-10 bg-blue-600 text-white rounded-full p-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}

                  {/* Image */}
                  <div className="aspect-square bg-gray-100 overflow-hidden">
                    {material.image_url ? (
                      <img
                        src={material.image_url}
                        alt={material.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <ShoppingCart className="w-12 h-12" />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">
                      {material.name}
                    </h3>
                    {material.metadata?.manufacturer && (
                      <p className="text-xs text-gray-500 mb-2">
                        {material.metadata.manufacturer}
                      </p>
                    )}
                    {material.description && (
                      <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                        {material.description}
                      </p>
                    )}
                    {price > 0 && (
                      <div className="flex items-center gap-1 text-blue-600 font-semibold">
                        <DollarSign className="w-4 h-4" />
                        <span>${price.toFixed(2)}</span>
                        <span className="text-xs text-gray-500">/ {unit}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-gray-900">
              Total: <span className="text-blue-600">${totalCost.toFixed(2)}</span>
            </div>
            <div className="flex gap-3">
              {onEstimateCost && (
                <button
                  onClick={handleEstimateCost}
                  disabled={selectedMaterials.size === 0}
                  className="px-4 py-2 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Estimate Cost
                </button>
              )}
              {onExportToMoodboard && (
                <button
                  onClick={handleExportToMoodboard}
                  disabled={selectedMaterials.size === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export to Moodboard
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

