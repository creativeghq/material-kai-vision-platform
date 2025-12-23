import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskColumn, TaskWithDetails } from '@/services/tasks';

interface KanbanColumnProps {
  column: TaskColumn;
  tasks: TaskWithDetails[];
  isExpanded: boolean;
  onToggle: () => void;
  onTaskClick?: (task: TaskWithDetails) => void;
  children?: React.ReactNode;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  column,
  tasks,
  isExpanded,
  onToggle,
  onTaskClick,
  children,
}) => {
  return (
    <div
      className={cn(
        'relative transition-all duration-300 ease-in-out flex-shrink-0',
        isExpanded ? 'w-80' : 'w-16'
      )}
    >
      {/* Column Container */}
      <div
        className={cn(
          'h-full rounded-2xl overflow-hidden transition-all duration-300',
          'bg-white/70 backdrop-blur-sm border border-gray-200/50',
          'shadow-sm hover:shadow-md'
        )}
      >
        {/* Collapsed State - Vertical Title */}
        {!isExpanded && (
          <button
            onClick={onToggle}
            className="h-full w-full flex items-center justify-center cursor-pointer hover:bg-white/90 transition-colors group"
          >
            <div className="flex flex-col items-center gap-3 py-6">
              {/* Column Color Indicator */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: column.color }}
              >
                <span className="text-white font-bold text-sm">
                  {tasks.length}
                </span>
              </div>

              {/* Vertical Text */}
              <div className="writing-mode-vertical text-sm font-semibold text-gray-700 tracking-wide">
                {column.name.toUpperCase()}
              </div>

              {/* Expand Icon */}
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
            </div>
          </button>
        )}

        {/* Expanded State - Full Column */}
        {isExpanded && (
          <div className="h-full flex flex-col">
            {/* Column Header */}
            <div
              className="px-4 py-4 border-b border-gray-200/50 cursor-pointer hover:bg-gray-50/50 transition-colors"
              onClick={onToggle}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: column.color }}
                  />
                  <h3 className="font-semibold text-gray-900">{column.name}</h3>
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {tasks.length}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 transform rotate-180" />
              </div>
              {column.description && (
                <p className="text-xs text-gray-500 mt-1">{column.description}</p>
              )}
            </div>

            {/* Tasks Container */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {children}
              {tasks.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No tasks
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom CSS for vertical text */}
      <style jsx>{`
        .writing-mode-vertical {
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }
      `}</style>
    </div>
  );
};

