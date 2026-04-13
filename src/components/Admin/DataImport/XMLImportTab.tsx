/**
 * XML Import Tab
 *
 * Handles XML file upload, field detection, AI-assisted mapping, and import job creation
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, Link } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import { Input } from '@/components/core/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import XMLFieldMappingModal from './XMLFieldMappingModal';
import { logger } from '@/services/logger.service';

interface DetectedField {
  xml_field: string;
  sample_values: string[];
  suggested_mapping: string;
  confidence: number;
  data_type: string;
}

const XMLImportTab: React.FC = () => {
  const navigate = useNavigate();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string>('');
  const [sourceType, setSourceType] = useState<'file' | 'url'>('file');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [suggestedMappings, setSuggestedMappings] = useState<Record<string, string>>({});
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xmlContentCache, setXmlContentCache] = useState<string>(''); // Cache XML content for URL sources

  // Load workspace ID on mount
  useEffect(() => {
    const loadWorkspace = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (workspaceData) {
        setWorkspaceId(workspaceData.workspace_id);
      }
    };

    loadWorkspace();
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.xml')) {
        setError('Please select an XML file');
        return;
      }
      setSelectedFile(file);
      setError(null);
      setDetectedFields([]);
      setSuggestedMappings({});
    }
  };

  const handleDetectFields = async () => {
    if (!workspaceId) return;

    // Validate input based on source type
    if (sourceType === 'file' && !selectedFile) {
      setError('Please select an XML file');
      return;
    }
    if (sourceType === 'url' && !remoteUrl) {
      setError('Please enter a URL');
      return;
    }

    setIsDetecting(true);
    setError(null);

    try {
      let xmlText: string;

      // Fetch XML content based on source type
      if (sourceType === 'file' && selectedFile) {
        xmlText = await selectedFile.text();
      } else if (sourceType === 'url' && remoteUrl) {
        const response = await fetch(remoteUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch URL: ${response.statusText}`);
        }
        xmlText = await response.text();
      } else {
        throw new Error('Invalid source configuration');
      }

      // Encode to base64 (UTF-8 safe)
      // btoa() only supports Latin1, so we need to use TextEncoder for UTF-8
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(xmlText);
      const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
      const xmlBase64 = btoa(binaryString);

      // Call Edge Function in preview mode
      const { data, error: functionError } = await supabase.functions.invoke(
        'xml-import-orchestrator',
        {
          body: {
            workspace_id: workspaceId,
            xml_content: xmlBase64,
            source_url: sourceType === 'url' ? remoteUrl : undefined,
            preview_only: true, // Trigger field detection mode
          },
        },
      );

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to detect fields');
      }

      setDetectedFields(data.detected_fields || []);
      setSuggestedMappings(data.suggested_mappings || {});
      setXmlContentCache(xmlText); // Cache the XML content for later use
      setShowMappingModal(true);
    } catch (err: any) {
      console.error('Error detecting fields:', err);

      // Log to internal logger with full context
      logger.error('XML field detection failed', err, {
        service: 'XMLImportTab',
        sourceType,
        hasFile: !!selectedFile,
        hasUrl: !!remoteUrl,
        errorMessage: err?.message,
        errorStack: err?.stack,
      });

      setError(err.message || 'Failed to detect XML fields');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleMappingConfirmed = (jobId?: string) => {
    setShowMappingModal(false);

    // Redirect to async queue monitor if job ID is provided
    if (jobId) {
      console.log('🎯 XMLImportTab: Import started, redirecting to queue monitor', { jobId });
      navigate(`/admin/async-queue-monitor?jobId=${jobId}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Source Type Tabs */}
      <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as 'file' | 'url')} className="w-full">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="file" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Upload className="h-4 w-4" />
            Upload File
          </TabsTrigger>
          <TabsTrigger value="url" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Link className="h-4 w-4" />
            Remote URL
          </TabsTrigger>
        </TabsList>

        {/* File Upload Tab */}
        <TabsContent value="file" className="mt-4">
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-muted-foreground/40 transition-colors bg-card/50">
              <input
                type="file"
                accept=".xml"
                onChange={handleFileSelect}
                className="hidden"
                id="xml-file-input"
              />
              <label
                htmlFor="xml-file-input"
                className="cursor-pointer flex flex-col items-center gap-4"
              >
                <div className="p-4 bg-primary/10 rounded-full">
                  <FileText className="h-12 w-12 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground mb-1">
                    {selectedFile ? selectedFile.name : 'Choose XML File'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(2)} KB`
                      : 'Click to browse or drag and drop'}
                  </p>
                </div>
                {!selectedFile && (
                  <Button variant="outline" className="mt-2">
                    <Upload className="h-4 w-4 mr-2" />
                    Select File
                  </Button>
                )}
              </label>
            </div>

            {selectedFile && !detectedFields.length && (
              <Button
                onClick={handleDetectFields}
                disabled={isDetecting}
                size="lg"
                className="w-full"
              >
                {isDetecting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Analyzing XML Structure...
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5 mr-2" />
                    Detect Fields & Suggest Mappings
                  </>
                )}
              </Button>
            )}
          </div>
        </TabsContent>

        {/* URL Input Tab */}
        <TabsContent value="url" className="mt-4">
          <div className="border-2 border-dashed border-border rounded-xl p-8 bg-card/50">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-primary/10 rounded-full">
                <Link className="h-12 w-12 text-primary" />
              </div>
              <div className="w-full max-w-xl space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block font-medium">XML File URL</label>
                  <Input
                    type="url"
                    placeholder="https://example.com/products.xml"
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter the direct URL to an XML file (must be publicly accessible)
                  </p>
                </div>

                {remoteUrl && !detectedFields.length && (
                  <Button
                    onClick={handleDetectFields}
                    disabled={isDetecting}
                    size="lg"
                    className="w-full"
                  >
                    {isDetecting ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Analyzing XML Structure...
                      </>
                    ) : (
                      <>
                        <FileText className="h-5 w-5 mr-2" />
                        Detect Fields & Suggest Mappings
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Fields Detected - Show Summary */}
      {detectedFields.length > 0 && !showMappingModal && (
        <div className="space-y-4">
          <Alert className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success-bg))]">
            <CheckCircle className="h-4 w-4 text-success" />
            <AlertDescription>
              Detected <strong>{detectedFields.length} fields</strong> with AI-suggested mappings
              <br />
              <Button
                variant="link"
                className="text-success hover:text-success/80 p-0 h-auto"
                onClick={() => setShowMappingModal(true)}
              >
                Click here to review and confirm mappings
              </Button>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4">
            <div className="dashboard-card rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Total Fields</p>
              <p className="text-2xl font-bold text-foreground">{detectedFields.length}</p>
            </div>
            <div className="dashboard-card rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">High Confidence</p>
              <p className="text-2xl font-bold text-success">
                {detectedFields.filter((f) => f.confidence >= 0.9).length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Field Mapping Modal */}
      {showMappingModal && (
        <XMLFieldMappingModal
          isOpen={showMappingModal}
          onClose={() => setShowMappingModal(false)}
          detectedFields={detectedFields}
          suggestedMappings={suggestedMappings}
          xmlFile={selectedFile}
          xmlContent={xmlContentCache}
          onMappingConfirmed={handleMappingConfirmed}
        />
      )}
    </div>
  );
};

export default XMLImportTab;

