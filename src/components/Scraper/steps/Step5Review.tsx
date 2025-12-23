import React from 'react';
import { CheckCircle, Globe, Settings, FileJson, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type ScrapingMode = 'single-page' | 'sitemap' | 'crawl' | 'search' | 'map';

interface FieldMapping {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
}

interface Step5ReviewProps {
  scrapingMode: ScrapingMode;
  sourceUrl: string;
  maxPages: number;
  timeout: number;
  retryCount: number;
  concurrentPages: number;
  fieldMappings: FieldMapping[];
  onCreateSession: () => Promise<void>;
  isCreating: boolean;
}

export const Step5Review: React.FC<Step5ReviewProps> = ({
  scrapingMode,
  sourceUrl,
  maxPages,
  timeout,
  retryCount,
  concurrentPages,
  fieldMappings,
  onCreateSession,
  isCreating,
}) => {
  const getModeLabel = (mode: ScrapingMode) => {
    const labels = {
      'single-page': 'Single Page',
      sitemap: 'Sitemap',
      crawl: 'Crawl',
      search: 'Search',
      map: 'Map',
    };
    return labels[mode] || mode;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Review & Create
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Review your configuration before creating the scraping session
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Source Configuration */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Source Configuration</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode:</span>
                <span className="font-medium">{getModeLabel(scrapingMode)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">URL:</span>
                <span className="font-medium truncate max-w-md">{sourceUrl}</span>
              </div>
              {scrapingMode === 'sitemap' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Pages:</span>
                  <span className="font-medium">{maxPages}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* API Configuration */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Settings className="h-4 w-4 text-primary" />
              <h4 className="font-medium">API Configuration</h4>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block mb-1">Timeout</span>
                <span className="font-medium">{timeout}ms</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Retries</span>
                <span className="font-medium">{retryCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">Concurrent</span>
                <span className="font-medium">{concurrentPages}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Field Mappings */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileJson className="h-4 w-4 text-primary" />
              <h4 className="font-medium">Field Mappings</h4>
            </div>
            <div className="space-y-2">
              {fieldMappings.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{field.label}</span>
                    {field.required && (
                      <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                        Required
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs">{field.type}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Create Button */}
          <Button
            onClick={onCreateSession}
            disabled={isCreating}
            className="w-full h-12"
            size="lg"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Creating Session...
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 mr-2" />
                Create Scraping Session
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

