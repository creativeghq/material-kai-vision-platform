import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Badge } from '@/components/core/ui/badge';
import { Calendar, User, Tag, Clock } from 'lucide-react';
import type { TaskWithDetails } from '@/services/tasks';

interface TaskDetailModalProps {
  task: TaskWithDetails;
  isOpen: boolean;
  onClose: () => void;
}

const priorityColors = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

const statusColors = {
  active: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  archived: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-800',
};

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  isOpen,
  onClose,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Priority Badges */}
          <div className="flex gap-2">
            <Badge className={priorityColors[task.priority]}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority
            </Badge>
            <Badge className={statusColors[task.status]}>
              {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
            </Badge>
            {task.task_type && (
              <Badge variant="outline">
                {task.task_type.replace('_', ' ').charAt(0).toUpperCase() + task.task_type.replace('_', ' ').slice(1)}
              </Badge>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Column */}
            {task.column && (
              <div className="flex items-start gap-2">
                <Tag className="h-4 w-4 text-gray-500 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500">Column</div>
                  <div className="text-sm font-medium">{task.column.name}</div>
                </div>
              </div>
            )}

            {/* Due Date */}
            {task.due_date && (
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-gray-500 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500">Due Date</div>
                  <div className="text-sm font-medium">
                    {new Date(task.due_date).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}

            {/* Created At */}
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-gray-500 mt-0.5" />
              <div>
                <div className="text-xs text-gray-500">Created</div>
                <div className="text-sm font-medium">
                  {new Date(task.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Completed At */}
            {task.completed_at && (
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-gray-500 mt-0.5" />
                <div>
                  <div className="text-xs text-gray-500">Completed</div>
                  <div className="text-sm font-medium">
                    {new Date(task.completed_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Assignments */}
          {task.assignments && task.assignments.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <User className="h-4 w-4" />
                Assigned To
              </h3>
              <div className="space-y-2">
                {task.assignments.map((assignment) => (
                  <div key={assignment.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{assignment.role}</Badge>
                    <span className="text-gray-700">
                      {assignment.user?.full_name || assignment.user?.email || 'Unknown User'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {task.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Quote Link */}
          {task.quote && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">Related Quote</h3>
              <p className="text-sm text-blue-700">
                {task.quote.name || `Quote #${task.quote.id.substring(0, 8)}`}
              </p>
              <Badge className="mt-2" variant="outline">
                {task.quote.status}
              </Badge>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

