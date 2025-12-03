import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize2, Grid3x3, LayoutGrid, DollarSign } from 'lucide-react';

interface DesignCanvasProps {
  images?: string[];
  spatialAnalysis?: {
    layout_analysis?: any;
    material_suggestions?: any[];
    accessibility_report?: any;
    spatial_metrics?: any;
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
}

export const DesignCanvas: React.FC<DesignCanvasProps> = ({
  images = [],
  spatialAnalysis,
  matchedMaterials = [],
  parsedRequest,
  qualityAssessment,
  processingTimeMs,
  onMaterialClick,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'images' | 'analysis' | 'materials' | 'details'>('images');

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
            <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
              <img
                src={images[currentImageIndex]}
                alt={`Design ${currentImageIndex + 1}`}
                className="w-full h-full object-contain"
              />
              
              {/* Navigation */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                  
                  {/* Image Counter */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/70 text-white rounded-full text-sm">
                    {currentImageIndex + 1} / {images.length}
                  </div>
                </>
              )}

              {/* Download Button */}
              <button
                onClick={() => downloadImage(images[currentImageIndex])}
                className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-colors"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                      idx === currentImageIndex
                        ? 'border-blue-600 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Spatial Analysis Tab */}
        {activeTab === 'analysis' && spatialAnalysis && (
          <div className="space-y-6">
            {/* Layout Analysis */}
            {spatialAnalysis.layout_analysis && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Maximize2 className="w-5 h-5 text-blue-600" />
                  Layout Analysis
                </h3>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(spatialAnalysis.layout_analysis, null, 2)}
                </pre>
              </div>
            )}

            {/* Material Suggestions */}
            {spatialAnalysis.material_suggestions && spatialAnalysis.material_suggestions.length > 0 && (
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Material Suggestions</h3>
                <ul className="space-y-2">
                  {spatialAnalysis.material_suggestions.map((suggestion: any, idx: number) => (
                    <li key={idx} className="text-sm text-gray-700">
                      • {typeof suggestion === 'string' ? suggestion : JSON.stringify(suggestion)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Accessibility Report */}
            {spatialAnalysis.accessibility_report && (
              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Accessibility Report</h3>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                  {JSON.stringify(spatialAnalysis.accessibility_report, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Materials Tab */}
        {activeTab === 'materials' && matchedMaterials.length > 0 && (
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
    </div>
  );
};

