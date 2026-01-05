import React from 'react';
import { Settings, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Separator } from '@/components/core/ui/separator';

interface FirecrawlOptions {
  formats: string[];
  onlyMainContent: boolean;
  includeLinks: boolean;
  includeTags: string[];
  excludeTags: string[];
  waitFor: number;
  mobile: boolean;
  skipTlsVerification: boolean;
  parsePDF: boolean;
  removeBase64Images: boolean;
  blockAds: boolean;
  extractorMode: 'llm-extraction' | 'css-extraction';
  schema: string;
  actions: unknown[];
  maxAge: number;
  proxy: 'basic' | 'premium' | 'none';
}

interface Step2ConfigurationProps {
  timeout: number;
  onTimeoutChange: (timeout: number) => void;
  retryCount: number;
  onRetryCountChange: (count: number) => void;
  concurrentPages: number;
  onConcurrentPagesChange: (pages: number) => void;
  firecrawlOptions: FirecrawlOptions;
  onFirecrawlOptionsChange: (options: FirecrawlOptions) => void;
}

export const Step2Configuration: React.FC<Step2ConfigurationProps> = ({
  timeout,
  onTimeoutChange,
  retryCount,
  onRetryCountChange,
  concurrentPages,
  onConcurrentPagesChange,
  firecrawlOptions,
  onFirecrawlOptionsChange,
}) => {
  return (
    <div className="space-y-6">
      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            API Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="timeout">Timeout (ms)</Label>
              <Input
                id="timeout"
                type="number"
                value={timeout}
                onChange={(e) => onTimeoutChange(parseInt(e.target.value) || 30000)}
                min="5000"
                max="120000"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="retry-count">Retry Count</Label>
              <Input
                id="retry-count"
                type="number"
                value={retryCount}
                onChange={(e) => onRetryCountChange(parseInt(e.target.value) || 3)}
                min="0"
                max="10"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="concurrent-pages">Concurrent Pages</Label>
              <Input
                id="concurrent-pages"
                type="number"
                value={concurrentPages}
                onChange={(e) => onConcurrentPagesChange(parseInt(e.target.value) || 5)}
                min="1"
                max="20"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Firecrawl Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Firecrawl Options
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Configure how Firecrawl extracts content. Defaults are optimized for material extraction.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Output Format</Label>
            <p className="text-xs text-muted-foreground mb-2">
              ✅ Markdown only - clean format for LLM extraction
            </p>
            <div className="flex gap-2 mt-2 text-sm text-muted-foreground">
              <span className="bg-primary/10 px-2 py-1 rounded">✓ Markdown</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Checkbox id="onlyMainContent" checked={firecrawlOptions.onlyMainContent} disabled />
                <Label htmlFor="onlyMainContent" className="text-sm">
                  Main Content Only
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                ✅ Enabled - focuses on product content
              </p>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <Checkbox id="blockAds" checked={firecrawlOptions.blockAds} disabled />
                <Label htmlFor="blockAds" className="text-sm">
                  Block Ads
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">✅ Cleaner extraction</p>
            </div>
          </div>

          <div>
            <Label htmlFor="excludeTags">Exclude HTML Tags (comma separated)</Label>
            <Input
              id="excludeTags"
              value={firecrawlOptions.excludeTags.join(', ')}
              onChange={(e) =>
                onFirecrawlOptionsChange({
                  ...firecrawlOptions,
                  excludeTags: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="nav, footer, aside"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="waitFor">Wait For (ms)</Label>
            <Input
              id="waitFor"
              type="number"
              value={firecrawlOptions.waitFor}
              onChange={(e) =>
                onFirecrawlOptionsChange({
                  ...firecrawlOptions,
                  waitFor: parseInt(e.target.value) || 0,
                })
              }
              min="0"
              max="10000"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

