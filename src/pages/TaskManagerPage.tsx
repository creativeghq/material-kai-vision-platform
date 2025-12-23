import React, { useState } from 'react';
import { Layout } from '@/components/Layout/Layout';
import { KanbanBoard } from '@/components/Tasks/KanbanBoard';
import { TaskDetailModal } from '@/components/Tasks/TaskDetailModal';
import { CreateTaskModal } from '@/components/Tasks/CreateTaskModal';
import type { TaskWithDetails } from '@/services/tasks';

const TaskManagerPage: React.FC = () => {
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const handleTaskClick = (task: TaskWithDetails) => {
    setSelectedTask(task);
    setIsDetailModalOpen(true);
  };

  const handleCreateTask = () => {
    setIsCreateModalOpen(true);
  };

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedTask(null);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  return (
    <Layout>
      <div className="h-[calc(100vh-5rem)] p-6">
        <KanbanBoard
          onTaskClick={handleTaskClick}
          onCreateTask={handleCreateTask}
        />
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          isOpen={isDetailModalOpen}
          onClose={handleCloseDetailModal}
        />
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
      />
    </Layout>
  );
};

export default TaskManagerPage;

