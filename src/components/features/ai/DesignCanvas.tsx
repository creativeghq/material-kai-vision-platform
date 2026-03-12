import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Grid3x3,
  LayoutGrid,
  DollarSign,
  Ruler,
  Sofa,
  Lightbulb,
  Wind,
  Accessibility,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Package,
  TrendingUp,
  Eye,
  X,
  Home,
  Search,
  Globe,
  Loader2,
  Video,
  BookmarkPlus,
} from 'lucide-react';
import { MoodboardSavePopover } from '@/components/business/moodboard/MoodboardSavePopover';

interface ModelResult {
  model_id: string;
  model_name: string;
  provider: 'replicate' | 'huggingface';
  image_urls: string[];
  processing_time_ms: number;
  success: boolean;
  error?: string;
}

interface DesignCanvasProps {
  images?: string[];
  modelResults?: ModelResult[]; // NEW: Per-model results with attribution
  totalModels?: number;
  successfulModels?: number;
  spatialAnalysis?: {
    layout_analysis?: any;
    material_suggestions?: any[];
    accessibility_report?: any;
    spatial_metrics?: any;
    confidence_score?: number;
  };
  matchedMaterials?: Array<{
    id: string;
    name: string;
    image_url?: string;
    metadata?: any;
  }>;
  parsedRequest?: {
    room_type?: string;
    style?: string;
    materials?: string[];
    features?: string[];
    layout?: string;
    enhanced_prompt?: string;
  };
  qualityAssessment?: {
    score?: number;
    feedback?: string;
  };
  processingTimeMs?: number;
  onMaterialClick?: (materialId: string) => void;
  onViewAllMaterials?: () => void;
  onFindMaterials?: (imageUrl: string) => void;
  onGenerateVR?: (imageUrl: string, context: { prompt?: string; roomType?: string; style?: string }) => void;
  vrGenerating?: boolean;
  onGenerateVideo?: (imageUrl: string) => void;
  onAddToMoodboard?: (imageUrl: string) => void;
}

