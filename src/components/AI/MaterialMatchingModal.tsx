import React, { useState } from 'react';
import {
  X,
  ShoppingCart,
  Download,
  DollarSign,
  Sparkles,
  Maximize2,
  Package,
  Lightbulb,
  CheckCircle2,
  TrendingUp,
  Eye,
  Home
} from 'lucide-react';

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
  spatialAnalysis?: {
    layout_analysis?: any;
    material_suggestions?: any[];
    accessibility_report?: any;
    confidence_score?: number;
  };
  roomType?: string;
  style?: string;
  onClose: () => void;
  onExportToMoodboard?: (selectedMaterials: Material[]) => void;
  onEstimateCost?: (materialIds: string[]) => void;
}

export const MaterialMatchingModal: React.FC<MaterialMatchingModalProps> = ({
  materials,
  spatialAnalysis,
  roomType,
  style,
  onClose,
  onExportToMoodboard,
  onEstimateCost,
}) => {
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'materials' | 'context'>('materials');

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-8 text-white relative overflow-hidden">
          {/* Decorative background pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full translate-x-1/3 translate-y-1/3" />
          </div>

          <div className="relative flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold mb-1">AI-Matched Materials</h2>
                  <p className="text-white/90 text-sm">
                    Powered by SpaceFormer spatial intelligence
                  </p>
                </div>
              </div>

              {/* Room Context */}
              {(roomType || style) && (
                <div className="flex items-center gap-4 mt-4 text-sm">
                  {roomType && (
                    <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full backdrop-blur-sm">
                      <Home className="w-4 h-4" />
                      <span className="font-medium">{roomType}</span>
                    </div>
                  )}
                  {style && (
                    <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full backdrop-blur-sm">
                      <Sparkles className="w-4 h-4" />
                      <span className="font-medium">{style} Style</span>
                    </div>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  <span className="font-medium">{materials.length} Materials</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">{selectedMaterials.size} Selected</span>
                </div>
                {spatialAnalysis?.confidence_score && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    <span className="font-medium">
                      {Math.round(spatialAnalysis.confidence_score * 100)}% AI Confidence
                    </span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-3 hover:bg-white/20 rounded-xl transition-all hover:rotate-90 duration-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {spatialAnalysis && (
          <div className="flex border-b border-gray-200 bg-gray-50">
            <button
              onClick={() => setActiveTab('materials')}
              className={`flex-1 px-6 py-4 font-semibold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'materials'
                  ? 'bg-white text-violet-600 border-b-3 border-violet-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Package className="w-5 h-5" />
              Materials ({materials.length})
            </button>
            <button
              onClick={() => setActiveTab('context')}
              className={`flex-1 px-6 py-4 font-semibold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'context'
                  ? 'bg-white text-violet-600 border-b-3 border-violet-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Eye className="w-5 h-5" />
              AI Context & Suggestions
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {/* Materials Tab */}
          {activeTab === 'materials' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {materials.map(material => {
              const isSelected = selectedMaterials.has(material.id);
              const price = material.metadata?.price || 0;
              const unit = material.metadata?.unit || 'unit';
              
              return (
                <div
                  key={material.id}
                  onClick={() => toggleMaterial(material.id)}
                  className={`relative bg-white border-2 rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] ${
                    isSelected
                      ? 'border-violet-600 shadow-xl ring-4 ring-violet-200'
                      : 'border-gray-200 hover:border-violet-300 hover:shadow-lg'
                  }`}
                >
                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute top-3 right-3 z-10 bg-gradient-to-br from-violet-600 to-purple-600 text-white rounded-full p-2 shadow-lg">
                      <CheckCircle2 className="w-5 h-5" />
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
          )}

          {/* AI Context Tab */}
          {activeTab === 'context' && spatialAnalysis && (
            <div className="space-y-6">
              {/* AI Suggestions Header */}
              <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  <Lightbulb className="w-6 h-6" />
                  <h3 className="text-xl font-bold">AI Design Insights</h3>
                </div>
                <p className="text-white/90 text-sm">
                  SpaceFormer analyzed your space and generated these intelligent recommendations
                </p>
              </div>

              {/* Material Suggestions */}
              {spatialAnalysis.material_suggestions && spatialAnalysis.material_suggestions.length > 0 && (
                <div className="bg-white rounded-2xl border-2 border-green-100 overflow-hidden shadow-lg">
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-green-100">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <Package className="w-5 h-5 text-green-600" />
                      Recommended Materials & Placements
                    </h3>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {spatialAnalysis.material_suggestions.map((suggestion: any, idx: number) => {
                        const suggestionText = typeof suggestion === 'string'
                          ? suggestion
                          : suggestion.name || suggestion.material || suggestion.description || JSON.stringify(suggestion);

                        return (
                          <div
                            key={idx}
                            className="flex items-start gap-4 p-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 hover:shadow-lg transition-all hover:scale-[1.02]"
                          >
                            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 leading-relaxed mb-1">
                                {suggestionText}
                              </p>
                              {suggestion.location && (
                                <p className="text-xs text-gray-600 flex items-center gap-1">
                                  <span className="text-green-600">📍</span> {suggestion.location}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Layout Analysis */}
              {spatialAnalysis.layout_analysis && (
                <div className="bg-white rounded-2xl border-2 border-blue-100 overflow-hidden shadow-lg">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <Maximize2 className="w-5 h-5 text-blue-600" />
                      Spatial Layout Analysis
                    </h3>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Room Dimensions */}
                      {spatialAnalysis.layout_analysis.room_dimensions && (
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-5 border-2 border-blue-200">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="p-2 bg-blue-600 rounded-lg">
                              <Maximize2 className="w-4 h-4 text-white" />
                            </div>
                            <h4 className="font-bold text-gray-900">Dimensions</h4>
                          </div>
                          <div className="space-y-2 text-sm">
                            {spatialAnalysis.layout_analysis.room_dimensions.width && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Width:</span>
                                <span className="font-bold text-gray-900">
                                  {spatialAnalysis.layout_analysis.room_dimensions.width}m
                                </span>
                              </div>
                            )}
                            {spatialAnalysis.layout_analysis.room_dimensions.length && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Length:</span>
                                <span className="font-bold text-gray-900">
                                  {spatialAnalysis.layout_analysis.room_dimensions.length}m
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Space Utilization */}
                      {spatialAnalysis.layout_analysis.space_utilization && (
                        <div className="bg-gradient-to-br from-cyan-50 to-blue-100 rounded-xl p-5 border-2 border-cyan-200">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="p-2 bg-cyan-600 rounded-lg">
                              <TrendingUp className="w-4 h-4 text-white" />
                            </div>
                            <h4 className="font-bold text-gray-900">Efficiency</h4>
                          </div>
                          {typeof spatialAnalysis.layout_analysis.space_utilization === 'number' ? (
                            <div className="space-y-2">
                              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-cyan-500 to-blue-600 h-full rounded-full transition-all"
                                  style={{ width: `${spatialAnalysis.layout_analysis.space_utilization}%` }}
                                />
                              </div>
                              <p className="text-center font-bold text-gray-900 text-lg">
                                {spatialAnalysis.layout_analysis.space_utilization}%
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-700">
                              {String(spatialAnalysis.layout_analysis.space_utilization)}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Confidence Score */}
                      {spatialAnalysis.confidence_score !== undefined && (
                        <div className="bg-gradient-to-br from-purple-50 to-violet-100 rounded-xl p-5 border-2 border-purple-200">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="p-2 bg-purple-600 rounded-lg">
                              <Sparkles className="w-4 h-4 text-white" />
                            </div>
                            <h4 className="font-bold text-gray-900">AI Confidence</h4>
                          </div>
                          <div className="text-center">
                            <div className="text-3xl font-bold text-purple-600 mb-1">
                              {Math.round(spatialAnalysis.confidence_score * 100)}%
                            </div>
                            <div className="text-xs text-gray-600">
                              {spatialAnalysis.confidence_score >= 0.8 ? 'High Accuracy' :
                               spatialAnalysis.confidence_score >= 0.6 ? 'Medium Accuracy' : 'Low Accuracy'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Accessibility Info */}
              {spatialAnalysis.accessibility_report && (
                <div className="bg-white rounded-2xl border-2 border-purple-100 overflow-hidden shadow-lg">
                  <div className="bg-gradient-to-r from-purple-50 to-violet-50 px-6 py-4 border-b border-purple-100">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <Eye className="w-5 h-5 text-purple-600" />
                      Accessibility & Safety
                    </h3>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {spatialAnalysis.accessibility_report.wheelchair_accessible !== undefined && (
                        <div className={`p-5 rounded-xl border-2 ${
                          spatialAnalysis.accessibility_report.wheelchair_accessible
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-2">
                            {spatialAnalysis.accessibility_report.wheelchair_accessible ? (
                              <CheckCircle2 className="w-6 h-6 text-green-600" />
                            ) : (
                              <X className="w-6 h-6 text-red-600" />
                            )}
                            <h4 className="font-bold text-gray-900">Wheelchair Access</h4>
                          </div>
                          <p className={`text-sm font-semibold ${
                            spatialAnalysis.accessibility_report.wheelchair_accessible
                              ? 'text-green-700'
                              : 'text-red-700'
                          }`}>
                            {spatialAnalysis.accessibility_report.wheelchair_accessible ? '✓ Accessible' : '✗ Not Accessible'}
                          </p>
                        </div>
                      )}

                      {spatialAnalysis.accessibility_report.ada_compliant !== undefined && (
                        <div className={`p-5 rounded-xl border-2 ${
                          spatialAnalysis.accessibility_report.ada_compliant
                            ? 'bg-green-50 border-green-200'
                            : 'bg-amber-50 border-amber-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-2">
                            {spatialAnalysis.accessibility_report.ada_compliant ? (
                              <CheckCircle2 className="w-6 h-6 text-green-600" />
                            ) : (
                              <Lightbulb className="w-6 h-6 text-amber-600" />
                            )}
                            <h4 className="font-bold text-gray-900">ADA Compliance</h4>
                          </div>
                          <p className={`text-sm font-semibold ${
                            spatialAnalysis.accessibility_report.ada_compliant
                              ? 'text-green-700'
                              : 'text-amber-700'
                          }`}>
                            {spatialAnalysis.accessibility_report.ada_compliant ? '✓ Compliant' : '⚠ Review Needed'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-gray-200 p-6 bg-gradient-to-r from-gray-50 to-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold text-gray-900">
                Total: <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-purple-600">${totalCost.toFixed(2)}</span>
              </div>
              {selectedMaterials.size > 0 && (
                <div className="px-4 py-2 bg-violet-100 text-violet-700 rounded-full text-sm font-semibold">
                  {selectedMaterials.size} item{selectedMaterials.size !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>
            <div className="flex gap-3">
              {onEstimateCost && (
                <button
                  onClick={handleEstimateCost}
                  disabled={selectedMaterials.size === 0}
                  className="px-6 py-3 bg-white border-2 border-violet-300 text-violet-700 rounded-xl font-semibold hover:bg-violet-50 hover:border-violet-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md flex items-center gap-2"
                >
                  <DollarSign className="w-5 h-5" />
                  Estimate Cost
                </button>
              )}
              {onExportToMoodboard && (
                <button
                  onClick={handleExportToMoodboard}
                  disabled={selectedMaterials.size === 0}
                  className="px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl font-semibold hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  <Download className="w-5 h-5" />
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

