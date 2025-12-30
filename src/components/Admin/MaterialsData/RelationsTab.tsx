import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Link2, Image as ImageIcon, FileText, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : relations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No relations found
          </div>
        ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Image</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Caption</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relations.map((relation) => (
                  <TableRow key={relation.id}>
                    <TableCell>
                      {relation.image_url && (
                        <img
                          src={relation.image_url}
                          alt={relation.caption || `Page ${relation.page_number}`}
                          className="w-20 h-20 object-cover rounded"
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {relation.page_number}
                    </TableCell>
                    <TableCell>
                      {getSourceBadge(relation.source_type)}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="line-clamp-2 text-sm">
                        {relation.caption || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(relation.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {relation.id}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        )}
      </CardContent>
    </Card>
  );
};

