import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2, GitBranch, ArrowUp, ArrowDown } from 'lucide-react';

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
import { quotesService, TimelineStep } from '@/services/quotes/QuotesService';
import { GlobalAdminHeader } from './GlobalAdminHeader';

export const TimelineStepsManagement: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStep, setEditingStep] = useState<TimelineStep | null>(null);

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
    resetForm();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <GlobalAdminHeader title="Timeline Steps Management" />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <GlobalAdminHeader
        title="Timeline Steps Management"
        description="Manage project timeline steps for quote tracking"
        badge="Admin"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Timeline Steps</h2>
            <p className="text-gray-600 mt-1">Define the stages of your project timeline</p>
          </div>
          <Button
            onClick={handleOpenCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Step
          </Button>


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
                  .map((step) => (
                    <TableRow key={step.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-gray-400" />
                          {step.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-700 max-w-md truncate">
                        {step.description || <span className="text-gray-400 italic">No description</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={step.is_active ? 'default' : 'secondary'}>
                          {step.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-600">{step.display_order}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled
                          >
                            <Edit2 className="h-4 w-4" />
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

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={handleCloseModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Timeline Step</DialogTitle>
            <DialogDescription>
              Create a new step for the project timeline
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Name *</label>
              <Input
                value={stepName}
                onChange={(e) => setStepName(e.target.value)}
                placeholder="e.g., Materials Ordered"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Description</label>
              <Textarea
                value={stepDescription}
                onChange={(e) => setStepDescription(e.target.value)}
                placeholder="Describe this timeline step..."
                className="mt-1"
                rows={3}
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
                onClick={handleCreateStep}
                disabled={saving || !stepName.trim()}
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
                    Create Step
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