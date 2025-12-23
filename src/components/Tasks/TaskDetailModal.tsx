import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TaskWithDetails } from '@/services/tasks';

interface TaskDetailModalProps {
  task: TaskWithDetails;
  isOpen: boolean;
  onClose: () => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  isOpen,
  onClose,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-gray-600">{task.description}</p>
          <div className="text-sm text-gray-500">
            Task details will be implemented in the next phase
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