export const DesignCanvas: React.FC<DesignCanvasProps> = ({
  images = [],
  modelResults = [],
  totalModels,
  successfulModels,
  spatialAnalysis,
  matchedMaterials = [],
  parsedRequest,
  qualityAssessment,
  processingTimeMs,
  onMaterialClick,
  onFindMaterials,
  onViewAllMaterials,
  onGenerateVR,
  vrGenerating,
  onGenerateVideo,
  onAddToMoodboard,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'images' | 'analysis' | 'materials' | 'details'>('images');
  const [showImageModal, setShowImageModal] = useState(false);

  // Helper function to get model info for an image
  const getModelForImage = (imageUrl: string): ModelResult | undefined => {
    return modelResults.find(model => model.image_urls.includes(imageUrl));
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const downloadImage = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `design-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        <button
          onClick={() => setActiveTab('images')}
          className={`flex-1 px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2 ${
            activeTab === 'images'
              ? 'bg-white text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Grid3x3 className="w-4 h-4" />
          3D Images ({images.length})
        </button>
        {spatialAnalysis && (
          <button
            onClick={() => setActiveTab('analysis')}
            className={`flex-1 px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'analysis'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Maximize2 className="w-4 h-4" />
            Spatial Analysis
          </button>
        )}
        {matchedMaterials.length > 0 && (
          <button
            onClick={() => setActiveTab('materials')}
            className={`flex-1 px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'materials'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Materials ({matchedMaterials.length})
          </button>
        )}
        {(parsedRequest || qualityAssessment || processingTimeMs) && (
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'details'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Details
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Images Tab */}
        {activeTab === 'images' && images.length > 0 && (
          <div className="space-y-4">
            <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden group cursor-pointer" onClick={() => setShowImageModal(true)}>
              <img
                src={images[currentImageIndex]}
                alt={`Design ${currentImageIndex + 1}`}
                className="w-full h-full object-contain"
              />

              {/* Model Attribution Badge */}
              {(() => {
                const modelInfo = getModelForImage(images[currentImageIndex]);
                if (modelInfo) {
                  return (
                    <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        <div className="text-white text-sm">
                          <span className="font-semibold">{modelInfo.model_name}</span>
                          <span className="text-gray-300 ml-2">
                            ({modelInfo.provider === 'replicate' ? '🔵 Replicate' : '🟡 Hugging Face'})
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Overlay hint on hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 px-4 py-2 rounded-lg shadow-lg">
                  <div className="flex items-center gap-2 text-gray-900">
                    <Eye className="w-5 h-5" />
                    <span className="font-medium">Click to view analysis & materials</span>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); prevImage(); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); nextImage(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>

                  {/* Image Counter */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/70 text-white rounded-full text-sm">
                    {currentImageIndex + 1} / {images.length}
                  </div>
                </>
              )}

            </div>

            {/* Action bar — outside overflow-hidden so buttons are always visible */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {onGenerateVR && (
                <button
                  onClick={() => { if (!vrGenerating) onGenerateVR(images[currentImageIndex], { prompt: parsedRequest?.enhanced_prompt, roomType: parsedRequest?.room_type, style: parsedRequest?.style }); }}
                  disabled={vrGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-full text-xs font-medium text-violet-700 disabled:opacity-50 transition-colors shadow-sm"
                  title={vrGenerating ? 'VR world is being generated...' : 'Generate explorable VR world (50 credits)'}
                >
                  {vrGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                  {vrGenerating ? 'Generating VR World...' : 'Generate VR World'}
                </button>
              )}
              {onGenerateVideo && (
                <button
                  onClick={() => onGenerateVideo(images[currentImageIndex])}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-full text-xs font-medium text-rose-700 transition-colors shadow-sm"
                  title="Generate video walkthrough with Veo (30 credits)"
                >
                  <Video className="w-3.5 h-3.5" />
                  Generate Video
                </button>
              )}
              {onFindMaterials && (
                <button
                  onClick={() => onFindMaterials(images[currentImageIndex])}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-full text-xs font-medium text-blue-700 transition-colors shadow-sm"
                  title="Find matching materials for this design"
                >
                  <Search className="w-3.5 h-3.5" />
                  Find Materials
                </button>
              )}
              {images[currentImageIndex] && (
                <MoodboardSavePopover
                  mediaUrl={images[currentImageIndex]}
                  mediaType="image"
                  mediaTitle="Generated Design"
                >
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-full text-xs font-medium text-pink-700 transition-colors shadow-sm"
                    title="Save this design to a moodboard"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Save to Moodboard
                  </button>
                </MoodboardSavePopover>
              )}
              <button
                onClick={() => downloadImage(images[currentImageIndex])}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full text-xs font-medium text-gray-700 transition-colors shadow-sm"
                title="Download image"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>

            {/* Multi-Model Summary Banner */}
            {modelResults.length > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-900">
                      {successfulModels}/{totalModels} AI Models Generated Images
                    </span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    {modelResults.filter(m => m.provider === 'replicate' && m.success).length > 0 && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        🔵 Replicate ({modelResults.filter(m => m.provider === 'replicate' && m.success).length})
                      </span>
                    )}
                    {modelResults.filter(m => m.provider === 'huggingface' && m.success).length > 0 && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                        🟡 Hugging Face ({modelResults.filter(m => m.provider === 'huggingface' && m.success).length})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {images.map((img, idx) => {
                  const modelInfo = getModelForImage(img);
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                        idx === currentImageIndex
                          ? 'border-blue-600 ring-2 ring-blue-200'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                      {/* Model badge on thumbnail */}
                      {modelInfo && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 text-center truncate">
                          {modelInfo.provider === 'replicate' ? '🔵' : '🟡'} {modelInfo.model_name}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Spatial Analysis Tab */}
        {activeTab === 'analysis' && spatialAnalysis && (
          <div className="space-y-6">
            {/* AI Analysis Header */}
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl p-6 text-white">
              <div className="flex items-center gap-3 mb-2">
                <Sparkles className="w-6 h-6" />
                <h3 className="text-xl font-bold">AI Spatial Analysis</h3>
              </div>
              <p className="text-white/90 text-sm">
                Powered by Claude Vision AI - Advanced spatial understanding and design optimization
              </p>
            </div>

            {/* Layout Analysis */}
            {spatialAnalysis.layout_analysis && (
              <div className="bg-white rounded-xl border-2 border-blue-100 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Maximize2 className="w-5 h-5 text-blue-600" />
                    Layout & Spatial Design
                  </h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Room Dimensions */}
                    {spatialAnalysis.layout_analysis.room_dimensions && (
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-center gap-2 mb-3">
                          <Ruler className="w-5 h-5 text-blue-600" />
                          <h4 className="font-semibold text-gray-900">Dimensions</h4>
                        </div>
                        <div className="space-y-2">
                          {spatialAnalysis.layout_analysis.room_dimensions.width && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Width:</span>
                              <span className="font-bold text-gray-900">
                                {spatialAnalysis.layout_analysis.room_dimensions.width}m
                              </span>
                            </div>
                          )}
                          {spatialAnalysis.layout_analysis.room_dimensions.length && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Length:</span>
                              <span className="font-bold text-gray-900">
                                {spatialAnalysis.layout_analysis.room_dimensions.length}m
                              </span>
                            </div>
                          )}
                          {spatialAnalysis.layout_analysis.room_dimensions.height && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Height:</span>
                              <span className="font-bold text-gray-900">
                                {spatialAnalysis.layout_analysis.room_dimensions.height}m
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Furniture Placement */}
                    {spatialAnalysis.layout_analysis.furniture_placement && (
                      <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg p-4 border border-green-200">
                        <div className="flex items-center gap-2 mb-3">
                          <Sofa className="w-5 h-5 text-green-600" />
                          <h4 className="font-semibold text-gray-900">Furniture</h4>
                        </div>
                        <div className="space-y-2 text-sm">
                          {Array.isArray(spatialAnalysis.layout_analysis.furniture_placement) ? (
                            spatialAnalysis.layout_analysis.furniture_placement.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                <span className="text-gray-700">
                                  {typeof item === 'string' ? item : item.name || item.description || JSON.stringify(item)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-gray-700">{String(spatialAnalysis.layout_analysis.furniture_placement)}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Lighting */}
                    {spatialAnalysis.layout_analysis.lighting && (
                      <div className="bg-gradient-to-br from-amber-50 to-yellow-100 rounded-lg p-4 border border-amber-200">
                        <div className="flex items-center gap-2 mb-3">
                          <Lightbulb className="w-5 h-5 text-amber-600" />
                          <h4 className="font-semibold text-gray-900">Lighting</h4>
                        </div>
                        <p className="text-sm text-gray-700">
                          {typeof spatialAnalysis.layout_analysis.lighting === 'string'
                            ? spatialAnalysis.layout_analysis.lighting
                            : JSON.stringify(spatialAnalysis.layout_analysis.lighting)}
                        </p>
                      </div>
                    )}

                    {/* Traffic Flow */}
                    {spatialAnalysis.layout_analysis.traffic_flow && (
                      <div className="bg-gradient-to-br from-purple-50 to-violet-100 rounded-lg p-4 border border-purple-200">
                        <div className="flex items-center gap-2 mb-3">
                          <Wind className="w-5 h-5 text-purple-600" />
                          <h4 className="font-semibold text-gray-900">Traffic Flow</h4>
                        </div>
                        <p className="text-sm text-gray-700">
                          {typeof spatialAnalysis.layout_analysis.traffic_flow === 'string'
                            ? spatialAnalysis.layout_analysis.traffic_flow
                            : JSON.stringify(spatialAnalysis.layout_analysis.traffic_flow)}
                        </p>
                      </div>
                    )}

                    {/* Space Utilization */}
                    {spatialAnalysis.layout_analysis.space_utilization && (
                      <div className="bg-gradient-to-br from-cyan-50 to-blue-100 rounded-lg p-4 border border-cyan-200">
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingUp className="w-5 h-5 text-cyan-600" />
                          <h4 className="font-semibold text-gray-900">Space Efficiency</h4>
                        </div>
                        <div className="space-y-2">
                          {typeof spatialAnalysis.layout_analysis.space_utilization === 'number' ? (
                            <>
                              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-cyan-500 to-blue-600 h-full rounded-full transition-all"
                                  style={{ width: `${spatialAnalysis.layout_analysis.space_utilization}%` }}
                                />
                              </div>
                              <p className="text-center font-bold text-gray-900">
                                {spatialAnalysis.layout_analysis.space_utilization}% Utilized
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-gray-700">
                              {String(spatialAnalysis.layout_analysis.space_utilization)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Additional Layout Info */}
                  {spatialAnalysis.layout_analysis.description && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {spatialAnalysis.layout_analysis.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Material Suggestions */}
            {spatialAnalysis.material_suggestions && spatialAnalysis.material_suggestions.length > 0 && (
              <div className="bg-white rounded-xl border-2 border-green-100 overflow-hidden">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b border-green-100">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-green-600" />
                    AI Material Recommendations
                  </h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {spatialAnalysis.material_suggestions.map((suggestion: any, idx: number) => {
                      const suggestionText = typeof suggestion === 'string'
                        ? suggestion
                        : suggestion.name || suggestion.material || suggestion.description || JSON.stringify(suggestion);

                      return (
                        <div
                          key={idx}
                          className="flex items-start gap-3 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200 hover:shadow-md transition-shadow"
                        >
                          <div className="flex-shrink-0 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 leading-relaxed">
                              {suggestionText}
                            </p>
                            {suggestion.location && (
                              <p className="text-xs text-gray-600 mt-1">
                                📍 {suggestion.location}
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

            {/* Accessibility Report */}
            {spatialAnalysis.accessibility_report && (
              <div className="bg-white rounded-xl border-2 border-purple-100 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-50 to-violet-50 px-6 py-4 border-b border-purple-100">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Accessibility className="w-5 h-5 text-purple-600" />
                    Accessibility Analysis
                  </h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Wheelchair Accessible */}
                    {spatialAnalysis.accessibility_report.wheelchair_accessible !== undefined && (
                      <div className={`p-4 rounded-lg border-2 ${
                        spatialAnalysis.accessibility_report.wheelchair_accessible
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          {spatialAnalysis.accessibility_report.wheelchair_accessible ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-red-600" />
                          )}
                          <h4 className="font-semibold text-gray-900">Wheelchair Access</h4>
                        </div>
                        <p className={`text-sm font-medium ${
                          spatialAnalysis.accessibility_report.wheelchair_accessible
                            ? 'text-green-700'
                            : 'text-red-700'
                        }`}>
                          {spatialAnalysis.accessibility_report.wheelchair_accessible ? 'Accessible' : 'Not Accessible'}
                        </p>
                      </div>
                    )}

                    {/* Clearance */}
                    {spatialAnalysis.accessibility_report.clearance && (
                      <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                        <div className="flex items-center gap-2 mb-2">
                          <Eye className="w-5 h-5 text-blue-600" />
                          <h4 className="font-semibold text-gray-900">Clearance</h4>
                        </div>
                        <p className="text-sm text-gray-700">
                          {typeof spatialAnalysis.accessibility_report.clearance === 'string'
                            ? spatialAnalysis.accessibility_report.clearance
                            : JSON.stringify(spatialAnalysis.accessibility_report.clearance)}
                        </p>
                      </div>
                    )}

                    {/* ADA Compliance */}
                    {spatialAnalysis.accessibility_report.ada_compliant !== undefined && (
                      <div className={`p-4 rounded-lg border-2 ${
                        spatialAnalysis.accessibility_report.ada_compliant
                          ? 'bg-green-50 border-green-200'
                          : 'bg-amber-50 border-amber-200'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          {spatialAnalysis.accessibility_report.ada_compliant ? (
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-amber-600" />
                          )}
                          <h4 className="font-semibold text-gray-900">ADA Compliance</h4>
                        </div>
                        <p className={`text-sm font-medium ${
                          spatialAnalysis.accessibility_report.ada_compliant
                            ? 'text-green-700'
                            : 'text-amber-700'
                        }`}>
                          {spatialAnalysis.accessibility_report.ada_compliant ? 'Compliant' : 'Review Needed'}
                        </p>
                      </div>
                    )}

                    {/* Safety Notes */}
                    {spatialAnalysis.accessibility_report.safety_notes && (
                      <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="w-5 h-5 text-purple-600" />
                          <h4 className="font-semibold text-gray-900">Safety Notes</h4>
                        </div>
                        <p className="text-sm text-gray-700">
                          {typeof spatialAnalysis.accessibility_report.safety_notes === 'string'
                            ? spatialAnalysis.accessibility_report.safety_notes
                            : JSON.stringify(spatialAnalysis.accessibility_report.safety_notes)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Additional Accessibility Info */}
                  {spatialAnalysis.accessibility_report.recommendations && (
                    <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
                      <h4 className="font-semibold text-gray-900 mb-2">Recommendations</h4>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {typeof spatialAnalysis.accessibility_report.recommendations === 'string'
                          ? spatialAnalysis.accessibility_report.recommendations
                          : JSON.stringify(spatialAnalysis.accessibility_report.recommendations)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Confidence Score */}
            {spatialAnalysis.confidence_score !== undefined && (
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold mb-1">AI Confidence Score</h4>
                    <p className="text-white/80 text-sm">Analysis reliability rating</p>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold">
                      {Math.round(spatialAnalysis.confidence_score * 100)}%
                    </div>
                    <div className="text-sm text-white/80 mt-1">
                      {spatialAnalysis.confidence_score >= 0.8 ? 'High' :
                       spatialAnalysis.confidence_score >= 0.6 ? 'Medium' : 'Low'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Materials Tab */}
        {activeTab === 'materials' && matchedMaterials.length > 0 && (
          <div className="space-y-4">
            {/* View All Materials Button */}
            {onViewAllMaterials && (
              <button
                onClick={onViewAllMaterials}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <Package className="w-5 h-5" />
                View All Materials with AI Context
                <Sparkles className="w-5 h-5" />
              </button>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {matchedMaterials.map(material => (
                <button
                  key={material.id}
                  onClick={() => onMaterialClick?.(material.id)}
                  className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden hover:border-blue-600 hover:shadow-lg transition-all group"
                >
                  <div className="aspect-square bg-gray-100">
                    {material.image_url ? (
                      <img
                        src={material.image_url}
                        alt={material.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <LayoutGrid className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-sm text-gray-900 line-clamp-1 group-hover:text-blue-600">
                      {material.name}
                    </p>
                    {material.metadata?.price && (
                      <p className="text-xs text-blue-600 font-semibold mt-1">
                        ${material.metadata.price}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="space-y-6">
            {/* Parsed Request */}
            {parsedRequest && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Design Request</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {parsedRequest.room_type && (
                    <div>
                      <span className="text-gray-600">Room Type:</span>
                      <span className="ml-2 font-medium text-gray-900">{parsedRequest.room_type}</span>
                    </div>
                  )}
                  {parsedRequest.style && (
                    <div>
                      <span className="text-gray-600">Style:</span>
                      <span className="ml-2 font-medium text-gray-900">{parsedRequest.style}</span>
                    </div>
                  )}
                  {parsedRequest.layout && (
                    <div className="col-span-2">
                      <span className="text-gray-600">Layout:</span>
                      <span className="ml-2 font-medium text-gray-900">{parsedRequest.layout}</span>
                    </div>
                  )}
                  {parsedRequest.materials && parsedRequest.materials.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-gray-600">Materials:</span>
                      <span className="ml-2 font-medium text-gray-900">{parsedRequest.materials.join(', ')}</span>
                    </div>
                  )}
                  {parsedRequest.features && parsedRequest.features.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-gray-600">Features:</span>
                      <span className="ml-2 font-medium text-gray-900">{parsedRequest.features.join(', ')}</span>
                    </div>
                  )}
                  {parsedRequest.enhanced_prompt && (
                    <div className="col-span-2">
                      <span className="text-gray-600">Enhanced Prompt:</span>
                      <p className="mt-1 text-gray-900 text-xs bg-white p-2 rounded">{parsedRequest.enhanced_prompt}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quality Assessment */}
            {qualityAssessment && (
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Quality Assessment</h3>
                <div className="space-y-2">
                  {qualityAssessment.score !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Score:</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full"
                          style={{ width: `${qualityAssessment.score}%` }}
                        />
                      </div>
                      <span className="font-medium text-gray-900">{qualityAssessment.score}/100</span>
                    </div>
                  )}
                  {qualityAssessment.feedback && (
                    <div>
                      <span className="text-gray-600">Feedback:</span>
                      <p className="mt-1 text-sm text-gray-900">{qualityAssessment.feedback}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Processing Time */}
            {processingTimeMs !== undefined && (
              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Processing Time</h3>
                <p className="text-2xl font-bold text-purple-600">
                  {(processingTimeMs / 1000).toFixed(2)}s
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {images.length} images generated in {(processingTimeMs / 1000).toFixed(1)} seconds
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image Analysis Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowImageModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-blue-600" />
                <h2 className="text-2xl font-bold text-gray-900">Design Analysis & Materials</h2>
              </div>
              <button
                onClick={() => setShowImageModal(false)}
                className="p-2 hover:bg-white/50 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                {/* Left: Image */}
                <div className="space-y-4">
                  <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
                    <img
                      src={images[currentImageIndex]}
                      alt={`Design ${currentImageIndex + 1}`}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Image Info */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-2">Design Details</h3>
                    <div className="space-y-2 text-sm">
                      {parsedRequest?.room_type && (
                        <div className="flex items-center gap-2">
                          <Home className="w-4 h-4 text-gray-600" />
                          <span className="text-gray-600">Room Type:</span>
                          <span className="font-medium text-gray-900 capitalize">{parsedRequest.room_type}</span>
                        </div>
                      )}
                      {parsedRequest?.style && (
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-gray-600" />
                          <span className="text-gray-600">Style:</span>
                          <span className="font-medium text-gray-900 capitalize">{parsedRequest.style}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Analysis & Materials */}
                <div className="space-y-4">
                  {/* Spatial Analysis */}
                  {spatialAnalysis && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="w-5 h-5 text-blue-600" />
                        <h3 className="font-semibold text-gray-900">AI Spatial Analysis</h3>
                        {spatialAnalysis.confidence_score && (
                          <span className="ml-auto text-sm font-medium text-blue-600">
                            {(spatialAnalysis.confidence_score * 100).toFixed(0)}% confidence
                          </span>
                        )}
                      </div>

                      {/* Layout Analysis */}
                      {spatialAnalysis.layout_analysis && (
                        <div className="mb-3">
                          <h4 className="text-sm font-medium text-gray-700 mb-1">Layout Analysis</h4>
                          <p className="text-sm text-gray-600">{JSON.stringify(spatialAnalysis.layout_analysis)}</p>
                        </div>
                      )}

                      {/* Material Suggestions */}
                      {spatialAnalysis.material_suggestions && spatialAnalysis.material_suggestions.length > 0 && (
                        <div className="mb-3">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Material Suggestions</h4>
                          <div className="space-y-1">
                            {spatialAnalysis.material_suggestions.slice(0, 3).map((suggestion: any, idx: number) => (
                              <div key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                <span>{typeof suggestion === 'string' ? suggestion : suggestion.name || JSON.stringify(suggestion)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Accessibility */}
                      {spatialAnalysis.accessibility_report && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-1">Accessibility</h4>
                          <p className="text-sm text-gray-600">{JSON.stringify(spatialAnalysis.accessibility_report)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Matched Materials */}
                  {matchedMaterials && matchedMaterials.length > 0 && (
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Package className="w-5 h-5 text-green-600" />
                        <h3 className="font-semibold text-gray-900">Available Materials</h3>
                        <span className="ml-auto text-sm font-medium text-green-600">
                          {matchedMaterials.length} products
                        </span>
                      </div>

                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {matchedMaterials.map((material) => (
                          <div
                            key={material.id}
                            className="bg-white rounded-lg p-3 flex items-center gap-3 hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() => onMaterialClick?.(material.id)}
                          >
                            {material.image_url && (
                              <img
                                src={material.image_url}
                                alt={material.name}
                                className="w-12 h-12 object-cover rounded"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900 truncate">{material.name}</h4>
                              {material.metadata?.category && (
                                <p className="text-xs text-gray-600">{material.metadata.category}</p>
                              )}
                            </div>
                            <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0" />
                          </div>
                        ))}
                      </div>

                      {onViewAllMaterials && (
                        <button
                          onClick={onViewAllMaterials}
                          className="w-full mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                        >
                          View All Materials
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

