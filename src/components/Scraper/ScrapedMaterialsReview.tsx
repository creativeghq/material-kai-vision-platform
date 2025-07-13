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
  ExternalLink 
} from 'lucide-react';

interface ScrapedMaterialTemp {
  id: string;
  material_data: any;
  source_url: string;
  scraped_at: string;
  reviewed: boolean;
  approved: boolean | null;
  notes: string | null;
  scraping_session_id: string;
}

interface ScrapedMaterialsReviewProps {
  sessionId?: string | null;
}

export const ScrapedMaterialsReview = ({ sessionId }: ScrapedMaterialsReviewProps) => {
  const { toast } = useToast();
  const [materials, setMaterials] = useState<ScrapedMaterialTemp[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'approve' | 'reject' | 'delete' | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadMaterialsBySession(sessionId);
    } else {
      loadAllUnreviewedMaterials();
    }
  }, [sessionId]);

  const loadMaterialsBySession = async (sessionId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scraped_materials_temp')
        .select('*')
        .eq('scraping_session_id', sessionId)
        .order('scraped_at', { ascending: false });

      if (error) throw error;
      setMaterials(data || []);
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
    try {
      const { data, error } = await supabase
        .from('scraped_materials_temp')
        .select('*')
        .eq('reviewed', false)
        .order('scraped_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setMaterials(data || []);
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

  const approvedCount = materials.filter(m => m.approved === true).length;
  const rejectedCount = materials.filter(m => m.approved === false).length;
  const unreviewedCount = materials.filter(m => !m.reviewed).length;

  if (loading && materials.length === 0) {
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
    <div className="space-y-6">
      {/* Summary Stats */}
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

      {/* Bulk Actions */}
      {selectedMaterials.size > 0 && (
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

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button
          onClick={addApprovedToCatalog}
          disabled={loading || approvedCount === 0}
          className="flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Add {approvedCount} Approved to Catalog
        </Button>
        <Button
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Refresh
        </Button>
      </div>

      {/* Materials List */}
      <div className="grid gap-4">
        {materials.map((material) => (
          <MaterialReviewCard
            key={material.id}
            material={material}
            isSelected={selectedMaterials.has(material.id)}
            onToggleSelection={() => toggleMaterialSelection(material.id)}
            onUpdateReview={updateMaterialReview}
            onDelete={deleteMaterial}
          />
        ))}
      </div>

      {materials.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No materials to review</h3>
            <p className="text-muted-foreground">
              {sessionId 
                ? "No materials found for this scraping session"
                : "No unreviewed materials found. Try scraping some websites first."
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

interface MaterialReviewCardProps {
  material: ScrapedMaterialTemp;
  isSelected: boolean;
  onToggleSelection: () => void;
  onUpdateReview: (id: string, approved: boolean | null, notes?: string) => void;
  onDelete: (id: string) => void;
}

const MaterialReviewCard = ({ 
  material, 
  isSelected, 
  onToggleSelection, 
  onUpdateReview, 
  onDelete 
}: MaterialReviewCardProps) => {
  const [notes, setNotes] = useState(material.notes || '');
  const materialData = material.material_data;

  const getStatusBadge = () => {
    if (!material.reviewed) {
      return <Badge variant="secondary">Unreviewed</Badge>;
    }
    if (material.approved === true) {
      return <Badge variant="default" className="bg-green-600">Approved</Badge>;
    }
    if (material.approved === false) {
      return <Badge variant="destructive">Rejected</Badge>;
    }
    return <Badge variant="outline">Reviewed</Badge>;
  };

  return (
    <Card className={`${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggleSelection}
            />
            <div className="flex-1">
              <CardTitle className="text-lg">{materialData.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {getStatusBadge()}
                <Badge variant="outline">{materialData.category || 'Uncategorized'}</Badge>
                {materialData.price && (
                  <Badge variant="outline">{materialData.price}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {new Date(material.scraped_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Material Info */}
        <div className="space-y-2">
          {materialData.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {materialData.description}
            </p>
          )}
          
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <a 
              href={materialData.sourceUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {materialData.sourceUrl}
            </a>
          </div>
          
          {materialData.supplier && (
            <p className="text-sm">
              <span className="font-medium">Supplier:</span> {materialData.supplier}
            </p>
          )}
        </div>

        {/* Images */}
        {materialData.images && materialData.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {materialData.images.slice(0, 3).map((img: string, idx: number) => (
              <img
                key={idx}
                src={img}
                alt={`${materialData.name} ${idx + 1}`}
                className="w-16 h-16 object-cover rounded border"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ))}
          </div>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Review Notes</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this material..."
            className="min-h-[60px]"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateReview(material.id, true, notes)}
            disabled={material.approved === true}
            className="text-green-600"
          >
            <Check className="h-4 w-4 mr-1" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateReview(material.id, false, notes)}
            disabled={material.approved === false}
            className="text-red-600"
          >
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onUpdateReview(material.id, null, notes)}
            disabled={material.reviewed && material.approved === null}
          >
            <Eye className="h-4 w-4 mr-1" />
            Mark Reviewed
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(material.id)}
            className="text-destructive ml-auto"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};