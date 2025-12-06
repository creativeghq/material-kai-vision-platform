import React, { useState, useEffect } from 'react';
import { X, GitBranch, Loader2, CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteTimeline, TimelineStep } from '@/services/quotes/QuotesService';

interface ProjectTimelineModalProps {
  quoteId: string;
  quoteName: string;
  onClose: () => void;
  isAdmin?: boolean;
}

export const ProjectTimelineModal: React.FC<ProjectTimelineModalProps> = ({
  quoteId,
  quoteName,
  onClose,
  isAdmin = false,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>([]);
  const [quoteTimeline, setQuoteTimeline] = useState<QuoteTimeline[]>([]);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string>('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTimeline();
  }, [quoteId]);

  const loadTimeline = async () => {
    try {
      setLoading(true);
      const [steps, timeline] = await Promise.all([
        quotesService.getTimelineSteps(),
        quotesService.getQuoteTimeline(quoteId),
      ]);
      setTimelineSteps(steps);
      setQuoteTimeline(timeline);
    } catch (error) {
      console.error('Error loading timeline:', error);
      toast({
        title: 'Error',
        description: 'Failed to load timeline',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditStep = (timelineEntry: QuoteTimeline) => {
    setEditingStep(timelineEntry.id);
    setEditStatus(timelineEntry.status);
    setEditNotes(timelineEntry.notes || '');
  };

  const handleSaveStep = async () => {
    if (!editingStep) return;

    try {
      setSaving(true);
      await quotesService.updateTimelineStep(editingStep, {
        status: editStatus as 'pending' | 'in_progress' | 'completed' | 'skipped',
        notes: editNotes.trim() || null,
      });
      toast({
        title: 'Success',
        description: 'Timeline step updated successfully',
      });
      setEditingStep(null);
      await loadTimeline();
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

  const handleCancelEdit = () => {
    setEditingStep(null);
    setEditStatus('');
    setEditNotes('');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-600" />;
      case 'skipped':
        return <XCircle className="h-5 w-5 text-gray-400" />;
      default:
        return <Circle className="h-5 w-5 text-gray-300" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { bg: string; text: string; border: string }> = {
      completed: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
      in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
      skipped: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
    };
    const variant = variants[status] || variants.pending;
    return (
      <Badge className={`${variant.bg} ${variant.text} ${variant.border} border`}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-end">
      <div className="bg-white h-full w-full max-w-2xl shadow-2xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Project Timeline</h2>
            <p className="text-blue-100 mt-1">{quoteName}</p>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>




        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : quoteTimeline.length === 0 ? (
            <div className="text-center py-12">
              <GitBranch className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No timeline initialized for this quote</p>
            </div>
          ) : (
            <div className="space-y-4">
              {quoteTimeline
                .sort((a, b) => {
                  const stepA = timelineSteps.find(s => s.id === a.timeline_step_id);
                  const stepB = timelineSteps.find(s => s.id === b.timeline_step_id);
                  return (stepA?.display_order || 0) - (stepB?.display_order || 0);
                })
                .map((timelineEntry, index) => {
                  const step = timelineSteps.find(s => s.id === timelineEntry.timeline_step_id);
                  if (!step) return null;

                  const isEditing = editingStep === timelineEntry.id;
                  const isLast = index === quoteTimeline.length - 1;

                  return (
                    <div key={timelineEntry.id} className="relative">
                      {/* Timeline connector line */}
                      {!isLast && (
                        <div className="absolute left-[10px] top-[40px] bottom-[-16px] w-0.5 bg-gray-200" />
                      )}

                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 relative">
                        <div className="flex items-start gap-4">
                          {/* Status Icon */}
                          <div className="flex-shrink-0 mt-1">
                            {getStatusIcon(timelineEntry.status)}
                          </div>

                          {/* Content */}
                          <div className="flex-1">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h3 className="font-semibold text-gray-900">{step.name}</h3>
                                {step.description && (
                                  <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                                )}
                              </div>
                              {getStatusBadge(timelineEntry.status)}
                            </div>

                            {isEditing && isAdmin ? (
                              <div className="space-y-3 mt-4 bg-white p-4 rounded border border-blue-200">
                                <div>
                                  <label className="text-sm font-medium text-gray-700">Status</label>
                                  <Select value={editStatus} onValueChange={setEditStatus}>
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="pending">Pending</SelectItem>
                                      <SelectItem value="in_progress">In Progress</SelectItem>
                                      <SelectItem value="completed">Completed</SelectItem>
                                      <SelectItem value="skipped">Skipped</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-700">Notes</label>
                                  <Textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    placeholder="Add notes about this step..."
                                    className="mt-1"
                                    rows={3}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    onClick={handleSaveStep}
                                    disabled={saving}
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    {saving ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                        Saving...
                                      </>
                                    ) : (
                                      'Save'
                                    )}
                                  </Button>
                                  <Button
                                    onClick={handleCancelEdit}
                                    disabled={saving}
                                    size="sm"
                                    variant="outline"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {timelineEntry.notes && (
                                  <div className="mt-3 bg-white p-3 rounded border border-gray-200">
                                    <p className="text-sm text-gray-700">{timelineEntry.notes}</p>
                                  </div>
                                )}
                                {timelineEntry.completed_at && (
                                  <p className="text-xs text-gray-500 mt-2">
                                    Completed: {new Date(timelineEntry.completed_at).toLocaleDateString()}
                                  </p>
                                )}
                                {isAdmin && (
                                  <Button
                                    onClick={() => handleEditStep(timelineEntry)}
                                    size="sm"
                                    variant="outline"
                                    className="mt-3"
                                  >
                                    Edit Step
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};