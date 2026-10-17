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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { Label } from '@/components/core/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { edgeErrorMessage } from '@/utils/edgeError';
import XMLFieldMappingModal from './XMLFieldMappingModal';
import { logger } from '@/services/logger.service';
import { bytesToBase64, type AttributeTarget, type DetectedField } from './xmlFeedEncoding';

interface MaterialCategory {
  id: string;
  category_key: string;
  category_name: string;
  display_name?: string | null;
}

const XMLImportTab: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspaceId: workspaceId } = useWorkspace();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string>('');
  const [sourceType, setSourceType] = useState<'file' | 'url'>('file');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [suggestedMappings, setSuggestedMappings] = useState<Record<string, string>>({});
  const [totalRows, setTotalRows] = useState<number>(0);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xmlBase64, setXmlBase64] = useState<string>('');
  const [attributeTargets, setAttributeTargets] = useState<AttributeTarget[]>([]);
  const [rowPath, setRowPath] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [categories, setCategories] = useState<MaterialCategory[]>([]);

  // The upload category is the fallback material_category for every row the feed does not classify.
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('material_categories')
          .select('id, category_key, name, display_name')
          .eq('is_active', true)
          .order('sort_order');

        if (!categoriesError && categoriesData && categoriesData.length > 0) {
          const formatted = categoriesData.map((cat: any) => ({
            id: cat.id,
            category_key: cat.category_key,
            category_name: cat.name,
            display_name: cat.display_name,
          }));
          setCategories(formatted);
          setCategory(formatted[0].category_key);
        }
      } catch (e) {
        // Non-fatal; the dropdown will show "Loading..." and Detect will be
        // disabled until categories arrive (or the operator picks via Other).
        logger.error('Failed to load material categories', e as Error, {
          service: 'XMLImportTab',
        });
      }
    };

    loadInitialData();
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
    if (!category) {
      setError('Please select a material category before detecting fields');
      return;
    }

    setIsDetecting(true);
    setError(null);

    try {
      let raw: ArrayBuffer;
      if (sourceType === 'file' && selectedFile) {
        raw = await selectedFile.arrayBuffer();
      } else if (sourceType === 'url' && remoteUrl) {
        const response = await fetch(remoteUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch URL: ${response.statusText}`);
        }
        raw = await response.arrayBuffer();
      } else {
        throw new Error('Invalid source configuration');
      }
      const encoded = bytesToBase64(raw);

      // Call Edge Function in preview mode
      const { data, error: functionError } = await supabase.functions.invoke(
        'xml-import-orchestrator',
        {
          body: {
            workspace_id: workspaceId,
            xml_content: encoded,
            category,
            row_path: rowPath.trim() || undefined,
            preview_only: true,
          },
        },
      );

      if (functionError) {
        throw new Error(await edgeErrorMessage(functionError, 'Failed to detect fields'));
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to detect fields');
      }

      setDetectedFields(data.detected_fields || []);
      setSuggestedMappings(data.suggested_mappings || {});
      setTotalRows(data.total_rows || 0);
      setAttributeTargets(data.attribute_targets || []);
      setXmlBase64(encoded);
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
      {/* Material Category — picked once up front for the whole import.
          Mirrors the PDF upload flow. Every product the orchestrator emits
          inherits this value, and the Fill-the-Gaps panel skips the
          material_category gap because it's already known. */}
      <div className="dashboard-card rounded-xl p-5 space-y-2">
        <Label htmlFor="xml-import-category" className="text-sm font-medium">
          Material Category
        </Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="xml-import-category" className="w-full md:max-w-xs">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.length > 0 ? (
              categories.map((cat) => (
                <SelectItem key={cat.category_key} value={cat.category_key}>
                  {cat.display_name || cat.category_name}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="__loading__" disabled>
                Loading categories...
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The category for every row the feed does not classify itself, and the source of the
          fields you can map.
        </p>
        <Label htmlFor="xml-import-row-path" className="text-sm font-medium pt-2 block">
          Row path <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="xml-import-row-path"
          className="w-full md:max-w-xs font-mono"
          placeholder="catalog.products.product"
          value={rowPath}
          onChange={(e) => setRowPath(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to import every product, item or material element in the file.
        </p>
      </div>

      {/* Source Type Tabs */}
      <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as 'file' | 'url')} className="w-full">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="file" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload File
          </TabsTrigger>
          <TabsTrigger value="url" className="flex items-center gap-2">
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
                    Select file
                  </Button>
                )}
              </label>
            </div>

            {selectedFile && !detectedFields.length && (
              <div className="flex justify-end">
                <Button
                  onClick={handleDetectFields}
                  disabled={isDetecting || !category || !workspaceId}
                >
                  {isDetecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing XML Structure...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-2" />
                      Detect Fields & Suggest Mappings
                    </>
                  )}
                </Button>
              </div>
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
                  <label htmlFor="xmlimporttab-xml-file-url" className="text-sm text-muted-foreground mb-2 block font-medium">XML File URL</label>
                  <Input id="xmlimporttab-xml-file-url"
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
                  <div className="flex justify-end">
                    <Button
                      onClick={handleDetectFields}
                      disabled={isDetecting || !category || !workspaceId}
                    >
                      {isDetecting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Analyzing XML Structure...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2" />
                          Detect Fields & Suggest Mappings
                        </>
                      )}
                    </Button>
                  </div>
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
          totalRows={totalRows}
          category={category}
          attributeTargets={attributeTargets}
          xmlBase64={xmlBase64}
          sourceName={selectedFile?.name || 'xml_url_import'}
          sourceUrl={sourceType === 'url' ? remoteUrl : undefined}
          rowPath={rowPath.trim() || undefined}
          onMappingConfirmed={handleMappingConfirmed}
        />
      )}
    </div>
  );
};

export default XMLImportTab;

