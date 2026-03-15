import React from 'react';
import { FileText, Image as ImageIcon, Brain, Eye } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { DocumentChunk, DocumentImage, Embedding } from '../types';

interface ChunksTabProps {
  filteredChunks: DocumentChunk[];
  searchQuery: string;
  currentPage: number;
  itemsPerPage: number;
  setCurrentPage: (page: number) => void;
  getImagesByChunk: (chunkId: string) => DocumentImage[];
  getEmbeddingByChunk: (chunkId: string) => Embedding | undefined;
  getDocumentDisplayName: (chunk: DocumentChunk) => string;
  handleViewChunkDetail: (chunk: DocumentChunk) => void;
  getPaginatedChunks: () => DocumentChunk[];
  getTotalPages: () => number;
  getPaginationNumbers: () => (number | string)[];
}

export const ChunksTab: React.FC<ChunksTabProps> = ({
  filteredChunks,
  searchQuery,
  currentPage,
  itemsPerPage,
  setCurrentPage,
  getImagesByChunk,
  getEmbeddingByChunk,
  getDocumentDisplayName,
  handleViewChunkDetail,
  getPaginatedChunks,
  getTotalPages,
  getPaginationNumbers,
}) => {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Document Chunks</CardTitle>
          <CardDescription>
            Text chunks extracted from processed documents with their
            metadata and relationships
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredChunks.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? 'No chunks match your search.'
                  : 'No chunks available. Process some PDFs to see content here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Pagination Info */}
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                  {Math.min(
                    currentPage * itemsPerPage,
                    filteredChunks.length,
                  )}{' '}
                  of {filteredChunks.length} chunks
                </span>
              </div>

              {/* Chunks List */}
              {getPaginatedChunks().map((chunk) => {
                const relatedImages = getImagesByChunk(chunk.id);
                const embedding = getEmbeddingByChunk(chunk.id);

                return (
                  <div
                    key={chunk.id}
                    className="border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleViewChunkDetail(chunk)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="outline">
                            Chunk {chunk.chunk_index}
                          </Badge>
                          <Badge variant="secondary">
                            {getDocumentDisplayName(chunk)}
                          </Badge>
                          {relatedImages.length > 0 && (
                            <Badge
                              variant="outline"
                              className="text-purple-600"
                            >
                              <ImageIcon className="h-3 w-3 mr-1" />
                              {relatedImages.length} images
                            </Badge>
                          )}
                          {embedding && (
                            <Badge
                              variant="outline"
                              className="text-orange-600"
                            >
                              <Brain className="h-3 w-3 mr-1" />
                              Embedded
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {chunk.content.substring(0, 200)}...
                        </p>
                        {/* IMPROVED: Add context information */}
                        <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                          <div>
                            <span className="font-medium">Position:</span>{' '}
                            {chunk.chunk_index + 1}
                          </div>
                          <div>
                            <span className="font-medium">Size:</span>{' '}
                            {chunk.content.length} chars
                          </div>
                          <div>
                            <span className="font-medium">Quality:</span>{' '}
                            {(chunk.metadata as any)?.quality_score
                              ? `${Math.round((chunk.metadata as any).quality_score * 100)}%`
                              : 'N/A'}
                          </div>
                          <div>
                            <span className="font-medium">Date:</span>{' '}
                            {new Date(
                              chunk.created_at,
                            ).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <Eye className="h-4 w-4" />
                    </div>
                  </div>
                );
              })}

              {/* Pagination Controls */}
              {getTotalPages() > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && setCurrentPage(1)
                    }
                    disabled={currentPage === 1}
                    className="px-3"
                  >
                    &lt;&lt;
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage(Math.max(1, currentPage - 1))
                    }
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      setCurrentPage(Math.max(1, currentPage - 1))
                    }
                    disabled={currentPage === 1}
                    className="px-3"
                  >
                    &lt;
                  </Button>

                  {/* Smart pagination with ellipsis */}
                  <div className="flex gap-1">
                    {getPaginationNumbers().map((page, index) =>
                      page === '...' ? (
                        <span
                          key={`ellipsis-${index}`}
                          className="px-2 py-1 text-muted-foreground"
                        >
                          ...
                        </span>
                      ) : (
                        <Button
                          key={page}
                          variant={
                            currentPage === page ? 'default' : 'outline'
                          }
                          size="sm"
                          onClick={() => setCurrentPage(page as number)}
                          onKeyDown={(e) =>
                            e.key === 'Enter' &&
                            setCurrentPage(page as number)
                          }
                          className="w-8 h-8 p-0"
                        >
                          {page}
                        </Button>
                      ),
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage(
                        Math.min(getTotalPages(), currentPage + 1),
                      )
                    }
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      setCurrentPage(
                        Math.min(getTotalPages(), currentPage + 1),
                      )
                    }
                    disabled={currentPage === getTotalPages()}
                    className="px-3"
                  >
                    &gt;
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(getTotalPages())}
                    onKeyDown={(e) =>
                      e.key === 'Enter' && setCurrentPage(getTotalPages())
                    }
                    disabled={currentPage === getTotalPages()}
                    className="px-3"
                  >
                    &gt;&gt;
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChunksTab;
