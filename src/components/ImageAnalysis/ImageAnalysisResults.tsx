import React, { useState, useMemo } from 'react';
import { 
  Eye, 
  Download, 
  Copy, 
  FileText, 
  Image as ImageIcon, 
  Table, 
  FileSpreadsheet,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { ScrollArea } from '../ui/scroll-area';
import { useImageAnalysis } from '../../hooks/useImageAnalysis';
import { ImageAnalysisResult } from '../../services/imageAnalysis/ImageAnalysisService';

interface ImageAnalysisResultsProps {
  analysisId?: string;
  showAllResults?: boolean;
  onResultSelect?: (result: ImageAnalysisResult) => void;
  className?: string;
}

const ImageAnalysisResults: React.FC<ImageAnalysisResultsProps> = ({
  analysisId,
  showAllResults = false,
  onResultSelect,
  className = '',
}) => {
  const { results } = useImageAnalysis();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  // Filter results based on props and filters
  const filteredResults = useMemo(() => {
    let filtered = showAllResults ? results : results.filter(r => r.id === analysisId);
    
    if (searchTerm) {
      filtered = filtered.filter(result =>
        result.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (result.results?.ocr && searchTerm.toLowerCase().includes('ocr')) ||
        (result.results?.objects && searchTerm.toLowerCase().includes('object')) ||
        (result.results?.classification && searchTerm.toLowerCase().includes('classification'))
      );
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(result => result.status === statusFilter);
    }
    
    if (typeFilter !== 'all') {
      filtered = filtered.filter(result => {
        switch (typeFilter) {
          case 'ocr':
            return result.results?.ocr;
          case 'object_detection':
            return result.results?.objects;
          case 'classification':
            return result.results?.classification;
          case 'full_analysis':
            return result.results?.ocr || result.results?.objects || result.results?.classification;
          default:
            return true;
        }
      });
    }
    
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [results, analysisId, showAllResults, searchTerm, statusFilter, typeFilter]);

  // Toggle expanded state for a result
  const toggleExpanded = (resultId: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedResults(newExpanded);
  };

  // Get status icon
  const getStatusIcon = (status: ImageAnalysisResult['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-500" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  // Get status color
  const getStatusColor = (status: ImageAnalysisResult['status']) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'processing':
        return 'default';
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  // Copy text to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Download result as JSON
  const downloadResult = (result: ImageAnalysisResult) => {
    const dataStr = JSON.stringify(result, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analysis-${result.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Render OCR results
  const renderOCRResults = (ocrResults: any[]) => (
    <div className="space-y-3">
      {ocrResults.map((block, index) => (
        <Card key={index} className="p-3">
          <div className="flex items-start justify-between mb-2">
            <Badge variant="outline">
              Confidence: {(block.confidence * 100).toFixed(1)}%
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(block.text)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-sm">{block.text}</p>
          {block.boundingBox && (
            <p className="text-xs text-gray-500 mt-1">
              Position: ({block.boundingBox.x}, {block.boundingBox.y}) 
              Size: {block.boundingBox.width}×{block.boundingBox.height}
            </p>
          )}
        </Card>
      ))}
    </div>
  );

  // Render object detection results
  const renderObjectDetection = (objects: any[]) => (
    <div className="space-y-3">
      {objects.map((obj, index) => (
        <Card key={index} className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{obj.label}</Badge>
              <Badge variant="secondary">
                {(obj.confidence * 100).toFixed(1)}%
              </Badge>
            </div>
          </div>
          {obj.boundingBox && (
            <p className="text-xs text-gray-500">
              Position: ({obj.boundingBox.x}, {obj.boundingBox.y}) 
              Size: {obj.boundingBox.width}×{obj.boundingBox.height}
            </p>
          )}
        </Card>
      ))}
    </div>
  );

  // Render table extraction results
  const renderTableResults = (tables: any[]) => (
    <div className="space-y-4">
      {tables.map((table, index) => (
        <Card key={index} className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium flex items-center gap-2">
              <Table className="h-4 w-4" />
              Table {index + 1}
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(JSON.stringify(table.data, null, 2))}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gray-200">
              {table.data.map((row: any[], rowIndex: number) => (
                <tr key={rowIndex} className={rowIndex === 0 ? 'bg-gray-50' : ''}>
                  {row.map((cell: any, cellIndex: number) => (
                    <td key={cellIndex} className="border border-gray-200 p-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </table>
          </div>
        </Card>
      ))}
    </div>
  );

  // Render form extraction results
  const renderFormResults = (forms: any[]) => (
    <div className="space-y-3">
      {forms.map((form, index) => (
        <Card key={index} className="p-3">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Form {index + 1}
          </h4>
          <div className="space-y-2">
            {Object.entries(form.fields).map(([key, value]: [string, any]) => (
              <div key={key} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span className="font-medium text-sm">{key}:</span>
                <span className="text-sm">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );

  if (filteredResults.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <ImageIcon className="h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-500 text-center">
            {showAllResults ? 'No analysis results found' : 'No results for this analysis'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Filters */}
      {showAllResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by filename or type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="ocr">OCR</SelectItem>
                    <SelectItem value="object_detection">Object Detection</SelectItem>
                    <SelectItem value="classification">Classification</SelectItem>
                    <SelectItem value="full_analysis">Full Analysis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <div className="space-y-4">
        {filteredResults.map((result) => (
          <Card key={result.id} className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Collapsible>
                    <CollapsibleTrigger
                      onClick={() => toggleExpanded(result.id)}
                      className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded"
                    >
                      {expandedResults.has(result.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </CollapsibleTrigger>
                  </Collapsible>
                  
                  <div>
                    <CardTitle className="text-lg">Analysis {result.id}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={getStatusColor(result.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(result.status)}
                          {result.status}
                        </span>
                      </Badge>
                      <Badge variant="outline">
                        {result.results?.ocr && result.results?.objects ? 'Full Analysis' :
                         result.results?.ocr ? 'OCR' :
                         result.results?.objects ? 'Object Detection' :
                         result.results?.classification ? 'Classification' : 'Analysis'}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {new Date(result.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {onResultSelect && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onResultSelect(result)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadResult(result)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <Collapsible open={expandedResults.has(result.id)}>
              <CollapsibleContent>
                <CardContent>
                  {result.status === 'failed' && result.error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-700 text-sm">{result.error}</p>
                    </div>
                  )}
                  
                  {result.status === 'completed' && result.results && (
                    <Tabs defaultValue="overview" className="w-full">
                      <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="ocr">OCR</TabsTrigger>
                        <TabsTrigger value="objects">Objects</TabsTrigger>
                        <TabsTrigger value="tables">Tables</TabsTrigger>
                        <TabsTrigger value="forms">Forms</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="overview" className="mt-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <Card className="p-3">
                            <div className="text-center">
                              <FileText className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                              <p className="text-sm font-medium">OCR Blocks</p>
                              <p className="text-lg font-bold">
                                {result.results?.ocr?.blocks?.length || 0}
                              </p>
                            </div>
                          </Card>
                          
                          <Card className="p-3">
                            <div className="text-center">
                              <ImageIcon className="h-6 w-6 mx-auto mb-2 text-green-500" />
                              <p className="text-sm font-medium">Objects</p>
                              <p className="text-lg font-bold">
                                {result.results?.objects?.length || 0}
                              </p>
                            </div>
                          </Card>
                          
                          <Card className="p-3">
                            <div className="text-center">
                              <Table className="h-6 w-6 mx-auto mb-2 text-purple-500" />
                              <p className="text-sm font-medium">Tables</p>
                              <p className="text-lg font-bold">
                                {result.results?.ocr?.tables?.length || 0}
                              </p>
                            </div>
                          </Card>
                          
                          <Card className="p-3">
                            <div className="text-center">
                              <FileSpreadsheet className="h-6 w-6 mx-auto mb-2 text-orange-500" />
                              <p className="text-sm font-medium">Forms</p>
                              <p className="text-lg font-bold">
                                {result.results?.ocr?.forms?.length || 0}
                              </p>
                            </div>
                          </Card>
                        </div>
                        
                        {result.results.metadata && (
                          <Card className="mt-4 p-3">
                            <h4 className="font-medium mb-2">Metadata</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="font-medium">File Size:</span> {result.results?.metadata?.size || 'Unknown'}
                              </div>
                              <div>
                                <span className="font-medium">Dimensions:</span> {result.results?.metadata?.width}×{result.results?.metadata?.height}
                              </div>
                              <div>
                                <span className="font-medium">Format:</span> {result.results?.metadata?.format || 'Unknown'}
                              </div>
                              <div>
                                <span className="font-medium">Processing Time:</span> {result.processingTime || 0}ms
                              </div>
                            </div>
                          </Card>
                        )}
                      </TabsContent>
                      
                      <TabsContent value="ocr" className="mt-4">
                        <ScrollArea className="h-96">
                          {result.results?.ocr?.blocks && result.results.ocr.blocks.length > 0 ? (
                            renderOCRResults(result.results.ocr.blocks)
                          ) : (
                            <p className="text-gray-500 text-center py-8">No OCR results found</p>
                          )}
                        </ScrollArea>
                      </TabsContent>
                      
                      <TabsContent value="objects" className="mt-4">
                        <ScrollArea className="h-96">
                          {result.results?.objects && result.results.objects.length > 0 ? (
                            renderObjectDetection(result.results.objects)
                          ) : (
                            <p className="text-gray-500 text-center py-8">No objects detected</p>
                          )}
                        </ScrollArea>
                      </TabsContent>
                      
                      <TabsContent value="tables" className="mt-4">
                        <ScrollArea className="h-96">
                          {result.results?.ocr?.tables && result.results.ocr.tables.length > 0 ? (
                            renderTableResults(result.results.ocr.tables)
                          ) : (
                            <p className="text-gray-500 text-center py-8">No tables found</p>
                          )}
                        </ScrollArea>
                      </TabsContent>
                      
                      <TabsContent value="forms" className="mt-4">
                        <ScrollArea className="h-96">
                          {result.results?.ocr?.forms && result.results.ocr.forms.length > 0 ? (
                            renderFormResults(result.results.ocr.forms)
                          ) : (
                            <p className="text-gray-500 text-center py-8">No forms found</p>
                          )}
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ImageAnalysisResults;