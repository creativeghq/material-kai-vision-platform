import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Eye, Star, Download, Share2 } from 'lucide-react';
import { RecognitionResult } from '@/types/materials';

interface RecognitionResultsProps {
  results: RecognitionResult[];
  isLoading?: boolean;
}

export const RecognitionResults: React.FC<RecognitionResultsProps> = ({ 
  results, 
  isLoading = false 
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recognition Results</h3>
          <Badge variant="secondary">
            {results.length} material{results.length !== 1 ? 's' : ''} identified
          </Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((result, index) => (
            <div
              key={index}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow group"
            >
              {/* Material Image */}
              <div className="aspect-square bg-muted rounded-lg mb-3 overflow-hidden">
                <img
                  src={result.imageUrl}
                  alt={result.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Material Info */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">{result.name}</h4>
                
                {/* Confidence Score */}
                <div className="flex items-center justify-between">
                  <Badge 
                    variant={result.confidence > 0.9 ? "default" : result.confidence > 0.7 ? "secondary" : "outline"}
                  >
                    {Math.round(result.confidence * 100)}% match
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {result.processingTime.toFixed(1)}s
                  </span>
                </div>

                {/* Material Properties */}
                {result.metadata && (
                  <div className="space-y-1">
                    {result.metadata.color && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Color:</span>
                        <span className="capitalize">{result.metadata.color}</span>
                      </div>
                    )}
                    {result.metadata.finish && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Finish:</span>
                        <span className="capitalize">{result.metadata.finish}</span>
                      </div>
                    )}
                    {result.metadata.brand && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Brand:</span>
                        <span>{result.metadata.brand}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex space-x-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Star className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
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