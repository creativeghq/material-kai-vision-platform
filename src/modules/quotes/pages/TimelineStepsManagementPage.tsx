import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2, GitBranch, ArrowUp, ArrowDown, Save } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { statusTone } from '@/utils/statusTone';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/core/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { quotesService, TimelineStep } from '../services/QuotesService';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { SectionHeader } from '@/components/shared/SectionHeader';

interface TimelineStepsManagementProps {
  embedded?: boolean;
}

export const TimelineStepsManagement: React.FC<TimelineStepsManagementProps> = ({ embedded = false }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStep, setEditingStep] = useState<TimelineStep | null>(null);
  const [deletingStep, setDeletingStep] = useState<TimelineStep | null>(null);
  const [reordering, setReordering] = useState(false);

  // Form state
  const [stepName, setStepName] = useState('');
  const [stepDescription, setStepDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTimelineSteps();
  }, []);

  const loadTimelineSteps = async () => {
    try {
      setLoading(true);
      const data = await quotesService.getTimelineSteps();
      setTimelineSteps(data);
    } catch (error) {
      console.error('Error loading timeline steps:', error);
      toast({
        title: 'Error',
        description: 'Failed to load timeline steps',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStep = async () => {
    if (!stepName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Step name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      await quotesService.createTimelineStep({
        name: stepName.trim(),
        description: stepDescription.trim() || null,
        is_active: isActive,
        display_order: parseInt(displayOrder) || 0,
      });
      toast({
        title: 'Success',
        description: 'Timeline step created successfully',
      });
      setShowCreateModal(false);
      resetForm();
      await loadTimelineSteps();
    } catch (error) {
      console.error('Error creating timeline step:', error);
      toast({
        title: 'Error',
        description: 'Failed to create timeline step',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setStepName('');
    setStepDescription('');
    setIsActive(true);
    setDisplayOrder('0');
    setEditingStep(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    resetForm();
  };

  const handleOpenEdit = (step: TimelineStep) => {
    setEditingStep(step);
    setStepName(step.name);
    setStepDescription(step.description || '');
    setIsActive(step.is_active);
    setDisplayOrder(step.display_order.toString());
    setShowEditModal(true);
  };

  const handleUpdateStep = async () => {
    if (!editingStep || !stepName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Step name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      await quotesService.updateTimelineStepDefinition(editingStep.id, {
        name: stepName.trim(),
        description: stepDescription.trim() || undefined,
        is_active: isActive,
        display_order: parseInt(displayOrder) || 0,
      });
      toast({
        title: 'Success',
        description: 'Timeline step updated successfully',
      });
      setShowEditModal(false);
      resetForm();
      await loadTimelineSteps();
    } catch (error) {
      console.error('Error updating timeline step:', error);
      toast({
        title: 'Error',
        description: 'Failed to update timeline step',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStep = async () => {
    if (!deletingStep) return;

    try {
      setSaving(true);
      await quotesService.deleteTimelineStepDefinition(deletingStep.id);
      toast({
        title: 'Success',
        description: 'Timeline step deleted successfully',
      });
      setDeletingStep(null);
      await loadTimelineSteps();
    } catch (error) {
      console.error('Error deleting timeline step:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete timeline step',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMoveStep = async (stepId: string, direction: 'up' | 'down') => {
    const sortedSteps = [...timelineSteps].sort((a, b) => a.display_order - b.display_order);
    const currentIndex = sortedSteps.findIndex(s => s.id === stepId);

    if (
      (direction === 'up' && currentIndex === 0) ||
      (direction === 'down' && currentIndex === sortedSteps.length - 1)
    ) {
      return;
    }

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const newOrder = [...sortedSteps];
    const [movedStep] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, movedStep);

    try {
      setReordering(true);
      await quotesService.reorderTimelineSteps(newOrder.map(s => s.id));
      await loadTimelineSteps();
    } catch (error) {
      console.error('Error reordering steps:', error);
      toast({
        title: 'Error',
        description: 'Failed to reorder steps',
        variant: 'destructive',
      });
    } finally {
      setReordering(false);
    }
  };

  // Render helpers for modals (shared between embedded and full modes)
  const renderCreateModal = () => (
    <Dialog open={showCreateModal} onOpenChange={handleCloseModal}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Timeline Step</DialogTitle>
          <DialogDescription>Create a new step for the project timeline</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="timelinestepsmanagementpage-name" className="text-sm font-medium">Name *</label>
            <Input id="timelinestepsmanagementpage-name" value={stepName} onChange={(e) => setStepName(e.target.value)} placeholder="e.g., Materials Ordered" className="mt-1" />
          </div>
          <div>
            <label htmlFor="timelinestepsmanagementpage-description" className="text-sm font-medium">Description</label>
            <Textarea id="timelinestepsmanagementpage-description" value={stepDescription} onChange={(e) => setStepDescription(e.target.value)} placeholder="Describe this timeline step..." className="mt-1" rows={3} />
          </div>
          <div>
            <label htmlFor="timelinestepsmanagementpage-display-order" className="text-sm font-medium">Display Order</label>
            <Input id="timelinestepsmanagementpage-display-order" type="number" min="0" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} placeholder="0" className="mt-1" />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Active</label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
            <Button onClick={handleCreateStep} disabled={saving || !stepName.trim()}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Plus className="h-4 w-4 mr-2" />Create Step</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderEditModal = () => (
    <Dialog open={showEditModal} onOpenChange={handleCloseModal}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Timeline Step</DialogTitle>
          <DialogDescription>Update the timeline step details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label htmlFor="timelinestepsmanagementpage-name-2" className="text-sm font-medium">Name *</label>
            <Input id="timelinestepsmanagementpage-name-2" value={stepName} onChange={(e) => setStepName(e.target.value)} placeholder="e.g., Materials Ordered" className="mt-1" />
          </div>
          <div>
            <label htmlFor="timelinestepsmanagementpage-description-2" className="text-sm font-medium">Description</label>
            <Textarea id="timelinestepsmanagementpage-description-2" value={stepDescription} onChange={(e) => setStepDescription(e.target.value)} placeholder="Describe this timeline step..." className="mt-1" rows={3} />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Active</label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleCloseModal}>Cancel</Button>
            <Button onClick={handleUpdateStep} disabled={saving || !stepName.trim()}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Changes</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderDeleteDialog = () => (
    <AlertDialog open={!!deletingStep} onOpenChange={() => setDeletingStep(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Timeline Step</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{deletingStep?.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteStep} className="bg-red-600 hover:bg-red-700 text-white">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

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
        <GlobalAdminHeader title="Timeline Steps Management" />
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
            {timelineSteps.length} timeline step{timelineSteps.length !== 1 ? 's' : ''} defined
          </p>
          <Button onClick={handleOpenCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add step
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timelineSteps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No timeline steps yet
                  </TableCell>
                </TableRow>
              ) : (
                timelineSteps
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((step, index, sortedArray) => (
                    <TableRow key={step.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              disabled={index === 0 || reordering}
                              onClick={() => handleMoveStep(step.id, 'up')}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              disabled={index === sortedArray.length - 1 || reordering}
                              onClick={() => handleMoveStep(step.id, 'down')}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="font-medium">{step.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs capitalize ${statusTone(step.is_active ? 'active' : 'inactive')}`}>
                          {step.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(step)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeletingStep(step)}>
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

        {/* Modals */}
        {renderCreateModal()}
        {renderEditModal()}
        {renderDeleteDialog()}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Timeline Steps Management"
        description="Manage project timeline steps for quote tracking"
        badge="Admin"
      />

      <div className="p-3 sm:p-6 space-y-6">
        <SectionHeader
          title="Timeline Steps"
          subtitle="Define the stages of your project timeline"
          actions={
            <Button
              onClick={handleOpenCreate}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create step
            </Button>
          }
        />

        {/* Timeline Steps Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Display Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timelineSteps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-600">
                    No timeline steps found. Create your first step to get started.
                  </TableCell>
                </TableRow>
              ) : (
                timelineSteps
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((step, index, sortedArray) => (
                    <TableRow key={step.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              disabled={index === 0 || reordering}
                              onClick={() => handleMoveStep(step.id, 'up')}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              disabled={index === sortedArray.length - 1 || reordering}
                              onClick={() => handleMoveStep(step.id, 'down')}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                          <GitBranch className="h-4 w-4 text-gray-400" />
                          {step.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-700 max-w-md truncate">
                        {step.description || <span className="text-gray-400 italic">No description</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs capitalize ${statusTone(step.is_active ? 'active' : 'inactive')}`}>
                          {step.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-600">{step.display_order}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(step)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingStep(step)}
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
      </div>

      {/* Modals */}
      {renderCreateModal()}
      {renderEditModal()}
      {renderDeleteDialog()}
    </div>
  );
};
