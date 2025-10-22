/**
 * Human Review Panel Component
 * 
 * Admin interface for managing human-in-the-loop quality control tasks.
 * Provides workflow management for reviewing AI-generated content that
 * falls below quality thresholds.
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  User, 
  Eye,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  ArrowUp
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

import { QualityControlService, HumanReviewTask, QualityAssessment } from '@/services/qualityControlService';

interface HumanReviewPanelProps {
  workspaceId?: string;
  refreshInterval?: number;
}

export const HumanReviewPanel: React.FC<HumanReviewPanelProps> = ({
  workspaceId,
  refreshInterval = 30000, // 30 seconds
}) => {
  const [reviewTasks, setReviewTasks] = useState<HumanReviewTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<HumanReviewTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState({
    pending: 0,
    completed: 0,
    escalated: 0,
    avgCompletionTime: 0,
  });

  const { toast } = useToast();

  // Load review tasks
  const loadReviewTasks = async () => {
    try {
      setLoading(true);
      const tasks = await QualityControlService.getPendingReviewTasks({
        limit: 50,
      });
      setReviewTasks(tasks);

      // Calculate stats
      const pending = tasks.filter(t => t.status === 'pending').length;
      const completed = tasks.filter(t => t.status === 'completed').length;
      const escalated = tasks.filter(t => t.status === 'escalated').length;

      setStats({
        pending,
        completed,
        escalated,
        avgCompletionTime: 0, // TODO: Calculate from completed tasks
      });

    } catch (error) {
      console.error('Failed to load review tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to load review tasks',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle review decision
  const handleReviewDecision = async (
    decision: 'approve' | 'reject' | 'needs_improvement' | 'escalate'
  ) => {
    if (!selectedTask) return;

    try {
      setSubmitting(true);
      await QualityControlService.completeReviewTask(
        selectedTask.id,
        decision,
        reviewNotes,
        'current-user' // TODO: Get actual user ID
      );

      toast({
        title: 'Review Completed',
        description: `Task ${decision}d successfully`,
      });

      // Refresh tasks
      await loadReviewTasks();
      setSelectedTask(null);
      setReviewNotes('');

    } catch (error) {
      console.error('Failed to complete review:', error);
      toast({
        title: 'Error',
        description: 'Failed to complete review',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Get priority badge color
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge variant="destructive" className="flex items-center gap-1">
          <ArrowUp className="h-3 w-3" />
          Urgent
        </Badge>;
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'medium':
        return <Badge variant="secondary">Medium</Badge>;
      case 'low':
        return <Badge variant="outline">Low</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  // Get entity type icon
  const getEntityTypeIcon = (entityType: string) => {
    switch (entityType) {
      case 'product':
        return '📦';
      case 'chunk':
        return '📄';
      case 'image':
        return '🖼️';
      default:
        return '❓';
    }
  };

  // Get quality score color
  const getQualityScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  useEffect(() => {
    loadReviewTasks();
    
    // Set up auto-refresh
    const interval = setInterval(loadReviewTasks, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Human Review Queue</h2>
          <p className="text-muted-foreground">
            Review AI-generated content that requires human validation
          </p>
        </div>
        <Button onClick={loadReviewTasks} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Tasks awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">Tasks completed today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Escalated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.escalated}</div>
            <p className="text-xs text-muted-foreground">Tasks requiring attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Avg Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgCompletionTime}m</div>
            <p className="text-xs text-muted-foreground">Average completion time</p>
          </CardContent>
        </Card>
      </div>

      {/* Review Tasks Table */}
      <Card>
        <CardHeader>
          <CardTitle>Review Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading review tasks...</div>
          ) : reviewTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No pending review tasks
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Quality Score</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="flex items-center gap-2">
                      <span className="text-lg">
                        {getEntityTypeIcon(task.entityType)}
                      </span>
                      <span className="font-mono text-sm">
                        {task.entityId.slice(0, 8)}...
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{task.reviewType}</Badge>
                    </TableCell>
                    <TableCell>
                      {getPriorityBadge(task.priority)}
                    </TableCell>
                    <TableCell>
                      <span className={getQualityScoreColor(task.qualityAssessment.overallScore)}>
                        {(task.qualityAssessment.overallScore * 100).toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span>{task.qualityAssessment.issues.length}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(task.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedTask(task)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Review
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>
                              Review {task.entityType} - {task.reviewType}
                            </DialogTitle>
                          </DialogHeader>
                          
                          {selectedTask && (
                            <div className="space-y-6">
                              {/* Quality Assessment */}
                              <div>
                                <h3 className="font-semibold mb-2">Quality Assessment</h3>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm text-muted-foreground">Overall Score</p>
                                    <p className={`text-lg font-bold ${getQualityScoreColor(selectedTask.qualityAssessment.overallScore)}`}>
                                      {(selectedTask.qualityAssessment.overallScore * 100).toFixed(1)}%
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Passes Thresholds</p>
                                    <p className="text-lg font-bold">
                                      {selectedTask.qualityAssessment.passesThresholds ? '✅ Yes' : '❌ No'}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Issues */}
                              <div>
                                <h3 className="font-semibold mb-2">Issues Identified</h3>
                                <div className="space-y-2">
                                  {selectedTask.qualityAssessment.issues.map((issue, index) => (
                                    <div key={index} className="border rounded p-3">
                                      <div className="flex justify-between items-start mb-2">
                                        <Badge variant={
                                          issue.severity === 'critical' ? 'destructive' :
                                          issue.severity === 'high' ? 'destructive' :
                                          issue.severity === 'medium' ? 'secondary' : 'outline'
                                        }>
                                          {issue.severity}
                                        </Badge>
                                        <Badge variant="outline">{issue.type}</Badge>
                                      </div>
                                      <p className="text-sm">{issue.description}</p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {issue.metric}: {issue.currentValue.toFixed(2)} (expected: {issue.expectedValue.toFixed(2)})
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Recommendations */}
                              <div>
                                <h3 className="font-semibold mb-2">Recommendations</h3>
                                <ul className="list-disc list-inside space-y-1">
                                  {selectedTask.qualityAssessment.recommendations.map((rec, index) => (
                                    <li key={index} className="text-sm">{rec}</li>
                                  ))}
                                </ul>
                              </div>

                              {/* Review Notes */}
                              <div>
                                <h3 className="font-semibold mb-2">Review Notes</h3>
                                <Textarea
                                  placeholder="Add your review notes..."
                                  value={reviewNotes}
                                  onChange={(e) => setReviewNotes(e.target.value)}
                                  rows={4}
                                />
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  onClick={() => handleReviewDecision('escalate')}
                                  disabled={submitting}
                                >
                                  <ArrowUp className="h-4 w-4 mr-1" />
                                  Escalate
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleReviewDecision('reject')}
                                  disabled={submitting}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={() => handleReviewDecision('needs_improvement')}
                                  disabled={submitting}
                                >
                                  <ThumbsDown className="h-4 w-4 mr-1" />
                                  Needs Work
                                </Button>
                                <Button
                                  onClick={() => handleReviewDecision('approve')}
                                  disabled={submitting}
                                >
                                  <ThumbsUp className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
