import React from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import { Image as ImageIcon, Eye } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/core/ui/dialog';
import { DocumentChunk, DocumentImage, ImageChunkRelationship } from '../types';
import { ImageAICostDisplay } from '../components/ImageAICostDisplay';

interface ImagesTabProps {
  filteredImages: DocumentImage[];
  searchQuery: string;
  deletingImageId: string | null;
  chunks: DocumentChunk[];
  imageChunkRelationships: ImageChunkRelationship[];
  deleteImage: (imageId: string) => Promise<void>;
  getImageDisplayName: (image: DocumentImage) => string;
  getRelatedChunksForImage: (imageId: string) => DocumentChunk[];
  formatJsonForDisplay: (data: unknown) => string;
}

export const ImagesTab: React.FC<ImagesTabProps> = ({
  filteredImages,
  searchQuery,
  deletingImageId,
  chunks,
  imageChunkRelationships,
  deleteImage,
  getImageDisplayName,
  getRelatedChunksForImage,
  formatJsonForDisplay,
}) => {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Extracted Images</CardTitle>
          <CardDescription>
            Images extracted from documents with their metadata, analysis
            results, and relationships
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredImages.length === 0 ? (
            <div className="text-center py-8">
              <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? 'No images match your search.'
                  : 'No images available. Process PDFs with images to see content here.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredImages.map((image) => (
                <Card key={image.id} className="overflow-hidden">
                  <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                    {image.image_url ? (
                      <img
                        src={getOptimizedImageUrl(image.image_url, 'preview')}
                        alt={image.caption || 'Document image'}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          console.warn(
                            `Failed to load image: ${image.image_url}`,
                          );
                          (e.target as HTMLImageElement).style.display =
                            'none';
                        }}
                      />
                    ) : (
                      <ImageIcon className="h-12 w-12 text-muted-foreground" />
                    )}
                  </div>
                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">
                          {image.image_type || 'Unknown'}
                        </Badge>
                        <Badge variant="secondary">
                          {Math.round((image.confidence || 0) * 100)}%
                          confidence
                        </Badge>
                      </div>

                      <h4 className="font-medium">
                        {getImageDisplayName(image)}
                      </h4>

                      {image.alt_text && (
                        <p className="text-sm text-muted-foreground">
                          {image.alt_text}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="font-medium">Page:</span>{' '}
                          {image.page_number || 'N/A'}
                        </div>
                        <div>
                          <span className="font-medium">Status:</span>{' '}
                          {image.processing_status || 'N/A'}
                        </div>
                      </div>

                      {image.nearest_heading && (
                        <div className="text-xs">
                          <span className="font-medium">Near:</span>{' '}
                          {image.nearest_heading}
                        </div>
                      )}

                      {image.ocr_extracted_text && (
                        <div className="text-xs">
                          <span className="font-medium">OCR Text:</span>
                          <p className="bg-muted/50 rounded p-2 mt-1 line-clamp-3">
                            {image.ocr_extracted_text}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Details
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                            <DialogHeader>
                              <DialogTitle>Image Details</DialogTitle>
                            </DialogHeader>
                            <div className="flex-1 overflow-y-auto pr-4 space-y-4">
                              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                                {image.image_url ? (
                                  <img
                                    src={getOptimizedImageUrl(image.image_url, 'display')}
                                    alt={image.caption || 'Document image'}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      console.warn(
                                        `Failed to load image in modal: ${image.image_url}`,
                                      );
                                      (
                                        e.target as HTMLImageElement
                                      ).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <ImageIcon className="h-16 w-16 text-muted-foreground" />
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                                  <h4 className="font-semibold mb-3 text-blue-900 dark:text-blue-100">
                                    Basic Information
                                  </h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-blue-700 dark:text-blue-300">
                                        Type:
                                      </span>
                                      <span className="font-medium text-blue-900 dark:text-blue-100">
                                        {image.image_type || 'Unknown'}
                                      </span>
                                    </div>

                                    <div className="flex justify-between">
                                      <span className="text-blue-700 dark:text-blue-300">
                                        Page:
                                      </span>
                                      <span className="font-medium text-blue-900 dark:text-blue-100">
                                        {image.page_number || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-blue-700 dark:text-blue-300">
                                        Confidence:
                                      </span>
                                      <span className="font-medium text-blue-900 dark:text-blue-100">
                                        {Math.round(
                                          (image.confidence || 0) * 100,
                                        )}
                                        %
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-blue-700 dark:text-blue-300">
                                        Status:
                                      </span>
                                      <span className="font-medium text-blue-900 dark:text-blue-100">
                                        {image.processing_status || 'N/A'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                                  <h4 className="font-semibold mb-3 text-purple-900 dark:text-purple-100">
                                    Context Information
                                  </h4>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-purple-700 dark:text-purple-300">
                                        Contextual Name:
                                      </span>
                                      <span className="font-medium text-purple-900 dark:text-purple-100">
                                        {image.contextual_name || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-purple-700 dark:text-purple-300">
                                        Nearest Heading:
                                      </span>
                                      <span className="font-medium text-purple-900 dark:text-purple-100">
                                        {image.nearest_heading || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-purple-700 dark:text-purple-300">
                                        Heading Level:
                                      </span>
                                      <span className="font-medium text-purple-900 dark:text-purple-100">
                                        {image.heading_level || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-purple-700 dark:text-purple-300">
                                        Distance:
                                      </span>
                                      <span className="font-medium text-purple-900 dark:text-purple-100">
                                        {image.heading_distance || 'N/A'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {image.ocr_extracted_text && (
                                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg p-4 border border-green-200 dark:border-green-800">
                                  <h4 className="font-semibold mb-2 text-green-900 dark:text-green-100">
                                    OCR Extracted Text
                                  </h4>
                                  <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                                    {image.ocr_extracted_text}
                                  </div>
                                </div>
                              )}

                              {/* IMPROVED: Show ALL related chunks */}
                              {(() => {
                                const relatedChunks =
                                  getRelatedChunksForImage(image.id);
                                return relatedChunks.length > 0 ? (
                                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                                    <h4 className="font-semibold mb-3 text-amber-900 dark:text-amber-100">
                                      Related Chunks ({relatedChunks.length}
                                      )
                                    </h4>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                      {relatedChunks.map((chunk) => {
                                        const relationship =
                                          imageChunkRelationships.find(
                                            (r) =>
                                              r.image_id === image.id &&
                                              r.chunk_id === chunk.id,
                                          );
                                        return (
                                          <div
                                            key={chunk.id}
                                            className="bg-white dark:bg-gray-900 rounded p-3 border border-amber-100 dark:border-amber-800"
                                          >
                                            <div className="flex items-center justify-between mb-2">
                                              <Badge
                                                variant="outline"
                                                className="text-xs"
                                              >
                                                Chunk {chunk.chunk_index}
                                              </Badge>
                                              {relationship && (
                                                <Badge
                                                  variant="secondary"
                                                  className="text-xs"
                                                >
                                                  {Math.round(
                                                    relationship.similarity_score *
                                                      100,
                                                  )}
                                                  % match
                                                </Badge>
                                              )}
                                            </div>
                                            <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3">
                                              {chunk.content.substring(
                                                0,
                                                200,
                                              )}
                                              ...
                                            </p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : image.chunk_id ? (
                                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                                    <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-100">
                                      Related Chunk
                                    </h4>
                                    <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                                      {chunks
                                        .find(
                                          (c) => c.id === image.chunk_id,
                                        )
                                        ?.content.substring(0, 300) ||
                                        'Chunk not found'}
                                      ...
                                    </div>
                                  </div>
                                ) : null;
                              })()}

                              {/* Material Properties */}
                              {image.material_properties &&
                                Object.keys(
                                  image.material_properties as any,
                                ).length > 0 && (
                                  <div className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900 rounded-lg p-4 border border-teal-200 dark:border-teal-800">
                                    <h4 className="font-semibold mb-3 text-teal-900 dark:text-teal-100">
                                      Material Properties
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      {Object.entries(
                                        image.material_properties as any,
                                      ).map(([key, value]) => (
                                        <div
                                          key={key}
                                          className="bg-white dark:bg-gray-900 rounded p-2 border border-teal-100 dark:border-teal-800"
                                        >
                                          <span className="font-medium text-teal-700 dark:text-teal-300">
                                            {key}:
                                          </span>
                                          <p className="text-gray-700 dark:text-gray-300 text-xs mt-1">
                                            {typeof value === 'object'
                                              ? JSON.stringify(value)
                                              : String(value)}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              {/* Extracted Metadata */}
                              {image.extracted_metadata &&
                                Object.keys(image.extracted_metadata as any)
                                  .length > 0 && (
                                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                                    <h4 className="font-semibold mb-3 text-orange-900 dark:text-orange-100">
                                      Extracted Metadata
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                      {Object.entries(
                                        image.extracted_metadata as any,
                                      ).map(([key, value]) => (
                                        <div
                                          key={key}
                                          className="bg-white dark:bg-gray-900 rounded p-2 border border-orange-100 dark:border-orange-800"
                                        >
                                          <span className="font-medium text-orange-700 dark:text-orange-300">
                                            {key}:
                                          </span>
                                          <p className="text-gray-700 dark:text-gray-300 text-xs mt-1">
                                            {Array.isArray(value)
                                              ? value.join(', ')
                                              : typeof value === 'object'
                                                ? JSON.stringify(value)
                                                : String(value)}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              {image.visual_features && (
                                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
                                  <h4 className="font-semibold mb-2 text-indigo-900 dark:text-indigo-100">
                                    Visual Features
                                  </h4>
                                  <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm max-h-48 overflow-y-auto border border-indigo-100 dark:border-indigo-800">
                                    <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300">
                                      {formatJsonForDisplay(
                                        image.visual_features,
                                      )}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {image.image_analysis_results && (
                                <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950 dark:to-cyan-900 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
                                  <h4 className="font-semibold mb-2 text-cyan-900 dark:text-cyan-100">
                                    Analysis Results
                                  </h4>
                                  <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm max-h-48 overflow-y-auto border border-cyan-100 dark:border-cyan-800">
                                    <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300">
                                      {formatJsonForDisplay(
                                        image.image_analysis_results,
                                      )}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {/* AI Cost Information */}
                              <ImageAICostDisplay imageId={image.id} />

                              {image.metadata && (
                                <div className="bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900 rounded-lg p-4 border border-rose-200 dark:border-rose-800">
                                  <h4 className="font-semibold mb-2 text-rose-900 dark:text-rose-100">
                                    Metadata
                                  </h4>
                                  <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm max-h-48 overflow-y-auto border border-rose-100 dark:border-rose-800">
                                    <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300">
                                      {formatJsonForDisplay(image.metadata)}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteImage(image.id)}
                          disabled={deletingImageId === image.id}
                          className="flex-1"
                        >
                          {deletingImageId === image.id
                            ? '🗑️ Deleting...'
                            : '🗑️ Delete'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ImagesTab;
