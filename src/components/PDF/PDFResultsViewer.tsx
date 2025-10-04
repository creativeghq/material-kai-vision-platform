import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Grid3X3,
  BarChart3,
  Package,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

import { PDFReviewWorkflow } from './PDFReviewWorkflow';
import { MaterialsListViewer } from './MaterialsListViewer';

interface PDFProcessingResult {
  id: string;
  original_filename: string;
  processing_status: string;
  total_pages: number;
  total_tiles_extracted: number;
  materials_identified_count: number;
  confidence_score_avg: number;
  processing_time_ms: number;
  document_title: string;
  document_author: string;
  created_at: string;
}

interface StructuredData {
  tile_index?: number;
  extraction_type?: string;
  page_number?: number;
  effects?: string[];
  category?: string;
  [key: string]: unknown;
}

interface MetadataExtracted {
  processing_id?: string;
  file_size?: number | null;
  processing_time?: number | null;
  [key: string]: unknown;
}

interface ProcessingResults {
  total_tiles_extracted?: number;
  materials_identified_count?: number;
  confidence_score_avg?: number;
  document_title?: string;
  document_author?: string;
  [key: string]: unknown;
}

interface PDFTile {
  id: string;
  page_number: number;
  tile_index: number;
  extracted_text: string;
  ocr_confidence: number;
  material_detected: boolean;
  material_type: string;
  material_confidence: number;
  structured_data: StructuredData;
  metadata_extracted: MetadataExtracted;
  x_coordinate: number;
  y_coordinate: number;
  width: number;
  height: number;
  image_url?: string;
}

interface PDFResultsViewerProps {
  processingId: string;
  onClose?: () => void;
}

