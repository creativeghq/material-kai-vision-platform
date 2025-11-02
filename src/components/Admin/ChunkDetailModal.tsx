import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  Hash,
  Calendar,
  Database,
  Image as ImageIcon,
  Link as LinkIcon,
} from 'lucide-react';

interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: any;
  created_at: string;
  workspace_id?: string;
  documents?: any;
}

interface DocumentImage {
  id: string;
  document_id: string;
  chunk_id?: string;
  image_url?: string;
  image_base64?: string;
  metadata?: any;
}

interface Embedding {
  id: string;
  chunk_id?: string;
  embedding_type?: string;
  model?: string;
  dimensions?: number;
  created_at?: string;
}

interface ChunkDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chunk: DocumentChunk | null;
  relatedChunks?: DocumentChunk[];
  images?: DocumentImage[];
  embedding?: Embedding | null;
  documentName?: string;
}

export const ChunkDetailModal: React.FC<ChunkDetailModalProps> = ({
  open,
  onOpenChange,
  chunk,
  relatedChunks = [],
  images = [],
  embedding = null,
  documentName = 'Unknown Document',
}) => {
  if (!chunk) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-xl">Chunk Details</DialogTitle>
              <DialogDescription className="mt-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {documentName}
              </DialogDescription>
            </div>
            <Badge variant="outline">
              <Hash className="h-3 w-3 mr-1" />
              Index: {chunk.chunk_index}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Chunk Content */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                Content
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {chunk.content}
                </p>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {chunk.content.length} characters
              </div>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Hash className="h-3 w-3" />
                    Chunk ID
                  </p>
                  <p className="text-sm text-muted-foreground font-mono text-xs">
                    {chunk.id}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    Created
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(chunk.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {chunk.metadata && Object.keys(chunk.metadata).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    Additional Metadata
                  </p>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <pre className="text-xs whitespace-pre-wrap">
                      {JSON.stringify(chunk.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Embedding Info */}
          {embedding && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4" />
                  Embedding
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="border rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Type
                    </p>
                    <p className="text-sm mt-1">
                      {embedding.embedding_type || 'text'}
                    </p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Model
                    </p>
                    <p className="text-sm mt-1">{embedding.model || 'N/A'}</p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Dimensions
                    </p>
                    <p className="text-sm mt-1">
                      {embedding.dimensions || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Related Images */}
          {images.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImageIcon className="h-4 w-4" />
                  Related Images ({images.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {images.map((image) => (
                    <div
                      key={image.id}
                      className="border rounded-lg overflow-hidden"
                    >
                      {image.image_url ? (
                        <img
                          src={image.image_url}
                          alt="Chunk image"
                          className="w-full h-32 object-cover"
                        />
                      ) : image.image_base64 ? (
                        <img
                          src={`data:image/png;base64,${image.image_base64}`}
                          alt="Chunk image"
                          className="w-full h-32 object-cover"
                        />
                      ) : (
                        <div className="w-full h-32 bg-muted flex items-center justify-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                      <div className="p-2 bg-muted/50">
                        <p className="text-xs text-muted-foreground truncate">
                          {image.id.substring(0, 8)}...
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Related Chunks */}
          {relatedChunks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LinkIcon className="h-4 w-4" />
                  Related Chunks ({relatedChunks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {relatedChunks.map((relatedChunk) => (
                    <div
                      key={relatedChunk.id}
                      className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-xs">
                          <Hash className="h-3 w-3 mr-1" />
                          Index: {relatedChunk.chunk_index}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {relatedChunk.content.length} chars
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {relatedChunk.content}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Document Info */}
          {chunk.documents && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Source Document
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Filename:</span>
                    <span className="text-sm text-muted-foreground">
                      {chunk.documents.filename || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <Badge
                      variant={
                        chunk.documents.processing_status === 'completed'
                          ? 'default'
                          : 'secondary'
                      }
                    >
                      {chunk.documents.processing_status || 'unknown'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Created:</span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(chunk.documents.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
