import React, { useState } from 'react';
import { Book, FileText, ExternalLink, RefreshCw } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export const MivaaDocsViewer: React.FC = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const openDocsInNewTab = async (action: string, title: string) => {
    setLoading(action);

    try {
      // Create a form to POST to the gateway in a new tab
      const form = document.createElement('form');
      form.method = 'POST';
      form.action =
        'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway';
      form.target = '_blank';

      // Add authorization header as a hidden input (this won't work for CORS)
      // Instead, we'll use a different approach

      // For now, let's show the user how to access it
      const payload = {
        action: action,
        payload: {},
      };

      const url =
        'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway';

      toast({
        title: `Opening ${title}`,
        description: `Use this payload in a REST client: ${JSON.stringify(payload)}`,
        duration: 5000,
      });

      // For development, let's try to fetch and display
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const content = await response.text();

        // Create a new window with the content
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(content);
          newWindow.document.close();
        }
      } else {
        throw new Error(`Failed to load ${title}: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error opening ${title}:`, error);
      toast({
        title: 'Error',
        description: `Failed to open ${title}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: `${label} copied to clipboard`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">MIVAA API Documentation</h1>
          <p className="text-muted-foreground">
            Access MIVAA service documentation and API specifications
          </p>
        </div>
      </div>

      <Tabs defaultValue="docs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
          <TabsTrigger value="endpoints">API Endpoints</TabsTrigger>
        </TabsList>

        <TabsContent value="docs" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Swagger UI */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Book className="h-5 w-5 text-blue-600" />
                  Swagger UI
                </CardTitle>
                <CardDescription>
                  Interactive API documentation with testing capabilities
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge variant="outline" className="text-blue-600">
                  Interactive
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Test API endpoints directly in the browser with
                  request/response examples.
                </p>
                <Button
                  onClick={() => openDocsInNewTab('docs', 'Swagger UI')}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && openDocsInNewTab('docs', 'Swagger UI')
                  }
                  disabled={loading === 'docs'}
                  className="w-full"
                >
                  {loading === 'docs' ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Open Swagger UI
                </Button>
              </CardContent>
            </Card>

            {/* ReDoc */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-600" />
                  ReDoc
                </CardTitle>
                <CardDescription>
                  Clean, responsive API documentation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge variant="outline" className="text-green-600">
                  Documentation
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Beautiful, responsive documentation with detailed endpoint
                  descriptions.
                </p>
                <Button
                  onClick={() => openDocsInNewTab('redoc', 'ReDoc')}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && openDocsInNewTab('redoc', 'ReDoc')
                  }
                  disabled={loading === 'redoc'}
                  className="w-full"
                  variant="outline"
                >
                  {loading === 'redoc' ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Open ReDoc
                </Button>
              </CardContent>
            </Card>

            {/* OpenAPI JSON */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-orange-600" />
                  OpenAPI Spec
                </CardTitle>
                <CardDescription>
                  Raw OpenAPI JSON specification
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Badge variant="outline" className="text-orange-600">
                  JSON
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Download the OpenAPI specification for code generation and
                  tooling.
                </p>
                <Button
                  onClick={() =>
                    openDocsInNewTab('openapi_json', 'OpenAPI JSON')
                  }
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    openDocsInNewTab('openapi_json', 'OpenAPI JSON')
                  }
                  disabled={loading === 'openapi_json'}
                  className="w-full"
                  variant="outline"
                >
                  {loading === 'openapi_json' ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  View OpenAPI JSON
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="endpoints" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gateway Endpoints</CardTitle>
              <CardDescription>
                Use these payloads with the MIVAA gateway to access
                documentation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Swagger UI</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyToClipboard(
                          '{"action": "docs", "payload": {}}',
                          'Swagger UI payload',
                        )
                      }
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        copyToClipboard(
                          '{"action": "docs", "payload": {}}',
                          'Swagger UI payload',
                        )
                      }
                    >
                      Copy
                    </Button>
                  </div>
                  <code className="text-sm">
                    {'{"action": "docs", "payload": {}}'}
                  </code>
                </div>

                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">ReDoc</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyToClipboard(
                          '{"action": "redoc", "payload": {}}',
                          'ReDoc payload',
                        )
                      }
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        copyToClipboard(
                          '{"action": "redoc", "payload": {}}',
                          'ReDoc payload',
                        )
                      }
                    >
                      Copy
                    </Button>
                  </div>
                  <code className="text-sm">
                    {'{"action": "redoc", "payload": {}}'}
                  </code>
                </div>

                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">OpenAPI JSON</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        copyToClipboard(
                          '{"action": "openapi_json", "payload": {}}',
                          'OpenAPI JSON payload',
                        )
                      }
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        copyToClipboard(
                          '{"action": "openapi_json", "payload": {}}',
                          'OpenAPI JSON payload',
                        )
                      }
                    >
                      Copy
                    </Button>
                  </div>
                  <code className="text-sm">
                    {'{"action": "openapi_json", "payload": {}}'}
                  </code>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Gateway URL:</strong>{' '}
                  https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  <strong>Method:</strong> POST with Authorization header
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
