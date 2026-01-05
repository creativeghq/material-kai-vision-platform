import React from 'react';
import { Calendar, User, Package, AlertCircle, Clock, Tag } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Avatar, AvatarFallback } from '@/components/core/ui/avatar';
import { cn } from '@/lib/utils';
import type { TaskWithDetails } from '@/services/tasks';
import { formatDistanceToNow } from 'date-fns';

interface TaskCardProps {
  task: TaskWithDetails;
  onClick?: () => void;
  isDragging?: boolean;
}

const priorityColors = {
  low: 'bg-blue-100 text-blue-700 border-blue-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-red-100 text-red-700 border-red-200',
};

const taskTypeIcons = {
  quote: Package,
  custom: Tag,
  appointment: Calendar,
  material_review: AlertCircle,
};

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, isDragging }) => {
  const TaskIcon = taskTypeIcons[task.task_type];
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-lg border border-gray-200 p-3 cursor-pointer',
        'hover:shadow-md hover:border-gray-300 transition-all duration-200',
        'group',
        isDragging && 'opacity-50 rotate-2 scale-95',
      )}
    >
      {/* Task Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <TaskIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <h4 className="font-medium text-gray-900 text-sm truncate">
            {task.title}
          </h4>
        </div>
        <Badge
          variant="outline"
          className={cn('text-xs px-2 py-0', priorityColors[task.priority])}
        >
          {task.priority}
        </Badge>
      </div>

      {/* Task Description */}
      {task.description && (
        <p className="text-xs text-gray-600 mb-3 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Quote Badge (if task is linked to a quote) */}
      {task.task_type === 'quote' && task.quote && (
        <div className="mb-3">
          <Badge variant="secondary" className="text-xs">
            <Package className="w-3 h-3 mr-1" />
            {task.quote.name || `Quote #${task.quote.id.substring(0, 8)}`}
          </Badge>
          {task.quote.status && (
            <Badge variant="outline" className="text-xs ml-1">
              {task.quote.status}
            </Badge>
          )}
        </div>
      )}

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tags.slice(0, 3).map((tag, index) => (
            <Badge key={index} variant="outline" className="text-xs px-2 py-0">
              {tag}
            </Badge>
          ))}
          {task.tags.length > 3 && (
            <Badge variant="outline" className="text-xs px-2 py-0">
              +{task.tags.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        {/* Due Date */}
        {task.due_date && (
          <div className={cn('flex items-center gap-1', isOverdue && 'text-red-600')}>
            <Clock className="w-3 h-3" />
            <span>
              {formatDistanceToNow(new Date(task.due_date), { addSuffix: true })}
            </span>
          </div>
        )}

        {/* Assignees */}
        {task.assignments && task.assignments.length > 0 && (
          <div className="flex items-center -space-x-2">
            {task.assignments.slice(0, 3).map((assignment, index) => (
              <Avatar key={index} className="w-6 h-6 border-2 border-white">
                <AvatarFallback className="text-xs bg-gradient-to-br from-purple-400 to-pink-400 text-white">
                  {assignment.user?.full_name?.[0] || assignment.user?.email?.[0] || '?'}
                </AvatarFallback>
              </Avatar>
            ))}
            {task.assignments.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs font-medium">
                +{task.assignments.length - 3}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

