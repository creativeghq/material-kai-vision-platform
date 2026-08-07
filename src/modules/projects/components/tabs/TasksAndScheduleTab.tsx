/**
 * Tasks, as a list or as a schedule (WS3 #285).
 *
 * These are the same rows viewed two ways, so they share one tab rather than adding a 15th
 * trigger to a bar that is already overflowing. The toggle is local state: switching views is a
 * display choice, not a place worth putting in the URL.
 */
import React, { useState } from 'react';
import { List, GanttChartSquare } from 'lucide-react';
import { TasksTab } from './TasksTab';
import { ScheduleTab } from './ScheduleTab';

type View = 'list' | 'schedule';

export const TasksAndScheduleTab: React.FC<{ projectId: string; isOwner: boolean }> = ({ projectId, isOwner }) => {
  const [view, setView] = useState<View>('list');

  const Toggle: React.FC<{ value: View; icon: React.ReactNode; label: string }> = ({ value, icon, label }) => (
    <button
      type="button"
      onClick={() => setView(value)}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
        view === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="flex rounded-md border border-border/60 p-0.5">
          <Toggle value="list" icon={<List className="h-3.5 w-3.5" />} label="List" />
          <Toggle value="schedule" icon={<GanttChartSquare className="h-3.5 w-3.5" />} label="Schedule" />
        </div>
      </div>

      {/* Both are mounted lazily by choice: the Gantt fetches dependencies the list does not need. */}
      {view === 'list'
        ? <TasksTab projectId={projectId} isOwner={isOwner} />
        : <ScheduleTab projectId={projectId} isOwner={isOwner} />}
    </div>
  );
};

export default TasksAndScheduleTab;
