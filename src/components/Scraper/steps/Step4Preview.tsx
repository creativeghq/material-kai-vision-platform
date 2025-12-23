import React from 'react';
import { Eye, Sparkles, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PreviewMaterial {
  name: string;
  description?: string;
  category?: string;
  price?: string;
  images: string[];
  properties: Record<string, any>;
  supplier?: string;
}

interface Step4PreviewProps {
  onPreview: () => Promise<void>;
  isLoading: boolean;
  previewMaterials: PreviewMaterial[];
  previewUrl: string;
  hasPreviewRun: boolean;
}

export const Step4Preview: React.FC<Step4PreviewProps> = ({
  onPreview,
  isLoading,
  previewMaterials,
  previewUrl,
  hasPreviewRun,
}) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Preview Extraction
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Test your configuration on a sample page before running the full scrape. This helps
            ensure your field mappings are correct.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              <strong>Recommended:</strong> Always preview first! This lets you see what data is
              extracted and verify your field mappings before running the full scrape.
            </AlertDescription>
          </Alert>

          <Button
            onClick={onPreview}
            disabled={isLoading}
            className="w-full h-12"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Running Preview...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Run Preview
              </>
            )}
          </Button>

          {hasPreviewRun && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Preview Results</h4>
                <span className="text-sm text-muted-foreground">
                  {previewMaterials.length} materials found
                </span>
              </div>

              {previewMaterials.length > 0 ? (
                <div className="space-y-3">
                  {previewMaterials.slice(0, 3).map((material, index) => (
                    <div
                      key={index}
                      className="p-4 border rounded-lg bg-muted/30 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h5 className="font-medium">{material.name}</h5>
                          {material.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {material.description}
                            </p>
                          )}
                        </div>
                        {material.images.length > 0 && (
                          <img
                            src={material.images[0]}
                            alt={material.name}
                            className="w-16 h-16 object-cover rounded ml-4"
                          />
                        )}
                      </div>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {material.category && (
                          <span className="bg-primary/10 px-2 py-1 rounded">
                            {material.category}
                          </span>
                        )}
                        {material.price && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                            {material.price}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {previewMaterials.length > 3 && (
                    <p className="text-sm text-muted-foreground text-center">
                      + {previewMaterials.length - 3} more materials
                    </p>
                  )}
                </div>
              ) : (
                <Alert>
                  <AlertDescription>
                    No materials found in the preview. Try adjusting your field mappings or check
                    if the URL contains the expected content.
                  </AlertDescription>
                </Alert>
              )}

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  <strong>Sample URL:</strong> {previewUrl}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="font-medium text-sm text-yellow-900 mb-2">⚠️ Important</h4>
        <p className="text-sm text-yellow-800">
          The preview only scrapes one sample page. If the results look good, you can proceed to
          create the full scraping session in the next step.
        </p>
      </div>
    </div>
  );
};

