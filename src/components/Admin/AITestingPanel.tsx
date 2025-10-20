import React, { useState } from 'react';
import {
  TestTube,
  Brain,
  Sparkles,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Search,
  Image,
  FileText,
  Layers,
  ArrowLeft,
  Home,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BrowserApiIntegrationService } from '@/services/apiGateway/browserApiIntegrationService';

// ✅ Standardized AI Test Response Interface
interface UnifiedAITestResponse {
  success: boolean;
  data?: {
    response: string;
    analysis?: string;
    recommendations?: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    materials?: any[];
    entities?: Array<{
      type: string;
      value: string;
      confidence: number;
    }>;
    confidence?: number;
    processingTime: number;
    testType: string;
    model: string;
  };
  error?: {
    message: string;
    code: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
    apiType: string;
  };
}

// ✅ Response standardization utility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const standardizeAIResponse = (rawResponse: any): UnifiedAITestResponse => {
  // Handle standardized response format
  if (rawResponse.success !== undefined && rawResponse.data) {
    return {
      success: rawResponse.success,
      data: {
        response: rawResponse.data.response || rawResponse.data.content || 'Analysis completed',
        analysis: rawResponse.data.analysis || rawResponse.data.analysis_summary,
        recommendations: rawResponse.data.recommendations || [],
        materials: rawResponse.data.materials || [],
        entities: rawResponse.data.entities || [],
        confidence: rawResponse.data.confidence || rawResponse.data.confidence_score || 0,
        processingTime: rawResponse.data.processingTime || rawResponse.data.processing_time_ms || 0,
        testType: rawResponse.data.testType || 'unknown',
        model: rawResponse.data.model || 'unknown',
      },
      error: rawResponse.error,
      metadata: rawResponse.metadata,
    };
  }

  // Handle legacy CrewAI format
  if (rawResponse.coordinated_result) {
    return {
      success: true,
      data: {
        response: rawResponse.coordinated_result.content || rawResponse.coordinated_result.analysis || 'Analysis completed',
        analysis: rawResponse.coordination_summary,
        recommendations: rawResponse.coordinated_result.recommendations || [],
        materials: rawResponse.coordinated_result.materials || [],
        entities: [],
        confidence: rawResponse.overall_confidence || 0,
        processingTime: rawResponse.total_processing_time_ms || 0,
        testType: 'crewai',
        model: 'multi-agent',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: rawResponse.task_id || crypto.randomUUID(),
        apiType: 'crewai',
      },
    };
  }

  // Handle simple response format
  if (rawResponse.response || rawResponse.data?.response) {
    return {
      success: true,
      data: {
        response: rawResponse.response || rawResponse.data.response,
        analysis: rawResponse.analysis || rawResponse.data.analysis,
        recommendations: [],
        materials: rawResponse.materials || rawResponse.data.materials || [],
        entities: [],
        confidence: 0.8,
        processingTime: rawResponse.processing_time_ms || 0,
        testType: 'simple',
        model: 'unknown',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
        apiType: 'simple',
      },
    };
  }

  // Handle error cases
  return {
    success: false,
    error: {
      message: rawResponse.error_message || rawResponse.error || 'Unknown error',
      code: 'RESPONSE_PARSE_ERROR',
      details: rawResponse,
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID(),
      apiType: 'error',
    },
  };
};

interface TestResult {
  provider: string;
  score: number;
  success: boolean;
  processing_time_ms: number;
  error?: string;
}

interface MultiModalTestResult {
  test_id: string;
  test_type: 'text_analysis' | 'image_analysis' | 'combined_analysis';
  input_data: {
    text?: string;
    image_url?: string;
    combined?: boolean;
  };
  results: {
    entities?: Array<{
      type: string;
      text: string;
      confidence: number;
    }>;
    materials?: Array<{
      name: string;
      confidence: number;
      properties?: Record<string, any>;
    }>;
    analysis_summary?: string;
    confidence_score: number;
  };
  processing_time_ms: number;
  success: boolean;
  error?: string;
}

interface SimilarityTestResult {
  test_id: string;
  query_text: string;
  similarity_threshold: number;
  results: Array<{
    id: string;
    title: string;
    similarity_score: number;
    content_preview: string;
  }>;
  total_results: number;
  processing_time_ms: number;
  success: boolean;
  error?: string;
}

