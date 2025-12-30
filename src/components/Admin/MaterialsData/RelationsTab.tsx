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
      // Note: Simplified query to avoid complex joins that may not exist in schema
      let query = supabase
        .from('document_images')
        .select(`
          id,
          image_url,
          page_number,
          caption,
          source_type,
          created_at,
          workspace_id
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
          description: `Failed to load relations: ${error.message}`,
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
                  <div className="flex items-start gap-4">
                    {/* Image */}
                    <div className="space-y-2 flex-shrink-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ImageIcon className="h-4 w-4 text-blue-600" />
                        Image
                      </div>
                      {relation.image_url && (
                        <img
                          src={relation.image_url}
                          alt={relation.caption || `Page ${relation.page_number}`}
                          className="w-48 h-32 object-cover rounded"
                        />
                      )}
                      <div className="text-xs text-muted-foreground">
                        Page {relation.page_number}
                      </div>
                      {getSourceBadge(relation.source_type)}
                    </div>

                    {/* Metadata */}
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4 text-green-600" />
                        Image Details
                      </div>
                      <div className="space-y-1">
                        {relation.caption && (
                          <div className="text-xs">
                            <span className="font-medium">Caption:</span> {relation.caption}
                          </div>
                        )}
                        <div className="text-xs">
                          <span className="font-medium">Created:</span> {new Date(relation.created_at).toLocaleString()}
                        </div>
                        <div className="text-xs">
                          <span className="font-medium">ID:</span> {relation.id}
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="space-y-2 flex-shrink-0 w-64">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Link2 className="h-4 w-4 text-purple-600" />
                        Status
                      </div>
                      <div className="text-xs p-2 bg-muted rounded">
                        <p className="text-muted-foreground">
                          Relations feature requires additional database schema setup.
                          Currently showing basic image data.
                        </p>
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

