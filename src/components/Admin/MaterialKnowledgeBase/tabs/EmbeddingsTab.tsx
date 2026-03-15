import React from 'react';
import { Brain } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { DocumentChunk, Embedding } from '../types';

interface EmbeddingsTabProps {
  embeddings: Embedding[];
  chunks: DocumentChunk[];
  getDocumentDisplayName: (chunk: DocumentChunk) => string;
}

export const EmbeddingsTab: React.FC<EmbeddingsTabProps> = ({
  embeddings,
  chunks,
  getDocumentDisplayName,
}) => {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Generated Embeddings</CardTitle>
          <CardDescription>
            Vector embeddings generated for text chunks to enable semantic
            search and RAG
          </CardDescription>
        </CardHeader>
        <CardContent>
          {embeddings.length === 0 ? (
            <div className="text-center py-8">
              <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No embeddings available. Process documents to generate
                embeddings.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {embeddings.map((embedding) => {
                const relatedChunk = chunks.find(
                  (c) => c.id === embedding.chunk_id,
                );

                return (
                  <Card key={embedding.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Brain className="h-4 w-4 text-orange-500" />
                          <span className="font-medium">
                            Embedding {embedding.id.substring(0, 8)}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline">
                            {embedding.model_name || 'Unknown Model'}
                          </Badge>
                          <Badge variant="secondary">
                            {embedding.dimensions || 0}D
                          </Badge>
                        </div>
                      </div>

                      {relatedChunk && (
                        <div className="mb-3">
                          <h4 className="font-medium mb-1">
                            Related Chunk
                          </h4>
                          <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2 line-clamp-2">
                            {relatedChunk.content.substring(0, 200)}...
                          </p>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">
                              {getDocumentDisplayName(relatedChunk)}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              Chunk {relatedChunk.chunk_index}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {/* IMPROVED: Show embedding type and complete metadata */}
                      <div className="grid grid-cols-4 gap-3 text-sm mb-3">
                        <div>
                          <span className="font-medium">Model:</span>
                          <p className="text-muted-foreground text-xs">
                            {embedding.model_name ||
                              'text-embedding-3-small'}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium">Dimensions:</span>
                          <p className="text-muted-foreground text-xs">
                            {embedding.dimensions || 1536}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium">Type:</span>
                          <p className="text-muted-foreground text-xs">
                            {embedding.embedding_type || 'text'}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium">Generated:</span>
                          <p className="text-muted-foreground text-xs">
                            {new Date(
                              embedding.created_at,
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            Vector Status
                          </span>
                          <Badge
                            variant="outline"
                            className="text-green-600"
                          >
                            ✓ Generated ({embedding.dimensions || 1536}D)
                          </Badge>
                        </div>
                        <div className="mt-2 bg-muted/50 rounded p-2 text-xs">
                          <p className="text-muted-foreground">
                            Vector embedding successfully generated and
                            stored. This chunk is ready for semantic search
                            and RAG operations.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmbeddingsTab;
