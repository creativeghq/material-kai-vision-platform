import React from 'react';
import { FileText, Image as ImageIcon, Link } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { KnowledgeBaseStats } from '../types';

interface RelationshipsTabProps {
  imageChunkRelationships: any[];
  stats: KnowledgeBaseStats | null;
}

export const RelationshipsTab: React.FC<RelationshipsTabProps> = ({
  stats,
}) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Entity Relationships
          </CardTitle>
          <CardDescription>
            View relevance-scored relationships between chunks, products, and images
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <Link className="h-5 w-5 text-blue-600" />
                <div>
                  <h4 className="font-medium text-blue-900">Relevancy Management</h4>
                  <p className="text-sm text-blue-700">
                    View and manage all entity relationships with detailed scoring algorithms
                  </p>
                </div>
              </div>
              <Button
                onClick={() => navigate('/admin/ai-data?tab=relevancy')}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Open Relevancy Manager
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-blue-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    Chunk → Product
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {stats?.totalChunks || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Text chunks linked to products
                  </p>
                  <div className="mt-3 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Page Proximity</span>
                      <span className="font-medium">40%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Embedding Similarity</span>
                      <span className="font-medium">30%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mention Score</span>
                      <span className="font-medium">30%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-purple-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-purple-600" />
                    Product → Image
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {stats?.totalImages || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Images linked to products
                  </p>
                  <div className="mt-3 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Page Overlap</span>
                      <span className="font-medium">40%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Visual Similarity</span>
                      <span className="font-medium">40%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Detection Score</span>
                      <span className="font-medium">20%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Link className="h-4 w-4 text-green-600" />
                    Chunk → Image
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {(stats?.totalChunks || 0) + (stats?.totalImages || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Chunks linked to images
                  </p>
                  <div className="mt-3 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Same Page</span>
                      <span className="font-medium">50%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Visual-Text Similarity</span>
                      <span className="font-medium">30%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Spatial Proximity</span>
                      <span className="font-medium">20%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="text-sm">About Relevancy Scoring</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  <strong>Relevancy scores</strong> (0.0-1.0) indicate how closely two entities are related.
                  Higher scores mean stronger relationships.
                </p>
                <p>
                  Each relationship type uses a different scoring algorithm with weighted components
                  to ensure accurate entity linking across the knowledge base.
                </p>
                <p className="text-xs mt-3">
                  <strong>Relationship Types:</strong> source, related, component, alternative (Chunk→Product) |
                  depicts, illustrates, variant, related (Product→Image) |
                  illustrates, depicts, related, example (Chunk→Image)
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RelationshipsTab;
