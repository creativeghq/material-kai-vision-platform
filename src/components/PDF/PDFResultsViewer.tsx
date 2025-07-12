import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileText, 
  Grid3X3, 
  Eye, 
  Download, 
  Search, 
  BarChart3,
  Package,
  Layers,
  Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PDFReviewWorkflow } from './PDFReviewWorkflow';

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

interface PDFTile {
  id: string;
  page_number: number;
  tile_index: number;
  extracted_text: string;
  ocr_confidence: number;
  material_detected: boolean;
  material_type: string;
  material_confidence: number;
  structured_data: any;
  metadata_extracted: any;
  x_coordinate: number;
  y_coordinate: number;
  width: number;
  height: number;
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

  useEffect(() => {
    loadProcessingResults();
  }, [processingId]);

  const loadProcessingResults = async () => {
    try {
      setLoading(true);

      // Load processing result
      const { data: resultData, error: resultError } = await supabase
        .from('pdf_processing_results')
        .select('*')
        .eq('id', processingId)
        .single();

      if (resultError) {
        throw new Error(`Failed to load processing result: ${resultError.message}`);
      }

      setResult(resultData);

      // Load tiles
      const { data: tilesData, error: tilesError } = await supabase
        .from('pdf_processing_tiles')
        .select('*')
        .eq('pdf_processing_id', processingId)
        .order('page_number', { ascending: true })
        .order('tile_index', { ascending: true });

      if (tilesError) {
        throw new Error(`Failed to load tiles: ${tilesError.message}`);
      }

      setTiles(tilesData || []);
    } catch (error) {
      console.error('Error loading processing results:', error);
      toast({
        title: "Loading Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
          Processing result not found or you don't have permission to view it.
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
          <Button variant="outline" onClick={onClose}>
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
      <Tabs defaultValue="tiles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tiles">Tile Analysis</TabsTrigger>
          <TabsTrigger value="materials">Material Details</TabsTrigger>
          <TabsTrigger value="review">Review & Workflow</TabsTrigger>
          <TabsTrigger value="metadata">Document Info</TabsTrigger>
        </TabsList>

        <TabsContent value="tiles" className="space-y-4">
          {/* Page Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm">Page:</span>
              {Array.from({ length: result.total_pages }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={selectedPage === page ? "default" : "outline"}
                  size="sm"
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

          {/* Tiles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTiles.map((tile) => (
              <Card 
                key={tile.id} 
                className={`cursor-pointer transition-colors ${tile.material_detected ? 'border-green-200' : 'border-gray-200'} ${selectedTile?.id === tile.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedTile(tile)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Tile {tile.tile_index + 1}</span>
                    {tile.material_detected && (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        {tile.material_type}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      Position: {tile.x_coordinate}, {tile.y_coordinate}
                    </div>
                    
                    {tile.extracted_text && (
                      <div className="text-sm bg-muted p-2 rounded text-ellipsis overflow-hidden">
                        {tile.extracted_text.substring(0, 100)}
                        {tile.extracted_text.length > 100 && '...'}
                      </div>
                    )}
                    
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

        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Detected Materials</CardTitle>
              <CardDescription>Detailed analysis of materials found in the document</CardDescription>
            </CardHeader>
            <CardContent>
              {tiles.filter(t => t.material_detected).length === 0 ? (
                <Alert>
                  <AlertDescription>No materials were detected in this document.</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-4">
                  {tiles.filter(t => t.material_detected).map((tile) => (
                    <div key={tile.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">Page {tile.page_number}</Badge>
                          <Badge variant="outline">Tile {tile.tile_index + 1}</Badge>
                          <Badge className="bg-green-100 text-green-800">{tile.material_type}</Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatConfidence(tile.material_confidence || 0)} confidence
                        </span>
                      </div>
                      
                      {tile.extracted_text && (
                        <div className="mb-3">
                          <p className="text-sm font-medium mb-1">Extracted Text:</p>
                          <div className="text-sm bg-muted p-2 rounded">
                            {tile.extracted_text}
                          </div>
                        </div>
                      )}
                      
                      {tile.structured_data && Object.keys(tile.structured_data).length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-1">Structured Data:</p>
                          <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                            {JSON.stringify(tile.structured_data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <PDFReviewWorkflow 
            processingId={processingId}
            tiles={tiles}
            onWorkflowComplete={(results) => {
              toast({
                title: "Workflow Complete",
                description: "Materials have been successfully processed through the selected workflows",
              });
              console.log("Workflow results:", results);
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
                  <Badge variant={result.processing_status === 'completed' ? 'default' : 'secondary'}>
                    {result.processing_status}
                  </Badge>
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
              <Button variant="outline" size="sm" onClick={() => setSelectedTile(null)}>
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