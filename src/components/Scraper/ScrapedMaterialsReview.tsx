import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Check, 
  X, 
  Eye, 
  Trash2, 
  Download, 
  Loader2,
  Clock,
  ExternalLink,
  Search,
  AlertCircle
} from 'lucide-react';

interface ScrapedMaterial {
  name: string;
  description?: string;
  category?: string;
  price?: string;
  images: string[];
  properties: Record<string, any>;
  sourceUrl: string;
  supplier?: string;
}

interface ScrapedMaterialTemp {
  id: string;
  material_data: any; // Use any since it comes from database as Json type
  source_url: string;
  scraped_at: string;
  reviewed: boolean;
  approved: boolean | null;
  notes: string | null;
  scraping_session_id: string;
}

interface ScrapedMaterialsReviewProps {
  sessionId?: string | null;
  currentResults?: ScrapedMaterial[];
  onMaterialsUpdate?: (materials: ScrapedMaterial[]) => void;
  onAddAllToCatalog?: () => void;
  isLoading?: boolean;
}

export const ScrapedMaterialsReview: React.FC<ScrapedMaterialsReviewProps> = ({
  sessionId,
  currentResults = [],
  onMaterialsUpdate,
  onAddAllToCatalog,
  isLoading = false
}) => {
  const { toast } = useToast();
  const [materials, setMaterials] = useState<ScrapedMaterialTemp[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | 'delete' | null>(null);

  useEffect(() => {
    if (sessionId && currentResults.length === 0) {
      loadMaterialsBySession(sessionId);
    } else if (currentResults.length === 0) {
      loadAllUnreviewedMaterials();
    }
  }, [sessionId, currentResults.length]);

  const loadMaterialsBySession = async (sessionId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scraped_materials_temp')
        .select('*')
        .eq('scraping_session_id', sessionId)
        .order('scraped_at', { ascending: false });

      if (error) throw error;
      setMaterials((data || []) as ScrapedMaterialTemp[]);
      console.log('Loaded materials by session:', sessionId, 'Count:', data?.length || 0);
    } catch (error) {
      console.error('Error loading materials by session:', error);
      toast({
        title: "Error",
        description: "Failed to load scraped materials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAllUnreviewedMaterials = async () => {
    setLoading(true);
    console.log('Loading all unreviewed materials...');
    try {
      const { data, error } = await supabase
        .from('scraped_materials_temp')
        .select('*')
        .eq('reviewed', false)
        .order('scraped_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setMaterials((data || []) as ScrapedMaterialTemp[]);
      console.log('Loaded unreviewed materials count:', data?.length || 0);
    } catch (error) {
      console.error('Error loading unreviewed materials:', error);
      toast({
        title: "Error",
        description: "Failed to load unreviewed materials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateMaterialReview = async (
    materialId: string, 
    approved: boolean | null, 
    notes?: string
  ) => {
    try {
      const { error } = await supabase
        .from('scraped_materials_temp')
        .update({
          reviewed: true,
          approved: approved,
          notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', materialId);

      if (error) throw error;

      // Update local state
      setMaterials(prev => prev.map(material => 
        material.id === materialId 
          ? { ...material, reviewed: true, approved, notes: notes || null }
          : material
      ));

      toast({
        title: "Success",
        description: `Material ${approved === true ? 'approved' : approved === false ? 'rejected' : 'reviewed'}`,
      });
    } catch (error) {
      console.error('Error updating material review:', error);
      toast({
        title: "Error",
        description: "Failed to update material review",
        variant: "destructive",
      });
    }
  };

  const deleteMaterial = async (materialId: string) => {
    try {
      const { error } = await supabase
        .from('scraped_materials_temp')
        .delete()
        .eq('id', materialId);

      if (error) throw error;

      setMaterials(prev => prev.filter(material => material.id !== materialId));
      setSelectedMaterials(prev => {
        const newSet = new Set(prev);
        newSet.delete(materialId);
        return newSet;
      });

      toast({
        title: "Success",
        description: "Material deleted",
      });
    } catch (error) {
      console.error('Error deleting material:', error);
      toast({
        title: "Error",
        description: "Failed to delete material",
        variant: "destructive",
      });
    }
  };

  const addApprovedToCatalog = async () => {
    const approvedMaterials = materials.filter(m => m.approved === true);
    if (approvedMaterials.length === 0) {
      toast({
        title: "No approved materials",
        description: "Please approve some materials before adding to catalog",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      let successCount = 0;
      
      for (const material of approvedMaterials) {
        const materialData = material.material_data;
        
        try {
          const { error } = await supabase.from('materials_catalog').insert({
            name: materialData.name,
            description: materialData.description || 'Scraped and reviewed material',
            category: (materialData.category?.toLowerCase() as any) || 'other',
            properties: {
              ...materialData.properties,
              price: materialData.price,
              images: materialData.images || [],
              sourceUrl: materialData.sourceUrl,
              supplier: materialData.supplier,
              scrapedAt: material.scraped_at,
              reviewedAt: new Date().toISOString(),
              notes: material.notes
            },
            thumbnail_url: materialData.images?.[0] || null
          });
          
          if (!error) {
            successCount++;
            // Mark as processed by deleting from temp table
            await supabase
              .from('scraped_materials_temp')
              .delete()
              .eq('id', material.id);
          }
        } catch (err) {
          console.error('Failed to add material to catalog:', materialData.name, err);
        }
      }

      // Update local state to remove added materials
      setMaterials(prev => prev.filter(m => m.approved !== true));
      setSelectedMaterials(new Set());

      toast({
        title: "Success",
        description: `Added ${successCount} approved materials to catalog`,
      });
    } catch (error) {
      console.error('Error adding to catalog:', error);
      toast({
        title: "Error",
        description: "Failed to add materials to catalog",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedMaterials.size === 0) return;

    const selectedIds = Array.from(selectedMaterials);
    
    try {
      switch (bulkAction) {
        case 'approve':
          for (const id of selectedIds) {
            await updateMaterialReview(id, true);
          }
          break;
        case 'reject':
          for (const id of selectedIds) {
            await updateMaterialReview(id, false);
          }
          break;
        case 'delete':
          for (const id of selectedIds) {
            await deleteMaterial(id);
          }
          break;
      }
      
      setSelectedMaterials(new Set());
      setBulkAction(null);
    } catch (error) {
      console.error('Bulk action error:', error);
    }
  };

  const toggleMaterialSelection = (materialId: string) => {
    setSelectedMaterials(prev => {
      const newSet = new Set(prev);
      if (newSet.has(materialId)) {
        newSet.delete(materialId);
      } else {
        newSet.add(materialId);
      }
      return newSet;
    });
  };

  // Show current results first if available, otherwise show stored materials
  const displayMaterials = currentResults.length > 0 ? currentResults : materials;
  const showCurrentResults = currentResults.length > 0;

  const approvedCount = materials.filter(m => m.approved === true).length;
  const rejectedCount = materials.filter(m => m.approved === false).length;
  const unreviewedCount = materials.filter(m => !m.reviewed).length;

  if (loading && materials.length === 0 && currentResults.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading materials for review...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          {showCurrentResults ? `Current Results (${currentResults.length})` : `Review Materials (${materials.length})`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {showCurrentResults && onAddAllToCatalog && (
              <Button
                onClick={onAddAllToCatalog}
                disabled={isLoading}
                size="sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>Add All to Catalog</>
                )}
              </Button>
            )}
            
            <Button
              onClick={loadAllUnreviewedMaterials}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>Load Stored Materials</>
              )}
            </Button>
            
            {sessionId && (
              <Button
                onClick={() => loadMaterialsBySession(sessionId)}
                disabled={loading}
                variant="outline"
                size="sm"
              >
                Load Current Session
              </Button>
            )}

            {!showCurrentResults && materials.length > 0 && (
              <Button
                onClick={addApprovedToCatalog}
                disabled={loading || approvedCount === 0}
                size="sm"
                variant="outline"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Add {approvedCount} Approved to Catalog
              </Button>
            )}
          </div>

          {/* Summary Stats for stored materials */}
          {!showCurrentResults && materials.length > 0 && (
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{materials.length}</div>
                  <div className="text-sm text-muted-foreground">Total Materials</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
                  <div className="text-sm text-muted-foreground">Approved</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
                  <div className="text-sm text-muted-foreground">Rejected</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-orange-600">{unreviewedCount}</div>
                  <div className="text-sm text-muted-foreground">Unreviewed</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Bulk Actions for stored materials */}
          {!showCurrentResults && selectedMaterials.size > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm">
                    {selectedMaterials.size} material(s) selected
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBulkAction('approve')}
                      className="text-green-600"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve Selected
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBulkAction('reject')}
                      className="text-red-600"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject Selected
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBulkAction('delete')}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete Selected
                    </Button>
                  </div>
                  {bulkAction && (
                    <Button
                      size="sm"
                      onClick={handleBulkAction}
                      disabled={loading}
                    >
                      Confirm {bulkAction}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {displayMaterials.length > 0 ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {showCurrentResults 
                    ? `Current results: ${currentResults.length} materials`
                    : `Found ${materials.length} stored materials for review`
                  }
                </p>
              </div>
              
              <div className="grid gap-4">
                {displayMaterials.map((material, index) => {
                  // Handle both current results and stored materials formats
                  const materialData = material.material_data || material;
                  const isStored = !!material.id;
                  
                  return (
                    <div key={material.id || index} className="p-4 border rounded-lg space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3">
                          {isStored && (
                            <Checkbox
                              checked={selectedMaterials.has(material.id)}
                              onCheckedChange={() => toggleMaterialSelection(material.id)}
                            />
                          )}
                          <div className="flex-1">
                            <h3 className="font-medium">{materialData.name}</h3>
                            <p className="text-sm text-muted-foreground">{materialData.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Source: {material.source_url || materialData.sourceUrl}
                            </p>
                            {materialData.price && (
                              <p className="text-sm font-medium text-green-600">{materialData.price}</p>
                            )}
                          </div>
                        </div>
                        
                        {isStored && (
                          <div className="flex gap-2 ml-4">
                            <Button
                              onClick={() => updateMaterialReview(material.id, true)}
                              disabled={loading}
                              size="sm"
                              variant="outline"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              onClick={() => updateMaterialReview(material.id, false)}
                              disabled={loading}
                              size="sm"
                              variant="destructive"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {materialData.properties && (
                        <div className="text-xs bg-muted p-2 rounded">
                          <strong>Properties:</strong> {JSON.stringify(materialData.properties, null, 2)}
                        </div>
                      )}

                      {isStored && material.reviewed && (
                        <div className="flex items-center gap-2">
                          {material.approved === true && <Badge className="bg-green-600">Approved</Badge>}
                          {material.approved === false && <Badge variant="destructive">Rejected</Badge>}
                          {material.notes && (
                            <span className="text-xs text-muted-foreground">Notes: {material.notes}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No materials to review. Run a scrape to see results here.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};