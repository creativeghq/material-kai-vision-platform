import React, { useState, useCallback } from 'react';
import {
  FileText,
  Info,
  Settings,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  Image as ImageIcon,
  MousePointer,
  Layers,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { EnhancedFunctionalMetadataCard } from '@/components/FunctionalMetadata/EnhancedFunctionalMetadataCard';
import { type FunctionalMetadata } from '@/types/materials';

interface PDFChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  htmlContent: string;
  chunkType: 'paragraph' | 'heading' | 'list' | 'table' | 'other';
  hierarchyLevel: number;
  pageNumber: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  content_type: string;
  status: string;
  created_at: string;
  created_by: string;
  semantic_tags: string[];
  material_ids: string[];
  relevance_score: number;
  source_url?: string;
  pdf_url?: string;
  metadata?: {
    storage_info?: {
      pdf_storage_url?: string;
      html_storage_url?: string;
    };
    functional_metadata?: FunctionalMetadata;
    raw_functional_data?: Record<string, {
      display_name: string;
      highlights: string[];
      technical_details: string[];
      extraction_confidence: 'low' | 'medium' | 'high';
    }>;
    extraction_summary?: {
      categories_with_data: string[];
      key_properties_found: string[];
      suggested_applications: string[];
      overall_confidence: 'low' | 'medium' | 'high';
    };
    chunks?: PDFChunk[];
    processed_images?: Array<{
      storage_path?: string;
      caption?: string;
      [key: string]: unknown;
    }>;
  };
}

interface KnowledgeBasePDFViewerProps {
  /** Knowledge entry containing PDF and functional metadata */
  entry: KnowledgeEntry;
  /** Whether to show functional metadata by default */
  showMetadata?: boolean;
  /** Callback when a chunk is clicked */
  onChunkClick?: (chunk: PDFChunk) => void;
  /** Callback when a functional property is clicked */
  onPropertyClick?: (category: string, property: string, value: unknown) => void;
}

