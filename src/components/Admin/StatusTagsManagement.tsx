import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Tag, Loader2 } from 'lucide-react';

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
import { useToast } from '@/hooks/use-toast';
import { quotesService, StatusTag } from '@/services/quotes/QuotesService';
import { GlobalAdminHeader } from './GlobalAdminHeader';

export const StatusTagsManagement: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [statusTags, setStatusTags] = useState<StatusTag[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTag, setEditingTag] = useState<StatusTag | null>(null);

  // Form state
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#3B82F6');
  const [tagDescription, setTagDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadStatusTags();
  }, []);

  const loadStatusTags = async () => {
    try {
      setLoading(true);
      const tags = await quotesService.getStatusTags();
      setStatusTags(tags);
    } catch (error) {
      console.error('Error loading status tags:', error);
      toast({
        title: 'Error',
        description: 'Failed to load status tags',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTag = async () => {
    if (!tagName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Tag name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      await quotesService.createStatusTag({
        name: tagName.trim(),
        color: tagColor,
        description: tagDescription.trim() || null,
      });

      toast({
        title: 'Success',
        description: 'Status tag created successfully',
      });

      setShowCreateModal(false);
      resetForm();
      await loadStatusTags();
    } catch (error) {
      console.error('Error creating status tag:', error);
      toast({
        title: 'Error',
        description: 'Failed to create status tag',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTagName('');
    setTagColor('#3B82F6');
    setTagDescription('');
    setEditingTag(null);
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
      <div className="min-h-screen">
        <GlobalAdminHeader title="Status Tags Management" />
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Status Tags Management"
        description="Manage custom status tags for quote requests"
        badge="Admin"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Status Tags</h2>
            <p className="text-gray-600 mt-1">Create and manage custom status tags for organizing quotes</p>
          </div>
          <Button
            onClick={handleOpenCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Status Tag
          </Button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag Name</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statusTags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-600">
                    No status tags found. Create your first tag to get started.
                  </TableCell>
                </TableRow>
              ) : (
                statusTags.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-gray-400" />
                        {tag.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border border-gray-300"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm text-gray-600">{tag.color}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {tag.description || <span className="text-gray-400 italic">No description</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tag.is_system ? 'secondary' : 'outline'}>
                        {tag.is_system ? 'System' : 'Custom'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={tag.is_system}
                          title={tag.is_system ? 'System tags cannot be edited' : 'Edit tag'}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={tag.is_system}
                          title={tag.is_system ? 'System tags cannot be deleted' : 'Delete tag'}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? 'Edit Status Tag' : 'Create Status Tag'}</DialogTitle>
            <DialogDescription>
              {editingTag ? 'Update the status tag details' : 'Create a new custom status tag for organizing quotes'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Tag Name *</label>
              <Input
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="e.g., Awaiting Approval"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Color *</label>
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="color"
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  className="h-10 w-20 rounded border border-gray-300 cursor-pointer"
                />
                <Input
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  placeholder="#3B82F6"
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Description (Optional)</label>
              <Textarea
                value={tagDescription}
                onChange={(e) => setTagDescription(e.target.value)}
                placeholder="Describe when to use this tag..."
                className="mt-1"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateTag}
                disabled={saving || !tagName.trim()}
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
                    {editingTag ? 'Update Tag' : 'Create Tag'}
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