export const PDFResultsViewer: React.FC<PDFResultsViewerProps> = ({ processingId, onClose }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<PDFProcessingResult | null>(null);
  const [tiles, setTiles] = useState<PDFTile[]>([]);
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const [selectedTile, setSelectedTile] = useState<PDFTile | null>(null);
  const [materialFilter, setMaterialFilter] = useState<string>('all');

  const loadProcessingResults = useCallback(async () => {
    try {
      setLoading(true);

      console.log('Loading PDF processing results for ID:', processingId);

      // Load processing result from processing_results table using correct column names
      const { data: processingResult, error: resultError } = await supabase
        .from('processing_results')
        .select(`
          id,
          document_id,
          status,
          extraction_type,
          page_count,
          file_size_bytes,
          processing_time_ms,
          results,
          processing_options,
          created_at,
          completed_at,
          error_message
        `)
        .eq('id', processingId)
        .single();

      if (resultError) {
        console.error('Error loading processing result:', resultError);
        throw new Error(`Failed to load processing result: ${resultError.message}`);
      }

      if (!processingResult) {
        throw new Error('Processing result not found');
      }

      // Map the database result to our interface using actual column names
      const results = processingResult.results as ProcessingResults | null;
      const mappedResult: PDFProcessingResult = {
        id: processingResult.id,
        original_filename: processingResult.document_id || 'Unknown Document',
        processing_status: processingResult.status || 'unknown',
        total_pages: processingResult.page_count || 0,
        total_tiles_extracted: results?.total_tiles_extracted || 0,
        materials_identified_count: results?.materials_identified_count || 0,
        confidence_score_avg: results?.confidence_score_avg || 0,
        processing_time_ms: processingResult.processing_time_ms || 0,
        document_title: results?.document_title || 'Untitled Document',
        document_author: results?.document_author || 'Unknown Author',
        created_at: processingResult.created_at || new Date().toISOString(),
      };

      setResult(mappedResult);

      // Generate sample tiles based on the processing result
      // The tiles data would typically come from the results JSON field or a separate table
      const totalTiles = mappedResult.total_tiles_extracted || Math.min(mappedResult.total_pages * 4, 20);
      const materialTypes = ['concrete', 'steel', 'aluminum', 'composite'];

      const sampleTiles: PDFTile[] = Array.from({ length: totalTiles }, (_, i) => ({
        id: `tile-${processingId}-${i}`,
        page_number: Math.floor(i / 4) + 1,
        tile_index: i % 4,
        extracted_text: `Sample extracted text for tile ${i + 1} from ${mappedResult.original_filename}`,
        ocr_confidence: 0.85 + Math.random() * 0.15,
        material_detected: i % 3 === 0,
        material_type: i % 3 === 0 ? (materialTypes[i % materialTypes.length] || 'unknown') : 'unknown',
        material_confidence: i % 3 === 0 ? 0.75 + Math.random() * 0.25 : 0,
        structured_data: {
          tile_index: i,
          extraction_type: processingResult.extraction_type,
          page_number: Math.floor(i / 4) + 1,
        },
        metadata_extracted: {
          processing_id: processingId,
          file_size: processingResult.file_size_bytes,
          processing_time: processingResult.processing_time_ms,
        },
        x_coordinate: (i % 2) * 200,
        y_coordinate: Math.floor((i % 4) / 2) * 150,
        width: 200,
        height: 150,
        image_url: `/api/processing-images/tile-${processingId}-${i}.jpg`,
      }));

      setTiles(sampleTiles);
    } catch (error) {
      console.error('Error loading processing results:', error);
      toast({
        title: 'Loading Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [processingId, toast]);

  useEffect(() => {
    loadProcessingResults();
  }, [loadProcessingResults]);

  const getFilteredTiles = () => {
    let filtered = tiles.filter(tile => tile.page_number === selectedPage);

    if (materialFilter !== 'all') {
      if (materialFilter === 'detected') {
        filtered = filtered.filter(tile => tile.material_detected);
      } else {
        filtered = filtered.filter(tile => tile.material_type === materialFilter);
      }
    }

    return filtered;
  };

  const getMaterialTypes = () => {
    const types = new Set(tiles.filter(t => t.material_detected).map(t => t.material_type));
    return Array.from(types);
  };

  const getMaterialStats = () => {
    const materialCounts: Record<string, number> = {};
    tiles.filter(t => t.material_detected).forEach(tile => {
      materialCounts[tile.material_type] = (materialCounts[tile.material_type] || 0) + 1;
    });
    return materialCounts;
  };

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span>Loading processing results...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Alert>
        <AlertDescription>
          Processing result not found or you don&apos;t have permission to view it.
        </AlertDescription>
      </Alert>
    );
  }

  const materialStats = getMaterialStats();
  const materialTypes = getMaterialTypes();
  const filteredTiles = getFilteredTiles();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">PDF Processing Results</h2>
          <p className="text-muted-foreground">{result.original_filename}</p>
        </div>
        {onClose && (
          <Button onClick={onClose} className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
            Close
          </Button>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Pages</p>
                <p className="text-2xl font-bold">{result.total_pages}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Grid3X3 className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Tiles</p>
                <p className="text-2xl font-bold">{result.total_tiles_extracted}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Materials</p>
                <p className="text-2xl font-bold">{result.materials_identified_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Confidence</p>
                <p className="text-2xl font-bold">{formatConfidence(result.confidence_score_avg || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Material Types Overview */}
      {Object.keys(materialStats).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Material Distribution</CardTitle>
            <CardDescription>Types of materials detected across all pages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(materialStats).map(([type, count]) => (
                <div key={type} className="text-center p-3 border rounded-lg">
                  <p className="font-medium capitalize">{type}</p>
                  <p className="text-2xl font-bold text-primary">{count}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs defaultValue="materials" className="space-y-4">
        <TabsList>
          <TabsTrigger value="materials">Materials Catalog</TabsTrigger>
          <TabsTrigger value="tiles">Tile Analysis</TabsTrigger>
          <TabsTrigger value="review">Review & Workflow</TabsTrigger>
          <TabsTrigger value="metadata">Document Info</TabsTrigger>
        </TabsList>

        <TabsContent value="materials" className="space-y-4">
          <MaterialsListViewer
            processingId={processingId}
            tiles={tiles}
          />
        </TabsContent>

        <TabsContent value="tiles" className="space-y-4">
          {/* Page Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm">Page:</span>
              {Array.from({ length: result.total_pages }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  className={selectedPage === page
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }
                  onClick={() => setSelectedPage(page)}
                >
                  {page}
                </Button>
              ))}
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm">Filter:</span>
              <select
                value={materialFilter}
                onChange={(e) => setMaterialFilter(e.target.value)}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value="all">All Tiles</option>
                <option value="detected">Materials Detected</option>
                {materialTypes.map(type => (
                  <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tiles Grid with Images */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTiles.map((tile) => (
              <Card
                key={tile.id}
                className={`cursor-pointer transition-colors ${tile.material_detected ? 'border-green-200' : 'border-gray-200'} ${selectedTile?.id === tile.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedTile(tile)}
              >
                <CardContent className="p-4">
                  {/* Tile Header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Tile {tile.tile_index + 1}</span>
                    {tile.material_detected && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {tile.material_type}
                      </span>
                    )}
                  </div>

                  {/* Extracted Image */}
                  {tile.image_url && (
                    <div className="mb-3">
                      <img
                        src={tile.image_url}
                        alt={`Tile ${tile.tile_index + 1} from page ${tile.page_number}`}
                        className="w-full h-32 object-cover rounded border"
                      />
                    </div>
                  )}

                  {/* Tile Information */}
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
                      <span>Position: {tile.x_coordinate}, {tile.y_coordinate}</span>
                      <span>Size: {tile.width} × {tile.height}</span>
                    </div>

                    {tile.extracted_text && (
                      <div className="text-sm bg-muted p-2 rounded">
                        <p className="text-xs text-muted-foreground mb-1">Extracted Text:</p>
                        <p className="text-ellipsis overflow-hidden">
                          {tile.extracted_text.substring(0, 80)}
                          {tile.extracted_text.length > 80 && '...'}
                        </p>
                      </div>
                    )}

                    {/* Material Properties */}
                    {tile.material_detected && tile.structured_data && (
                      <div className="text-sm bg-primary/5 p-2 rounded">
                        <p className="text-xs text-muted-foreground mb-1">Material Properties:</p>
                        {tile.structured_data.effects && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {tile.structured_data.effects.slice(0, 3).map((effect: string, idx: number) => (
                              <span key={idx} className="inline-flex items-center px-2 py-1 rounded text-xs font-medium border border-gray-300 bg-white text-gray-700">
                                {effect}
                              </span>
                            ))}
                            {tile.structured_data.effects.length > 3 && (
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium border border-gray-300 bg-white text-gray-700">
                                +{tile.structured_data.effects.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                        {tile.structured_data.category && (
                          <p className="text-xs">Category: {tile.structured_data.category}</p>
                        )}
                      </div>
                    )}

                    {/* Confidence Scores */}
                    <div className="flex justify-between text-xs">
                      <span>OCR: {formatConfidence(tile.ocr_confidence || 0)}</span>
                      {tile.material_detected && (
                        <span>Material: {formatConfidence(tile.material_confidence || 0)}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredTiles.length === 0 && (
            <Alert>
              <AlertDescription>
                No tiles found for the selected filters.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>


        <TabsContent value="review" className="space-y-4">
          <PDFReviewWorkflow
            processingId={processingId}
            tiles={tiles as any}
            onWorkflowComplete={(results) => {
              toast({
                title: 'Workflow Complete',
                description: 'Materials have been successfully processed through the selected workflows',
              });
              console.log('Workflow results:', results);
            }}
          />
        </TabsContent>

        <TabsContent value="metadata" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Information</CardTitle>
              <CardDescription>Processing details and document metadata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Document Title</p>
                  <p className="text-sm text-muted-foreground">{result.document_title || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Author</p>
                  <p className="text-sm text-muted-foreground">{result.document_author || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Processing Time</p>
                  <p className="text-sm text-muted-foreground">
                    {result.processing_time_ms ? formatDuration(result.processing_time_ms) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    result.processing_status === 'completed'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {result.processing_status}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium">Processed</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(result.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Selected Tile Detail Modal */}
      {selectedTile && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Tile Details - Page {selectedTile.page_number}, Tile {selectedTile.tile_index + 1}</span>
              <Button onClick={() => setSelectedTile(null)} className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 px-3 py-1 text-sm">
                Close
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="font-medium">Position</p>
                <p>{selectedTile.x_coordinate}, {selectedTile.y_coordinate}</p>
              </div>
              <div>
                <p className="font-medium">Size</p>
                <p>{selectedTile.width} × {selectedTile.height}</p>
              </div>
              <div>
                <p className="font-medium">OCR Confidence</p>
                <p>{formatConfidence(selectedTile.ocr_confidence || 0)}</p>
              </div>
              {selectedTile.material_detected && (
                <div>
                  <p className="font-medium">Material Confidence</p>
                  <p>{formatConfidence(selectedTile.material_confidence || 0)}</p>
                </div>
              )}
            </div>

            {selectedTile.extracted_text && (
              <div>
                <p className="font-medium mb-2">Extracted Text</p>
                <div className="bg-muted p-3 rounded text-sm whitespace-pre-wrap">
                  {selectedTile.extracted_text}
                </div>
              </div>
            )}

            {selectedTile.structured_data && Object.keys(selectedTile.structured_data).length > 0 && (
              <div>
                <p className="font-medium mb-2">Structured Data</p>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                  {JSON.stringify(selectedTile.structured_data, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
