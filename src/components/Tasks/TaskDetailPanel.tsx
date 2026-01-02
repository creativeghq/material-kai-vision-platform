import React from 'react';
import { X, Clock, Tag, User, Calendar, AlertCircle, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { TaskWithDetails } from '@/services/tasks';
import { format } from 'date-fns';

interface TaskDetailPanelProps {
  task: TaskWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

const priorityColors = {
  low: 'bg-blue-100 text-blue-700 border-blue-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  urgent: 'bg-red-100 text-red-700 border-red-200',
};

const statusColors = {
  active: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
};

export const TaskDetailPanel: React.FC<TaskDetailPanelProps> = ({
  task,
  isOpen,
  onClose,
}) => {
  if (!task) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/20 transition-opacity z-40',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />

      {/* Sliding Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-[600px] bg-white shadow-2xl z-50',
          'transform transition-transform duration-300 ease-in-out',
          'flex flex-col',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{task.title}</h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              <span>Created {format(new Date(task.created_at), 'MMMM d, yyyy h:mm a')}</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Task Info Grid */}
          <div className="p-6 space-y-4 border-b">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Status</div>
                <Badge className={statusColors[task.status]}>
                  {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Priority</div>
                <Badge className={priorityColors[task.priority]}>
                  {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                </Badge>
              </div>
            </div>

            {task.due_date && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Due Date</div>
                <div className="text-sm font-medium">
                  {format(new Date(task.due_date), 'MMMM d, yyyy')}
                </div>
              </div>
            )}

            {task.tags && task.tags.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-2">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {task.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {task.assignments && task.assignments.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-2">Assignees</div>
                <div className="flex items-center gap-2">
                  {task.assignments.map((assignment, index) => (
                    <Avatar key={index} className="h-8 w-8">
                      <AvatarFallback className="bg-gradient-to-br from-purple-400 to-pink-400 text-white text-xs">
                        {assignment.user?.full_name?.[0] || assignment.user?.email?.[0] || '?'}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Project Description */}
          {task.description && (
            <div className="p-6 border-b">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Project Description</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Tabs for Activity, My Work, Assigned, Comments */}
          <div className="p-6">
            <Tabs defaultValue="activity" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="my-work">My Work</TabsTrigger>
                <TabsTrigger value="assigned">Assigned</TabsTrigger>
                <TabsTrigger value="comments">Comments</TabsTrigger>
              </TabsList>
              <TabsContent value="activity" className="mt-4">
                <div className="text-sm text-gray-500">Activity timeline will appear here</div>
              </TabsContent>
              <TabsContent value="my-work" className="mt-4">
                <div className="text-sm text-gray-500">Your work items will appear here</div>
              </TabsContent>
              <TabsContent value="assigned" className="mt-4">
                <div className="text-sm text-gray-500">Assigned items will appear here</div>
              </TabsContent>
              <TabsContent value="comments" className="mt-4">
                <div className="text-sm text-gray-500">Comments will appear here</div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
};