export const AITestingPanel: React.FC = () => {
  const navigate = useNavigate();
  const [testPrompt, setTestPrompt] = useState('Analyze this modern kitchen with marble countertops and stainless steel appliances');
  const [testImageUrl, setTestImageUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);

  // Multi-modal testing state
  const [multiModalTestText, setMultiModalTestText] = useState('Sustainable bamboo flooring with natural wood grain texture');
  const [multiModalTestImage, setMultiModalTestImage] = useState('');
  const [multiModalResults, setMultiModalResults] = useState<MultiModalTestResult[]>([]);
  const [multiModalTesting, setMultiModalTesting] = useState(false);

  // Similarity search testing state
  const [similarityQuery, setSimilarityQuery] = useState('waterproof ceramic tiles');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);
  const [similarityResults, setSimilarityResults] = useState<SimilarityTestResult | null>(null);
  const [similarityTesting, setSimilarityTesting] = useState(false);

  const { toast } = useToast();

  // Multi-modal analysis testing function
  const testMultiModalAnalysis = async (testType: 'text_analysis' | 'image_analysis' | 'combined_analysis') => {
    if (testType === 'image_analysis' && !multiModalTestImage.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide an image URL for image analysis test',
        variant: 'destructive',
      });
      return;
    }

    if (testType === 'text_analysis' && !multiModalTestText.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide text for text analysis test',
        variant: 'destructive',
      });
      return;
    }

    if (testType === 'combined_analysis' && (!multiModalTestText.trim() || !multiModalTestImage.trim())) {
      toast({
        title: 'Error',
        description: 'Please provide both text and image for combined analysis test',
        variant: 'destructive',
      });
      return;
    }

    setMultiModalTesting(true);

    try {
      const apiService = BrowserApiIntegrationService.getInstance();

      // Prepare payload based on test type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        test_type: testType,
        include_entities: true,
        include_materials: true,
        confidence_threshold: 0.6,
      };

      if (testType === 'text_analysis' || testType === 'combined_analysis') {
        payload.text_content = multiModalTestText;
      }

      if (testType === 'image_analysis' || testType === 'combined_analysis') {
        payload.image_url = multiModalTestImage;
      }

      // Call multi-modal analysis endpoint
      const result = await apiService.callSupabaseFunction('mivaa-gateway', {
        action: 'multimodal_analysis',
        payload: payload,
      });

      // ✅ Use standardized response handler
      const standardizedResponse = standardizeAIResponse(result);

      if (!standardizedResponse.success) {
        throw new Error(`Multi-modal analysis failed: ${standardizedResponse.error?.message || 'Unknown error'}`);
      }

      const data = standardizedResponse.data!;

      // Create test result with standardized data
      const testResult: MultiModalTestResult = {
        test_id: crypto.randomUUID(),
        test_type: testType,
        input_data: {
          text: testType !== 'image_analysis' ? multiModalTestText : undefined,
          image_url: testType !== 'text_analysis' ? multiModalTestImage : undefined,
          combined: testType === 'combined_analysis',
        },
        results: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          entities: (data.entities || []).map((entity: any) => ({
            type: entity.type || 'unknown',
            text: entity.text || entity.value || 'unknown',
            confidence: entity.confidence || 0.8,
          })),
          materials: data.materials || [],
          analysis_summary: data.response || data.analysis || 'Analysis completed successfully',
          confidence_score: data.confidence || 0.8,
        },
        processing_time_ms: data.processingTime || 0,
        success: true,
      };

      setMultiModalResults(prev => [...prev, testResult]);

      toast({
        title: 'Multi-Modal Test Completed',
        description: `${testType.replace('_', ' ')} completed with confidence: ${(testResult.results.confidence_score * 100).toFixed(1)}%`,
        variant: 'default',
      });

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Multi-modal test error:', error);

      const errorResult: MultiModalTestResult = {
        test_id: crypto.randomUUID(),
        test_type: testType,
        input_data: {
          text: testType !== 'image_analysis' ? multiModalTestText : undefined,
          image_url: testType !== 'text_analysis' ? multiModalTestImage : undefined,
          combined: testType === 'combined_analysis',
        },
        results: {
          confidence_score: 0,
        },
        processing_time_ms: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      setMultiModalResults(prev => [...prev, errorResult]);

      toast({
        title: 'Multi-Modal Test Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setMultiModalTesting(false);
    }
  };

  // Similarity search testing function
  const testSimilaritySearch = async () => {
    if (!similarityQuery.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a search query for similarity testing',
        variant: 'destructive',
      });
      return;
    }

    setSimilarityTesting(true);

    try {
      const apiService = BrowserApiIntegrationService.getInstance();

      const result = await apiService.callSupabaseFunction('mivaa-gateway', {
        action: 'vector_similarity_search',
        payload: {
          query_text: similarityQuery,
          similarity_threshold: similarityThreshold,
          limit: 10,
          include_metadata: true,
          search_type: 'semantic',
        },
      });

      if (!result.success) {
        throw new Error(`Similarity search failed: ${result.error?.message || 'Unknown error'}`);
      }

      const data = result.data;

      const testResult: SimilarityTestResult = {
        test_id: crypto.randomUUID(),
        query_text: similarityQuery,
        similarity_threshold: similarityThreshold,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        results: (data.results || []).map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          title: item.title || item.name || 'Untitled',
          similarity_score: item.similarity_score || 0,
          content_preview: (item.content || item.description || '').substring(0, 100) + '...',
        })),
        total_results: data.total_results || 0,
        processing_time_ms: data.processing_time_ms || 0,
        success: true,
      };

      setSimilarityResults(testResult);

      toast({
        title: 'Similarity Search Test Completed',
        description: `Found ${testResult.total_results} results in ${(testResult.processing_time_ms / 1000).toFixed(2)}s`,
        variant: 'default',
      });

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Similarity search test error:', error);

      const errorResult: SimilarityTestResult = {
        test_id: crypto.randomUUID(),
        query_text: similarityQuery,
        similarity_threshold: similarityThreshold,
        results: [],
        total_results: 0,
        processing_time_ms: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      setSimilarityResults(errorResult);

      toast({
        title: 'Similarity Search Test Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setSimilarityTesting(false);
    }
  };

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
      // eslint-disable-next-line no-console
      console.log('Test file cleanup skipped (uploaded_files table not in schema):', testFile.id);

      toast({
        title: 'Test Completed',
        description: `Analysis completed with score: ${(data as any).final_score?.toFixed(2) || 'N/A'}`,
        variant: 'default',
      });

    } catch (error) {
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
        <Tabs defaultValue="legacy" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="legacy">Legacy Tests</TabsTrigger>
            <TabsTrigger value="multimodal">Multi-Modal Analysis</TabsTrigger>
            <TabsTrigger value="similarity">Similarity Search</TabsTrigger>
            <TabsTrigger value="results">Test Results</TabsTrigger>
          </TabsList>

          {/* Legacy Testing Tab */}
          <TabsContent value="legacy" className="space-y-6">
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
              <Sparkles className="h-5 w-5" />
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
                <CardTitle>Legacy Test Instructions</CardTitle>
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
          </TabsContent>

          {/* Multi-Modal Analysis Tab */}
          <TabsContent value="multimodal" className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Text Analysis Test */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Text Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Test Text</label>
                    <Textarea
                      value={multiModalTestText}
                      onChange={(e) => setMultiModalTestText(e.target.value)}
                      placeholder="Enter material description or specification text..."
                      rows={4}
                    />
                  </div>
                  <Button
                    onClick={() => testMultiModalAnalysis('text_analysis')}
                    disabled={multiModalTesting || !multiModalTestText.trim()}
                    className="w-full"
                  >
                    {multiModalTesting ? (
                      <>
                        <Activity className="h-4 w-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Test Text Analysis
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Image Analysis Test */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Image className="h-5 w-5" />
                    Image Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Test Image URL</label>
                    <Input
                      value={multiModalTestImage}
                      onChange={(e) => setMultiModalTestImage(e.target.value)}
                      placeholder="https://example.com/material-image.jpg"
                    />
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-2">Sample URLs:</p>
                      {getSampleImageUrls().slice(0, 2).map((url, i) => (
                        <Button
                          key={i}
                          className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50 mr-2 mb-1 text-xs"
                          onClick={() => setMultiModalTestImage(url)}
                        >
                          Sample {i + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={() => testMultiModalAnalysis('image_analysis')}
                    disabled={multiModalTesting || !multiModalTestImage.trim()}
                    className="w-full"
                  >
                    {multiModalTesting ? (
                      <>
                        <Activity className="h-4 w-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Image className="h-4 w-4 mr-2" />
                        Test Image Analysis
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Combined Analysis Test */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    Combined Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Uses both text and image inputs for comprehensive multi-modal analysis.
                  </div>
                  <Button
                    onClick={() => testMultiModalAnalysis('combined_analysis')}
                    disabled={multiModalTesting || !multiModalTestText.trim() || !multiModalTestImage.trim()}
                    className="w-full"
                  >
                    {multiModalTesting ? (
                      <>
                        <Activity className="h-4 w-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Layers className="h-4 w-4 mr-2" />
                        Test Combined Analysis
                      </>
                    )}
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Requires both text and image inputs to be filled.
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Multi-Modal Results */}
            {multiModalResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Multi-Modal Test Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {multiModalResults.map((result, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {result.success ? (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-600" />
                            )}
                            <div>
                              <div className="font-medium capitalize">
                                {result.test_type.replace('_', ' ')}
                              </div>
                              {result.error && (
                                <div className="text-sm text-red-600">{result.error}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {result.success && (
                              <Badge className={result.results.confidence_score >= 0.7 ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white'}>
                                Confidence: {(result.results.confidence_score * 100).toFixed(1)}%
                              </Badge>
                            )}
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {(result.processing_time_ms / 1000).toFixed(2)}s
                            </div>
                          </div>
                        </div>

                        {result.success && (
                          <div className="space-y-3">
                            {result.results.analysis_summary && (
                              <div>
                                <div className="text-sm font-medium mb-1">Analysis Summary:</div>
                                <div className="text-sm text-muted-foreground">{result.results.analysis_summary}</div>
                              </div>
                            )}

                            {result.results.entities && result.results.entities.length > 0 && (
                              <div>
                                <div className="text-sm font-medium mb-2">Extracted Entities:</div>
                                <div className="flex flex-wrap gap-1">
                                  {result.results.entities.slice(0, 5).map((entity, i) => (
                                    <Badge key={i} variant="outline" className="text-xs">
                                      {entity.text} ({(entity.confidence * 100).toFixed(0)}%)
                                    </Badge>
                                  ))}
                                  {result.results.entities.length > 5 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{result.results.entities.length - 5} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}

                            {result.results.materials && result.results.materials.length > 0 && (
                              <div>
                                <div className="text-sm font-medium mb-2">Detected Materials:</div>
                                <div className="flex flex-wrap gap-1">
                                  {result.results.materials.slice(0, 3).map((material, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {material.name} ({(material.confidence * 100).toFixed(0)}%)
                                    </Badge>
                                  ))}
                                  {result.results.materials.length > 3 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{result.results.materials.length - 3} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Similarity Search Tab */}
          <TabsContent value="similarity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Vector Similarity Search Test
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Search Query</label>
                  <Input
                    value={similarityQuery}
                    onChange={(e) => setSimilarityQuery(e.target.value)}
                    placeholder="Enter search query (e.g., 'waterproof ceramic tiles')"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Similarity Threshold</label>
                  <div className="flex items-center gap-4 mt-2">
                    <input
                      type="range"
                      min="0.5"
                      max="0.95"
                      step="0.05"
                      value={similarityThreshold}
                      onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono w-12">
                      {(similarityThreshold * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Higher threshold = more precise results, Lower threshold = broader results
                  </div>
                </div>

                <Button
                  onClick={testSimilaritySearch}
                  disabled={similarityTesting || !similarityQuery.trim()}
                  className="w-full"
                >
                  {similarityTesting ? (
                    <>
                      <Activity className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Test Similarity Search
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Similarity Search Results */}
            {similarityResults && (
              <Card>
                <CardHeader>
                  <CardTitle>Similarity Search Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded">
                      <div className="flex items-center gap-3">
                        {similarityResults.success ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                        <div>
                          <div className="font-medium">
                            Query: "{similarityResults.query_text}"
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Threshold: {(similarityResults.similarity_threshold * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge>
                          {similarityResults.total_results} results
                        </Badge>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {(similarityResults.processing_time_ms / 1000).toFixed(2)}s
                        </div>
                      </div>
                    </div>

                    {similarityResults.success && similarityResults.results.length > 0 && (
                      <div className="space-y-2">
                        {similarityResults.results.map((result, index) => (
                          <div key={index} className="border rounded p-3">
                            <div className="flex items-start justify-between mb-2">
                              <div className="font-medium">{result.title}</div>
                              <Badge
                                className={result.similarity_score >= 0.8 ? 'bg-green-600 text-white' :
                                          result.similarity_score >= 0.6 ? 'bg-yellow-600 text-white' :
                                          'bg-gray-600 text-white'}
                              >
                                {(result.similarity_score * 100).toFixed(1)}%
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {result.content_preview}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {similarityResults.error && (
                      <div className="text-sm text-red-600 p-3 bg-red-50 rounded">
                        Error: {similarityResults.error}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Combined Results Tab */}
          <TabsContent value="results" className="space-y-6">
            <div className="grid gap-6">
              {/* Legacy Test Results */}
              {results.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Legacy Test Results</CardTitle>
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

              {/* Summary Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle>Test Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded">
                      <div className="text-2xl font-bold text-blue-600">{results.length}</div>
                      <div className="text-sm text-muted-foreground">Legacy Tests</div>
                    </div>
                    <div className="text-center p-4 border rounded">
                      <div className="text-2xl font-bold text-green-600">{multiModalResults.length}</div>
                      <div className="text-sm text-muted-foreground">Multi-Modal Tests</div>
                    </div>
                    <div className="text-center p-4 border rounded">
                      <div className="text-2xl font-bold text-purple-600">{similarityResults ? 1 : 0}</div>
                      <div className="text-sm text-muted-foreground">Similarity Tests</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
