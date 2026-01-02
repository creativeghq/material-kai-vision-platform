import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, DollarSign, Loader2, Package, ArrowUp, ArrowDown, Users } from 'lucide-react';

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { quotesService, Upsell } from '@/services/quotes/QuotesService';
import { GlobalAdminHeader } from './GlobalAdminHeader';

interface UpsellsManagementProps {
  embedded?: boolean;
}

export const UpsellsManagement: React.FC<UpsellsManagementProps> = ({ embedded = false }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUpsell, setEditingUpsell] = useState<Upsell | null>(null);
  const [deletingUpsell, setDeletingUpsell] = useState<Upsell | null>(null);
  const [reordering, setReordering] = useState(false);

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

      // Load usage counts for each upsell
      const counts: Record<string, number> = {};
      await Promise.all(
        data.map(async (upsell) => {
          try {
            const count = await quotesService.getUpsellUsageCount(upsell.id);
            counts[upsell.id] = count;
          } catch {
            counts[upsell.id] = 0;
          }
        }),
      );
      setUsageCounts(counts);
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

  const handleMoveUpsell = async (upsellId: string, direction: 'up' | 'down') => {
    const sortedUpsells = [...upsells].sort((a, b) => a.display_order - b.display_order);
    const currentIndex = sortedUpsells.findIndex(u => u.id === upsellId);

    if (
      (direction === 'up' && currentIndex === 0) ||
      (direction === 'down' && currentIndex === sortedUpsells.length - 1)
    ) {
      return;
    }

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const newOrder = [...sortedUpsells];
    const [movedUpsell] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, movedUpsell);

    try {
      setReordering(true);
      await quotesService.reorderUpsells(newOrder.map(u => u.id));
      await loadUpsells();
    } catch (error) {
      console.error('Error reordering upsells:', error);
      toast({
        title: 'Error',
        description: 'Failed to reorder upsells',
        variant: 'destructive',
      });
    } finally {
      setReordering(false);
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

  const handleDeleteUpsell = async () => {
    if (!deletingUpsell) return;

    try {
      setSaving(true);
      await quotesService.deleteUpsell(deletingUpsell.id);
      toast({
        title: 'Success',
        description: 'Upsell deleted successfully',
      });
      setDeletingUpsell(null);
      await loadUpsells();
    } catch (error) {
      console.error('Error deleting upsell:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete upsell',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
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
    if (embedded) {
      return (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader title="Upsells Management" />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Embedded mode for Sheet panels
  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {upsells.length} upsell{upsells.length !== 1 ? 's' : ''} defined
          </p>
          <Button onClick={handleOpenCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Upsell
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {upsells.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No upsells yet
                  </TableCell>
                </TableRow>
              ) : (
                upsells
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((upsell, index, sortedArray) => (
                    <TableRow key={upsell.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              disabled={index === 0 || reordering}
                              onClick={() => handleMoveUpsell(upsell.id, 'up')}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              disabled={index === sortedArray.length - 1 || reordering}
                              onClick={() => handleMoveUpsell(upsell.id, 'down')}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="font-medium">{upsell.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatPrice(upsell.price)}</TableCell>
                      <TableCell>
                        <Badge variant={upsell.is_active ? 'default' : 'secondary'}>
                          {upsell.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(upsell)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeletingUpsell(upsell)}>
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

        {/* Create/Edit Modal */}
        <Dialog open={showCreateModal} onOpenChange={handleCloseModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingUpsell ? 'Edit Upsell' : 'Create Upsell'}</DialogTitle>
              <DialogDescription>
                {editingUpsell ? 'Update the upsell details' : 'Create a new upsell item'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name *</label>
                <Input value={upsellName} onChange={(e) => setUpsellName(e.target.value)} placeholder="e.g., Express Shipping" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea value={upsellDescription} onChange={(e) => setUpsellDescription(e.target.value)} placeholder="Describe this upsell..." className="mt-1" rows={3} />
              </div>
              <div>
                <label className="text-sm font-medium">Price *</label>
                <Input type="number" step="0.01" min="0" value={upsellPrice} onChange={(e) => setUpsellPrice(e.target.value)} placeholder="0.00" className="mt-1" />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Active</label>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
                <Button onClick={editingUpsell ? handleUpdateUpsell : handleCreateUpsell} disabled={saving || !upsellName.trim() || !upsellPrice}>
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : editingUpsell ? 'Save Changes' : 'Create Upsell'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deletingUpsell} onOpenChange={() => setDeletingUpsell(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Upsell</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingUpsell?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteUpsell} className="bg-red-600 hover:bg-red-700 text-white">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Upsells Management"
        description="Manage upsell items that can be added to quotes"
        badge="Admin"
      />

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
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
        <TooltipProvider>
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
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
                    .map((upsell, index, sortedArray) => (
                      <TableRow key={upsell.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                disabled={index === 0 || reordering}
                                onClick={() => handleMoveUpsell(upsell.id, 'up')}
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                disabled={index === sortedArray.length - 1 || reordering}
                                onClick={() => handleMoveUpsell(upsell.id, 'down')}
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                            </div>
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
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 text-gray-600">
                                <Users className="h-4 w-4" />
                                <span>{usageCounts[upsell.id] || 0}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Used in {usageCounts[upsell.id] || 0} quote(s)</p>
                            </TooltipContent>
                          </Tooltip>
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
                              onClick={() => setDeletingUpsell(upsell)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingUpsell} onOpenChange={() => setDeletingUpsell(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Upsell</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingUpsell?.name}"?
              {(usageCounts[deletingUpsell?.id || ''] || 0) > 0 && (
                <span className="block mt-2 text-amber-600">
                  Warning: This upsell is currently used in {usageCounts[deletingUpsell?.id || '']} quote(s).
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUpsell}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
