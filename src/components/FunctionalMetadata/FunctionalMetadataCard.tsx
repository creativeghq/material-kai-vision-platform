import React, { useState } from 'react';
import {
  Shield,
  Droplets,
  Thermometer,
  Hammer,
  Leaf,
  Waves,
  Palette,
  ChevronDown,
  ChevronUp,
  Info,
  Star,
  CheckCircle,
  AlertCircle,
  Target,
  Lightbulb,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { type FunctionalMetadata } from '@/types/materials';

interface FunctionalMetadataCardProps {
  /** Functional metadata object containing all 9 categories */
  functionalMetadata: FunctionalMetadata;
  /** Display mode - compact for sidebars, expanded for full view */
  displayMode?: 'compact' | 'expanded';
  /** Whether to show confidence indicators */
  showConfidence?: boolean;
  /** Callback for when user clicks on a specific property */
  onPropertyClick?: (
    category: string,
    property: string,
    value: unknown,
  ) => void;
  /** Raw functional data from MIVAA API for enhanced display */
  rawFunctionalData?: Record<
    string,
    {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    }
  >;
  /** Extraction summary for application suggestions */
  extractionSummary?: {
    categories_with_data: string[];
    key_properties_found: string[];
    suggested_applications: string[];
    overall_confidence: 'low' | 'medium' | 'high';
  };
}

/** Category configuration with icons and display names */
const CATEGORY_CONFIG = {
  slipSafetyRatings: {
    icon: Shield,
    displayName: '🦶 Slip/Safety Ratings',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  surfaceGlossReflectivity: {
    icon: Star,
    displayName: '✨ Surface Gloss/Reflectivity',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
  },
  mechanicalPropertiesExtended: {
    icon: Hammer,
    displayName: '🔧 Mechanical Properties',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  thermalProperties: {
    icon: Thermometer,
    displayName: '🌡️ Thermal Properties',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  waterMoistureResistance: {
    icon: Droplets,
    displayName: '💧 Water/Moisture Resistance',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
  },
  chemicalHygieneResistance: {
    icon: Shield,
    displayName: '🧪 Chemical/Hygiene Resistance',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  acousticElectricalProperties: {
    icon: Waves,
    displayName: '🔊 Acoustic/Electrical Properties',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  environmentalSustainability: {
    icon: Leaf,
    displayName: '🌱 Environmental/Sustainability',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  dimensionalAesthetic: {
    icon: Palette,
    displayName: '🎨 Dimensional/Aesthetic',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
  },
} as const;

export const FunctionalMetadataCard: React.FC<FunctionalMetadataCardProps> = ({
  functionalMetadata,
  displayMode = 'expanded',
  showConfidence = true,
  onPropertyClick,
  rawFunctionalData,
  extractionSummary,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );

  const toggleCategory = (categoryKey: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryKey)) {
      newExpanded.delete(categoryKey);
    } else {
      newExpanded.add(categoryKey);
    }
    setExpandedCategories(newExpanded);
  };

  const getConfidenceColor = (
    confidence: 'low' | 'medium' | 'high' | string,
  ): string => {
    switch (confidence) {
      case 'high':
        return 'text-green-600 bg-green-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'low':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const renderPropertyValue = (
    _key: string,
    value: unknown,
  ): React.ReactNode => {
    if (value === null || value === undefined) return null;

    if (typeof value === 'boolean') {
      return (
        <Badge variant={value ? 'default' : 'secondary'}>
          {value ? 'Yes' : 'No'}
        </Badge>
      );
    }

    if (typeof value === 'number') {
      return <span className="font-mono text-sm">{value}</span>;
    }

    if (typeof value === 'string') {
      return <span className="text-sm">{value}</span>;
    }

    if (typeof value === 'object' && value !== null) {
      return (
        <div className="text-xs text-muted-foreground">
          {JSON.stringify(value, null, 2)}
        </div>
      );
    }

    return <span className="text-sm">{String(value)}</span>;
  };

  const renderCategoryContent = (
    categoryKey: string,
    categoryData: unknown,
  ) => {
    const config = CATEGORY_CONFIG[categoryKey as keyof typeof CATEGORY_CONFIG];
    if (!config || !categoryData) return null;

    const Icon = config.icon;
    const hasData =
      Object.keys(categoryData as Record<string, unknown>).length > 0;
    const isExpanded = expandedCategories.has(categoryKey);

    // Get raw data for this category to display highlights/technical details
    const rawCategoryKey = categoryKey
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
    const rawCategoryData = rawFunctionalData?.[rawCategoryKey];
    const extractionConfidence = rawCategoryData?.extraction_confidence as
      | 'low'
      | 'medium'
      | 'high'
      | undefined;

    const renderConfidenceIndicator = (
      confidence?: 'low' | 'medium' | 'high',
    ) => {
      if (!confidence || !showConfidence) return null;

      const getConfidenceIcon = () => {
        switch (confidence) {
          case 'high':
            return <CheckCircle className="h-3 w-3" />;
          case 'medium':
            return <AlertCircle className="h-3 w-3" />;
          case 'low':
            return <Info className="h-3 w-3" />;
          default:
            return <Info className="h-3 w-3" />;
        }
      };

      return (
        <Badge
          variant="outline"
          className={`text-xs ${getConfidenceColor(confidence)}`}
        >
          {getConfidenceIcon()}
          <span className="ml-1">{confidence} confidence</span>
        </Badge>
      );
    };

    return (
      <Card
        key={categoryKey}
        className={`border-l-4 ${config.bgColor} border-l-current transition-all duration-200 hover:shadow-md`}
      >
        <Collapsible
          open={isExpanded}
          onOpenChange={() => toggleCategory(categoryKey)}
        >
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between p-0 h-auto"
              >
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  {config.displayName}
                  <div className="flex items-center gap-2 ml-2">
                    {hasData && (
                      <Badge variant="outline" className="text-xs">
                        {Object.keys(categoryData).length} properties
                      </Badge>
                    )}
                    {renderConfidenceIndicator(extractionConfidence)}
                  </div>
                </CardTitle>
                {hasData ? (
                  isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    No data
                  </Badge>
                )}
              </Button>
            </CollapsibleTrigger>
          </CardHeader>

          {hasData && (
            <CollapsibleContent>
              <CardContent className="pt-0">
                {/* Raw highlights section */}
                {rawCategoryData?.highlights &&
                  rawCategoryData.highlights.length > 0 && (
                    <div className="mb-4 p-3 bg-white/60 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Star className="h-3 w-3 text-amber-500" />
                        <span className="text-xs font-semibold text-muted-foreground">
                          Key Highlights
                        </span>
                      </div>
                      <div className="space-y-1">
                        {rawCategoryData.highlights.map((highlight, idx) => (
                          <div
                            key={idx}
                            className="text-xs text-foreground bg-white/80 p-2 rounded border-l-2 border-amber-200"
                          >
                            {highlight}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Structured properties */}
                <div className="space-y-3">
                  {Object.entries(categoryData).map(([propKey, propValue]) => (
                    <div
                      key={propKey}
                      className="flex justify-between items-start p-2 rounded-md hover:bg-white/50 cursor-pointer transition-colors border border-transparent hover:border-gray-200"
                      onClick={() =>
                        onPropertyClick?.(categoryKey, propKey, propValue)
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onPropertyClick?.(categoryKey, propKey, propValue);
                        }
                      }}
                    >
                      <div className="flex-1">
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          {propKey
                            .replace(/([A-Z])/g, ' $1')
                            .replace(/^./, (str) => str.toUpperCase())}
                        </div>
                        <div className="flex items-center gap-2">
                          {renderPropertyValue(propKey, propValue)}
                        </div>
                      </div>

                      <div className="ml-2 flex items-center gap-1">
                        <Target className="h-3 w-3 text-muted-foreground opacity-50" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Technical details section */}
                {rawCategoryData?.technical_details &&
                  rawCategoryData.technical_details.length > 0 && (
                    <div className="mt-4 p-3 bg-gray-50/60 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Info className="h-3 w-3 text-blue-500" />
                        <span className="text-xs font-semibold text-muted-foreground">
                          Technical Details
                        </span>
                      </div>
                      <div className="space-y-1">
                        {rawCategoryData.technical_details
                          .slice(0, 3)
                          .map((detail, idx) => (
                            <div
                              key={idx}
                              className="text-xs text-muted-foreground"
                            >
                              • {detail}
                            </div>
                          ))}
                        {rawCategoryData.technical_details.length > 3 && (
                          <div className="text-xs text-muted-foreground italic">
                            +{rawCategoryData.technical_details.length - 3} more
                            details
                          </div>
                        )}
                      </div>
                    </div>
                  )}
              </CardContent>
            </CollapsibleContent>
          )}
        </Collapsible>
      </Card>
    );
  };

  const availableCategories = Object.entries(functionalMetadata)
    .filter(
      ([key, value]) =>
        key !== 'functionalMetadataUpdatedAt' &&
        key !== 'functionalMetadataSource' &&
        value,
    )
    .sort(([a], [b]) => a.localeCompare(b));

  if (availableCategories.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-muted-foreground">
            <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No functional metadata available</p>
            <p className="text-xs mt-1">
              Process document with MIVAA to generate functional properties
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Functional Properties</h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {availableCategories.length} categories
          </Badge>
          {extractionSummary?.overall_confidence && showConfidence && (
            <Badge
              variant="outline"
              className={`text-xs ${getConfidenceColor(extractionSummary.overall_confidence)}`}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Overall: {extractionSummary.overall_confidence}
            </Badge>
          )}
          {functionalMetadata.functionalMetadataSource && (
            <Badge variant="secondary" className="text-xs">
              Source: {functionalMetadata.functionalMetadataSource}
            </Badge>
          )}
        </div>
      </div>

      {/* Application Suggestions Section */}
      {extractionSummary?.suggested_applications &&
        extractionSummary.suggested_applications.length > 0 && (
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">
                  Suggested Applications
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {extractionSummary.suggested_applications.map((app, idx) => (
                  <Badge
                    key={idx}
                    variant="secondary"
                    className="justify-center p-2 text-xs bg-white/80 text-blue-800 border-blue-200 hover:bg-white cursor-pointer transition-colors"
                    onClick={() =>
                      onPropertyClick?.(
                        'applications',
                        'suggested_application',
                        app,
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onPropertyClick?.(
                          'applications',
                          'suggested_application',
                          app,
                        );
                      }
                    }}
                  >
                    {app}
                  </Badge>
                ))}
              </div>
              {extractionSummary.key_properties_found &&
                extractionSummary.key_properties_found.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <div className="text-xs text-blue-700 mb-1 font-medium">
                      Key Properties Found:
                    </div>
                    <div className="text-xs text-blue-600">
                      {extractionSummary.key_properties_found.join(' • ')}
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>
        )}

      {displayMode === 'compact' ? (
        <div className="grid gap-2">
          {availableCategories
            .slice(0, 3)
            .map(([categoryKey, categoryData]) =>
              renderCategoryContent(categoryKey, categoryData),
            )}
          {availableCategories.length > 3 && (
            <div className="text-center">
              <Badge variant="outline" className="text-xs">
                +{availableCategories.length - 3} more categories
              </Badge>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-1">
          {availableCategories.map(([categoryKey, categoryData]) =>
            renderCategoryContent(categoryKey, categoryData),
          )}
        </div>
      )}

      {functionalMetadata.functionalMetadataUpdatedAt && (
        <div className="text-xs text-muted-foreground text-right mt-2">
          Last updated:{' '}
          {new Date(
            functionalMetadata.functionalMetadataUpdatedAt,
          ).toLocaleString()}
        </div>
      )}
    </div>
  );
};
