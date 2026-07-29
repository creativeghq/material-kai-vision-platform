import React from 'react';
import { Eye, Download, Share2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { RecognitionResult } from '@/types/materials';

/**
 * Shape we read out of `RecognitionResult.properties` (typed `Record<string, unknown>`
 * because MIVAA decides the keys). Declared so the reads below are checked rather than
 * cast to `any` — casting is what let this block address `propertiesDetected`, a field
 * that never existed on the result, so it silently rendered nothing.
 */
type DetectedProperties = {
  density?: number | string;
  yieldStrength?: number | string;
  customProperties?: unknown;
};

interface RecognitionResultsProps {
  results: RecognitionResult[];
  isLoading?: boolean;
}

export const RecognitionResults: React.FC<RecognitionResultsProps> = ({
  results,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-pulse">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border rounded-lg p-4">
                    <div className="aspect-square bg-muted rounded-lg mb-3"></div>
                    <div className="h-4 bg-muted rounded mb-2"></div>
                    <div className="h-3 bg-muted rounded w-2/3 mb-2"></div>
                    <div className="h-6 bg-muted rounded w-1/3"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Eye className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Results Yet</h3>
          <p className="text-muted-foreground">
            Upload images to see AI-powered material recognition results
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <SectionHeader
          title="Recognition Results"
          actions={
            <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
              {results.length} material{results.length !== 1 ? 's' : ''}{' '}
              identified
            </Badge>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((result, index) => (
            <div
              key={index}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow group"
            >
              {/* Material Image */}
              <div className="aspect-square bg-muted rounded-lg mb-3 overflow-hidden">
                <img
                  src={result.imageUrl || '/placeholder-image.jpg'}
                  alt={result.materialType || 'Material'}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Material Info */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">
                  {result.materialType || 'Unknown Material'}
                </h4>

                {/* Confidence Score */}
                <div className="flex items-center justify-between">
                  <Badge
                    className={
                      result.confidence > 0.9
                        ? 'bg-green-100 text-green-800 hover:bg-green-100/80'
                        : result.confidence > 0.7
                          ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
                    }
                  >
                    {Math.round(result.confidence * 100)}% match
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {result.processingTime ? result.processingTime.toFixed(1) : '0.0'}s
                  </span>
                </div>

                {/* Material Properties */}
                {result.properties && (
                  <div className="space-y-1">
                    {(result.properties as DetectedProperties).density && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Density:</span>
                        <span>
                          {(result.properties as DetectedProperties).density} g/cm³
                        </span>
                      </div>
                    )}
                    {(result.properties as DetectedProperties).yieldStrength && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Yield Strength:
                        </span>
                        <span>
                          {(result.properties as DetectedProperties).yieldStrength} MPa
                        </span>
                      </div>
                    )}
                    {result.materialId && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Material:</span>
                        <span>{result.materialId}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Enhanced Material Properties */}
                {(result.properties as DetectedProperties)?.customProperties && (
                  <div className="text-xs text-muted-foreground mb-2">
                    <span className="font-medium">
                      Additional Properties Available
                    </span>
                  </div>
                )}

                {result.materialId && (
                  <div className="text-xs text-success mb-2">
                    <span className="font-medium">Material Data Available</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex space-x-1">
                    <Button
                      className="hover:bg-accent hover:text-accent-foreground h-7 w-7 p-0"
                      title="Download material data"
                      disabled={!result.materialId}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                  <Button
                    className="hover:bg-accent hover:text-accent-foreground h-7 w-7 p-0"
                    title="Share result"
                  >
                    <Share2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
