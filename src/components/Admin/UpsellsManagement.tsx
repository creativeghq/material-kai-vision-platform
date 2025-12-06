import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, DollarSign, Loader2, Package } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { quotesService, Upsell } from '@/services/quotes/QuotesService';
import { GlobalAdminHeader } from './GlobalAdminHeader';

export const UpsellsManagement: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUpsell, setEditingUpsell] = useState<Upsell | null>(null);

  // Form state
  const [upsellName, setUpsellName] = useState('');
  const [upsellDescription, setUpsellDescription] = useState('');
  const [upsellPrice, setUpsellPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUpsells();
  }, []);

  const loadUpsells = async () => {
    try {
      setLoading(true);
      const data = await quotesService.getUpsells();
      setUpsells(data);
    } catch (error) {
      console.error('Error loading upsells:', error);
      toast({
        title: 'Error',
        description: 'Failed to load upsells',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUpsell = async () => {
    if (!upsellName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Upsell name is required',
        variant: 'destructive',
      });
      return;
    }

    const price = parseFloat(upsellPrice);
    if (isNaN(price) || price < 0) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid price',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      if (editingUpsell) {
        await quotesService.updateUpsell(editingUpsell.id, {
          name: upsellName.trim(),
          description: upsellDescription.trim() || null,
          price,
          is_active: isActive,
          display_order: parseInt(displayOrder) || 0,
        });
        toast({
          title: 'Success',
          description: 'Upsell updated successfully',
        });
      } else {
        await quotesService.createUpsell({
          name: upsellName.trim(),
          description: upsellDescription.trim() || null,
          price,
          is_active: isActive,
          display_order: parseInt(displayOrder) || 0,
        });
        toast({
          title: 'Success',
          description: 'Upsell created successfully',
        });
      }

      setShowCreateModal(false);
      resetForm();
      await loadUpsells();
    } catch (error) {
      console.error('Error saving upsell:', error);
      toast({
        title: 'Error',
        description: 'Failed to save upsell',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUpsell = async (id: string) => {
    if (!confirm('Are you sure you want to delete this upsell?')) return;

    try {
      await quotesService.deleteUpsell(id);
      toast({
        title: 'Success',
        description: 'Upsell deleted successfully',
      });
      await loadUpsells();
    } catch (error) {
      console.error('Error deleting upsell:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete upsell',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setUpsellName('');
    setUpsellDescription('');
    setUpsellPrice('');
    setIsActive(true);
    setDisplayOrder('0');
    setEditingUpsell(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const handleOpenEdit = (upsell: Upsell) => {
    setEditingUpsell(upsell);
    setUpsellName(upsell.name);
    setUpsellDescription(upsell.description || '');
    setUpsellPrice(upsell.price.toString());
    setIsActive(upsell.is_active);
    setDisplayOrder(upsell.display_order.toString());
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    resetForm();
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <GlobalAdminHeader title="Upsells Management" />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <GlobalAdminHeader
        title="Upsells Management"
        description="Manage upsell items that can be added to quotes"
        badge="Admin"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Upsell Items</h2>
            <p className="text-gray-600 mt-1">Create and manage upsell items to offer customers additional products or services</p>
          </div>
          <Button
            onClick={handleOpenCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Upsell
          </Button>
        </div>

        {/* Upsells Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Display Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upsells.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-600">
                    No upsells found. Create your first upsell to get started.
                  </TableCell>
                </TableRow>
              ) : (
                upsells
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((upsell) => (
                    <TableRow key={upsell.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-gray-400" />
                          {upsell.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-700 max-w-md truncate">
                        {upsell.description || <span className="text-gray-400 italic">No description</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 font-semibold text-green-600">
                          <DollarSign className="h-4 w-4" />
                          {formatPrice(upsell.price)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={upsell.is_active ? 'default' : 'secondary'}>
                          {upsell.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-600">{upsell.display_order}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(upsell)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUpsell(upsell.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={showCreateModal} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingUpsell ? 'Edit Upsell' : 'Create Upsell'}</DialogTitle>
            <DialogDescription>
              {editingUpsell ? 'Update the upsell details' : 'Create a new upsell item to offer customers'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Name *</label>
              <Input
                value={upsellName}
                onChange={(e) => setUpsellName(e.target.value)}
                placeholder="e.g., Express Shipping"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Description</label>
              <Textarea
                value={upsellDescription}
                onChange={(e) => setUpsellDescription(e.target.value)}
                placeholder="Describe the upsell item..."
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Price (USD) *</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={upsellPrice}
                onChange={(e) => setUpsellPrice(e.target.value)}
                placeholder="0.00"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Display Order</label>
              <Input
                type="number"
                min="0"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                placeholder="0"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Lower numbers appear first</p>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Active</label>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateUpsell}
                disabled={saving || !upsellName.trim() || !upsellPrice}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    {editingUpsell ? 'Update Upsell' : 'Create Upsell'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

