import React, { useState } from 'react';
import {
  TestTube,
  Brain,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  Activity,

  ArrowLeft,
  Home,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BrowserApiIntegrationService } from '@/services/apiGateway/browserApiIntegrationService';

interface TestResult {
  provider: string;
  score: number;
  success: boolean;
  processing_time_ms: number;
  error?: string;
}

export const AITestingPanel: React.FC = () => {
  const navigate = useNavigate();
  const [testPrompt, setTestPrompt] = useState('Analyze this modern kitchen with marble countertops and stainless steel appliances');
  const [testImageUrl, setTestImageUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const { toast } = useToast();

  const testMaterialAnalysis = async () => {
    if (!testImageUrl.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide an image URL to test',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    setResults([]);

    try {
      // Mock test file data since uploaded_files table doesn't exist
      const testFile = {
        id: 'test-file-' + Date.now(),
        user_id: (await supabase.auth.getUser()).data.user?.id,
        file_name: 'test-image.jpg',
        file_type: 'image',
        storage_path: testImageUrl,
        file_size: 0,
        metadata: { test: true, original_url: testImageUrl },
      };

      // Test hybrid analysis
      const apiService = BrowserApiIntegrationService.getInstance();
      const result = await apiService.callSupabaseFunction('hybrid-material-analysis', {
        file_id: testFile.id,
        analysis_type: 'comprehensive',
        include_similar: false,
        minimum_score: 0.5,
        max_retries: 2,
      });

      if (!result.success) {
        throw new Error(`Hybrid analysis failed: ${result.error?.message || 'Unknown error'}`);
      }

      const data = result.data;

      // Process results
      const testResults: TestResult[] = [];

      if ((data as any).attempts) {
        (data as any).attempts.forEach((attempt: { provider: string; score?: number; success: boolean; error?: string; response?: string; processing_time_ms?: number }) => {
          testResults.push({
            provider: attempt.provider,
            score: attempt.score || 0,
            success: attempt.success,
            processing_time_ms: attempt.processing_time_ms || 0,
            error: attempt.error,
          });
        });
      }

      setResults(testResults);

      // Note: Cleanup would normally delete from uploaded_files table
      // but since table doesn't exist in current schema, we skip this step
      console.log('Test file cleanup skipped (uploaded_files table not in schema):', testFile.id);

      toast({
        title: 'Test Completed',
        description: `Analysis completed with score: ${(data as any).final_score?.toFixed(2) || 'N/A'}`,
        variant: 'default',
      });

    } catch (error) {
      console.error('Test error:', error);
      toast({
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const test3DGeneration = async () => {
    setTesting(true);

    try {
      const apiService = BrowserApiIntegrationService.getInstance();
      const result = await apiService.callSupabaseFunction('crewai-3d-generation', {
        user_id: (await supabase.auth.getUser()).data.user?.id,
        prompt: testPrompt,
        room_type: 'living room',
        style: 'modern',
      });

      if (!result.success) {
        throw new Error(`3D generation failed: ${result.error?.message || 'Unknown error'}`);
      }

      const data = result.data;

      toast({
        title: '3D Generation Test Completed',
        description: `Generation completed in ${((data as any)?.processing_time_ms / 1000).toFixed(2)}s`,
        variant: 'default',
      });

    } catch (error) {
      console.error('3D test error:', error);
      toast({
        title: '3D Test Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const getSampleImageUrls = () => [
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800',
    'https://images.unsplash.com/photo-1556912167-f556f1e54343?w=800',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => navigate('/')}
                className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
              <Button
                onClick={() => navigate('/admin')}
                className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AI Testing Panel</h1>
              <p className="text-sm text-muted-foreground">
                Test the hybrid AI system to generate analytics data and validate scoring
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">

      <div className="grid md:grid-cols-2 gap-6">
        {/* Material Analysis Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Material Analysis Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Test Image URL</label>
              <Input
                value={testImageUrl}
                onChange={(e) => setTestImageUrl(e.target.value)}
                placeholder="https://example.com/material-image.jpg"
              />
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-2">Sample URLs:</p>
                {getSampleImageUrls().map((url, i) => (
                  <Button
                    key={i}
                    className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50 mr-2 mb-1 text-xs"
                    onClick={() => setTestImageUrl(url)}
                  >
                    Sample {i + 1}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              onClick={testMaterialAnalysis}
              disabled={testing || !testImageUrl}
              className="w-full"
            >
              {testing ? (
                <>
                  <Activity className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Material Analysis
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 3D Generation Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              3D Generation Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Test Prompt</label>
              <Textarea
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="Describe the interior design you want to generate"
                rows={3}
              />
            </div>

            <Button
              onClick={test3DGeneration}
              disabled={testing || !testPrompt}
              className="w-full"
            >
              {testing ? (
                <>
                  <Activity className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test 3D Generation
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Test Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    {result.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <div>
                      <div className="font-medium">{result.provider}</div>
                      {result.error && (
                        <div className="text-sm text-red-600">{result.error}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {result.success && (
                      <Badge className={result.score >= 0.7 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}>
                        Score: {result.score.toFixed(2)}
                      </Badge>
                    )}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {(result.processing_time_ms / 1000).toFixed(2)}s
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Usage Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>• Use the <strong>Material Analysis Test</strong> to test hybrid OpenAI/Claude material recognition</p>
            <p>• Use the <strong>3D Generation Test</strong> to test interior design generation with prompt parsing</p>
            <p>• Test results will appear in the Admin Panel analytics after completion</p>
            <p>• The system will automatically score responses and choose the best AI provider</p>
          </div>
        </CardContent>
        </Card>
      </div>
    </div>
  );
};