export const KnowledgeBasePDFViewer: React.FC<KnowledgeBasePDFViewerProps> = ({
  entry,
  showMetadata = true,
  onChunkClick,
  onPropertyClick,
}) => {
  const [metadataVisible, setMetadataVisible] = useState(showMetadata);
  const [selectedChunk, setSelectedChunk] = useState<PDFChunk | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['chunks']));

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handleChunkClick = useCallback((chunk: PDFChunk) => {
    setSelectedChunk(chunk);
    onChunkClick?.(chunk);
  }, [onChunkClick]);

  const handlePropertyClick = useCallback((category: string, property: string, value: unknown) => {
    onPropertyClick?.(category, property, value);
  }, [onPropertyClick]);

  const hasMetadata = entry.metadata?.functional_metadata;
  const chunks = entry.metadata?.chunks || [];

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">{entry.title}</h2>
            <p className="text-sm text-muted-foreground">
              Knowledge Base Entry • {entry.content_type}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {hasMetadata && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMetadataVisible(!metadataVisible)}
              className="flex items-center gap-2"
            >
              {metadataVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {metadataVisible ? 'Hide' : 'Show'} Metadata
            </Button>
          )}
          
          {entry.metadata?.storage_info?.pdf_storage_url && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(entry.metadata?.storage_info?.pdf_storage_url, '_blank')}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              View Original PDF
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Layout */}
      <div className={`grid gap-6 ${metadataVisible && hasMetadata ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        
        {/* PDF Content Section */}
        <div className="space-y-4">
          
          {/* Content Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Info className="h-5 w-5" />
                Content Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{entry.content}</p>
              
              {entry.semantic_tags && entry.semantic_tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {entry.semantic_tags.map((tag, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chunks Section */}
          {chunks.length > 0 && (
            <Card>
              <Collapsible 
                open={expandedSections.has('chunks')} 
                onOpenChange={() => toggleSection('chunks')}
              >
                <CardHeader className="pb-3">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Layers className="h-5 w-5" />
                        PDF Content Chunks ({chunks.length})
                      </CardTitle>
                      {expandedSections.has('chunks') ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                    </Button>
                  </CollapsibleTrigger>
                </CardHeader>
                
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {chunks.map((chunk) => (
                        <div 
                          key={chunk.id}
                          className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/50 ${
                            selectedChunk?.id === chunk.id ? 'border-primary bg-primary/5' : ''
                          }`}
                          onClick={() => handleChunkClick(chunk)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs">
                                  {chunk.chunkType}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  Page {chunk.pageNumber}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Level {chunk.hierarchyLevel}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-3">
                                {chunk.text}
                              </p>
                            </div>
                            <MousePointer className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                          </div>
                          
                          {selectedChunk?.id === chunk.id && hasMetadata && metadataVisible && (
                            <div className="mt-4 pt-4 border-t">
                              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                Functional metadata context for this content area
                              </div>
                              <div className="bg-blue-50/50 p-3 rounded-lg">
                                <p className="text-xs text-blue-700">
                                  Click properties in the metadata panel to see how they relate to this content chunk.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}

          {/* Images Section */}
          {entry.metadata?.processed_images && Array.isArray(entry.metadata.processed_images) && (
            <Card>
              <Collapsible 
                open={expandedSections.has('images')} 
                onOpenChange={() => toggleSection('images')}
              >
                <CardHeader className="pb-3">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <ImageIcon className="h-5 w-5" />
                        Extracted Images ({entry.metadata.processed_images.length})
                      </CardTitle>
                      {expandedSections.has('images') ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                    </Button>
                  </CollapsibleTrigger>
                </CardHeader>
                
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {entry.metadata.processed_images.map((image: Record<string, unknown>, idx: number) => (
                        <div key={idx} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                          <div className="aspect-video bg-gray-100 flex items-center justify-center">
                            {image.storage_path ? (
                              <img
                                src={(image.storage_path as string) || ''}
                                alt={`Extracted image ${idx + 1}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>
                          <div className="p-3">
                            <p className="text-xs text-muted-foreground">
                              {(image.caption as string) || `Image ${idx + 1}`}
                            </p>
                            {hasMetadata && metadataVisible && (
                              <div className="mt-2 pt-2 border-t">
                                <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                                  View functional properties →
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </div>

        {/* Functional Metadata Panel */}
        {hasMetadata && metadataVisible && (
          <div className="space-y-4">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="h-5 w-5" />
                  Functional Properties
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  Material properties extracted from this document
                </div>
              </CardHeader>
              <CardContent>
                {entry.metadata?.functional_metadata ? (
                  <EnhancedFunctionalMetadataCard
                    functionalMetadata={entry.metadata.functional_metadata}
                    displayMode="expanded"
                    showConfidence={true}
                    onPropertyClick={handlePropertyClick}
                    {...(entry.metadata.raw_functional_data && { rawFunctionalData: entry.metadata.raw_functional_data })}
                    {...(entry.metadata.extraction_summary && { extractionSummary: entry.metadata.extraction_summary })}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No functional metadata available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Selected Chunk Detail Modal/Panel */}
      {selectedChunk && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MousePointer className="h-5 w-5" />
              Selected Chunk Details
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{selectedChunk.chunkType}</Badge>
              <Badge variant="secondary">Page {selectedChunk.pageNumber}</Badge>
              <Badge variant="outline">Level {selectedChunk.hierarchyLevel}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Full Content</h4>
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                {selectedChunk.text}
              </div>
            </div>
            
            {selectedChunk.htmlContent && selectedChunk.htmlContent !== selectedChunk.text && (
              <div>
                <h4 className="text-sm font-medium mb-2">HTML Content</h4>
                <div 
                  className="bg-gray-50 p-3 rounded-lg text-sm prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedChunk.htmlContent }}
                />
              </div>
            )}

            {Object.keys(selectedChunk.metadata).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Chunk Metadata</h4>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <pre className="text-xs text-muted-foreground overflow-auto">
                    {JSON.stringify(selectedChunk.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedChunk(null)}
              >
                Close Details
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};