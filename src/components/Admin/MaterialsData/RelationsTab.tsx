import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Link2, Image as ImageIcon, FileText, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RelationsTabProps {
  workspaceId: string;
  jobIdFilter?: string;
  onStatsUpdate: () => void;
}

export const RelationsTab: React.FC<RelationsTabProps> = ({ workspaceId, jobIdFilter, onStatsUpdate }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [relations, setRelations] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (workspaceId) {
      loadRelations();
    }
  }, [workspaceId, jobIdFilter]);

  const loadRelations = async () => {
    try {
      setIsLoading(true);
      console.log('[RelationsTab] Loading relations for workspace:', workspaceId);

      // Load images with their related chunks and products
      let query = supabase
        .from('document_images')
        .select(`
          id,
          image_url,
          page_number,
          caption,
          source_type,
          created_at,
          document_chunks!inner(
            id,
            chunk_text,
            page_number,
            products(
              id,
              name,
              source_type
            )
          )
        `)
        .eq('workspace_id', workspaceId);

      if (jobIdFilter && jobIdFilter.trim()) {
        query = query.eq('source_job_id', jobIdFilter.trim());
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[RelationsTab] Error loading relations:', error);
        toast({
          title: 'Error',
          description: 'Failed to load relations',
          variant: 'destructive',
        });
        return;
      }

      console.log('[RelationsTab] Loaded relations:', data?.length);
      setRelations(data || []);
    } catch (error) {
      console.error('[RelationsTab] Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to load relations',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getSourceBadge = (sourceType: string) => {
    const badges: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      pdf_processing: { label: 'PDF', variant: 'default' },
      xml_import: { label: 'XML', variant: 'secondary' },
      web_scraping: { label: 'Web', variant: 'outline' },
    };
    const badge = badges[sourceType] || { label: sourceType, variant: 'outline' };
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Data Relations
        </CardTitle>
        <CardDescription>
          View how images, chunks, and products are connected
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : relations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No relations found
          </div>
        ) : (
          <div className="space-y-4">
            {relations.map((relation) => (
              <Card key={relation.id} className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Image */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ImageIcon className="h-4 w-4 text-blue-600" />
                        Image
                      </div>
                      {relation.image_url && (
                        <img
                          src={relation.image_url}
                          alt={relation.caption || `Page ${relation.page_number}`}
                          className="w-full h-32 object-cover rounded"
                        />
                      )}
                      <div className="text-xs text-muted-foreground">
                        Page {relation.page_number}
                      </div>
                      {getSourceBadge(relation.source_type)}
                    </div>

                    {/* Chunks */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4 text-green-600" />
                        Related Chunks ({relation.document_chunks?.length || 0})
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {relation.document_chunks?.slice(0, 3).map((chunk: any) => (
                          <div key={chunk.id} className="text-xs p-2 bg-muted rounded">
                            {chunk.chunk_text?.substring(0, 100)}...
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Products */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Package className="h-4 w-4 text-purple-600" />
                        Related Products
                      </div>
                      <div className="space-y-1">
                        {relation.document_chunks?.map((chunk: any) =>
                          chunk.products?.map((product: any) => (
                            <div key={product.id} className="text-xs p-2 bg-muted rounded">
                              {product.name}
                              {getSourceBadge(product.source_type)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

