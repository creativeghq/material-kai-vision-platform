import React from 'react';
import { FileText, Database, ChevronRight, Download, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { DocumentChunk, DocumentImage, KnowledgeBaseStats } from '../types';

interface OverviewTabProps {
  chunks: DocumentChunk[];
  images: DocumentImage[];
  stats: KnowledgeBaseStats | null;
  getChunksByDocument: (documentId: string) => DocumentChunk[];
  getImagesByDocument: (documentId: string) => DocumentImage[];
  getDocumentDisplayName: (chunk: DocumentChunk) => string;
  handleExportDocumentImages: (documentId: string) => Promise<void>;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  chunks,
  stats,
  getChunksByDocument,
  getImagesByDocument,
  getDocumentDisplayName,
  handleExportDocumentImages,
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Documents Overview - IMPROVED: Show complete details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents by Source
            </CardTitle>
            <CardDescription>
              Complete PDF details with processing status and metadata
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chunks.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No documents processed yet. Upload PDFs to see content here.
              </p>
            ) : (
              <div className="space-y-3">
                {Array.from(new Set(chunks.map((c) => c.document_id))).map(
                  (docId) => {
                    const docChunks = getChunksByDocument(docId);
                    const docImages = getImagesByDocument(docId);
                    const firstChunk = docChunks[0];
                    const doc = (firstChunk as any).documents;

                    return (
                      <div
                        key={docId}
                        className="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                        onClick={() =>
                          navigate(`/admin/documents/${docId}`)
                        }
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="font-semibold flex items-center gap-2 group-hover:text-primary">
                              {getDocumentDisplayName(firstChunk)}
                              <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              📄 {doc?.filename || 'Unknown filename'}
                            </p>
                          </div>
                          <Badge
                            variant={
                              doc?.processing_status === 'completed'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {doc?.processing_status || 'unknown'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                          <div>
                            <span className="text-muted-foreground">
                              Chunks:
                            </span>
                            <span className="ml-1 font-medium">
                              {docChunks.length}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              Images:
                            </span>
                            <span className="ml-1 font-medium">
                              {docImages.length}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2 text-xs text-muted-foreground mb-3">
                          <Badge variant="outline">
                            {docChunks.length} chunks
                          </Badge>
                          <Badge variant="outline">
                            {docImages.length} images
                          </Badge>
                          <Badge variant="outline">
                            {new Date(doc?.created_at).toLocaleDateString()}
                          </Badge>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/admin/documents/${docId}`);
                            }}
                          >
                            View Details
                            <ChevronRight className="h-4 w-4 ml-2" />
                          </Button>
                          {docImages.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportDocumentImages(docId);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Processing Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Processing Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span>Text Chunks</span>
                <Badge variant="secondary">
                  {stats?.totalChunks || 0} processed
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>Images Extracted</span>
                <Badge variant="secondary">
                  {stats?.totalImages || 0} extracted
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>Text Embeddings</span>
                <Badge variant="secondary">
                  {stats?.totalEmbeddings || 0} generated
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span>Image Embeddings</span>
                <Badge variant="secondary">
                  {(stats as any)?.totalImageEmbeddings || 0} generated
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OverviewTab;
