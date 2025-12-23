import React, { useState, useEffect } from 'react';
import { Plus, Filter, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { TasksService, type TaskColumn, type TaskWithDetails } from '@/services/tasks';
import { useToast } from '@/hooks/use-toast';

interface KanbanBoardProps {
  onTaskClick?: (task: TaskWithDetails) => void;
  onCreateTask?: () => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  onTaskClick,
  onCreateTask,
}) => {
  const [columns, setColumns] = useState<TaskColumn[]>([]);
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [expandedColumn, setExpandedColumn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const tasksService = new TasksService();

  // Load columns and tasks
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [columnsData, tasksData] = await Promise.all([
        tasksService.getColumns(),
        tasksService.getTasks({ status: 'active' }),
      ]);

      setColumns(columnsData);
      setTasks(tasksData);

      // Auto-expand first column
      if (columnsData.length > 0 && !expandedColumn) {
        setExpandedColumn(columnsData[0].id);
      }
    } catch (error) {
      console.error('Failed to load kanban data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load tasks',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleColumnToggle = (columnId: string) => {
    setExpandedColumn(expandedColumn === columnId ? null : columnId);
  };

  const getTasksForColumn = (columnId: string) => {
    return tasks
      .filter((task) => task.column_id === columnId)
      .filter((task) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.tags?.some((tag) => tag.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => a.position - b.position);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Task Manager</h1>
          <p className="text-gray-600 mt-1">
            Organize quotes, appointments, and custom tasks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </Button>
          <Button onClick={onCreateTask} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full pb-4">
          {columns.map((column) => {
            const columnTasks = getTasksForColumn(column.id);
            return (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={columnTasks}
                isExpanded={expandedColumn === column.id}
                onToggle={() => handleColumnToggle(column.id)}
                onTaskClick={onTaskClick}
              >
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => onTaskClick?.(task)}
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </div>
      </div>
    </div>
  );
};

