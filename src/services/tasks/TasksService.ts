import { supabase } from '@/integrations/supabase/client';

// =====================================================
// INTERFACES
// =====================================================

export interface TaskColumn {
  id: string;
  name: string;
  description?: string;
  color: string;
  position: number;
  is_default: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  task_type: 'quote' | 'custom' | 'appointment' | 'material_review';
  column_id: string;
  position: number;
  quote_id?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'active' | 'completed' | 'archived' | 'cancelled';
  due_date?: string;
  completed_at?: string;
  created_by?: string;
  workspace_id?: string;
  metadata: Record<string, any>;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskAssignment {
  id: string;
  task_id: string;
  user_id: string;
  role: 'assignee' | 'reviewer' | 'watcher';
  assigned_at: string;
  assigned_by?: string;
}

export interface TaskWithDetails extends Task {
  column?: TaskColumn;
  assignments?: TaskAssignmentWithUser[];
  quote?: {
    id: string;
    name?: string;
    status: string;
    status_tag_id?: string;
  };
}

export interface TaskAssignmentWithUser extends TaskAssignment {
  user?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

// =====================================================
// TASKS SERVICE
// =====================================================

export class TasksService {
  /**
   * Get all task columns ordered by position
   */
  async getColumns(): Promise<TaskColumn[]> {
    const { data, error } = await supabase
      .from('task_columns')
      .select('*')
      .order('position', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single column by ID
   */
  async getColumn(columnId: string): Promise<TaskColumn> {
    const { data, error } = await supabase
      .from('task_columns')
      .select('*')
      .eq('id', columnId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Create a new column (admin only)
   */
  async createColumn(data: {
    name: string;
    description?: string;
    color?: string;
    position?: number;
  }): Promise<TaskColumn> {
    const { data: column, error } = await supabase
      .from('task_columns')
      .insert({
        name: data.name,
        description: data.description,
        color: data.color || '#6B7280',
        position: data.position || 0,
        is_system: false,
      })
      .select()
      .single();

    if (error) throw error;
    return column;
  }

  /**
   * Update a column (admin only)
   */
  async updateColumn(
    columnId: string,
    updates: Partial<Pick<TaskColumn, 'name' | 'description' | 'color' | 'position'>>,
  ): Promise<TaskColumn> {
    const { data, error } = await supabase
      .from('task_columns')
      .update(updates)
      .eq('id', columnId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a non-system column (admin only)
   */
  async deleteColumn(columnId: string): Promise<void> {
    const { error } = await supabase
      .from('task_columns')
      .delete()
      .eq('id', columnId);

    if (error) throw error;
  }

  // =====================================================
  // TASK OPERATIONS
  // =====================================================

  /**
   * Get all tasks with optional filters
   */
  async getTasks(filters?: {
    column_id?: string;
    task_type?: Task['task_type'];
    status?: Task['status'];
    workspace_id?: string;
    assigned_to?: string;
  }): Promise<TaskWithDetails[]> {
    let query = supabase
      .from('tasks')
      .select(`
        *,
        column:task_columns(*),
        quote:quotes(id, name, status, status_tag_id)
      `)
      .order('position', { ascending: true });

    if (filters?.column_id) {
      query = query.eq('column_id', filters.column_id);
    }
    if (filters?.task_type) {
      query = query.eq('task_type', filters.task_type);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.workspace_id) {
      query = query.eq('workspace_id', filters.workspace_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    // If filtering by assigned user, fetch assignments separately
    if (filters?.assigned_to) {
      const tasksWithAssignments = await Promise.all(
        (data || []).map(async (task) => {
          const assignments = await this.getTaskAssignments(task.id);
          return {
            ...task,
            assignments,
          };
        }),
      );

      return tasksWithAssignments.filter((task) =>
        task.assignments?.some((a) => a.user_id === filters.assigned_to),
      );
    }

    return data || [];
  }

  /**
   * Get a single task by ID with full details
   */
  async getTask(taskId: string): Promise<TaskWithDetails> {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        column:task_columns(*),
        quote:quotes(id, name, status, status_tag_id)
      `)
      .eq('id', taskId)
      .single();

    if (error) throw error;

    // Fetch assignments
    const assignments = await this.getTaskAssignments(taskId);

    return {
      ...data,
      assignments,
    };
  }

  /**
   * Create a new task
   */
  async createTask(data: {
    title: string;
    description?: string;
    task_type?: Task['task_type'];
    column_id: string;
    quote_id?: string;
    priority?: Task['priority'];
    due_date?: string;
    workspace_id?: string;
    metadata?: Record<string, any>;
    tags?: string[];
    assignees?: string[]; // User IDs to assign
  }): Promise<TaskWithDetails> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get the highest position in the column
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('position')
      .eq('column_id', data.column_id)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = existingTasks && existingTasks.length > 0
      ? existingTasks[0].position + 1
      : 0;

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        title: data.title,
        description: data.description,
        task_type: data.task_type || 'custom',
        column_id: data.column_id,
        quote_id: data.quote_id,
        priority: data.priority || 'medium',
        status: 'active',
        due_date: data.due_date,
        created_by: user.id,
        workspace_id: data.workspace_id,
        metadata: data.metadata || {},
        tags: data.tags || [],
        position: nextPosition,
      })
      .select(`
        *,
        column:task_columns(*),
        quote:quotes(id, name, status, status_tag_id)
      `)
      .single();

    if (error) throw error;

    // Assign users if provided
    if (data.assignees && data.assignees.length > 0) {
      await Promise.all(
        data.assignees.map((userId) =>
          this.assignUser(task.id, userId, 'assignee'),
        ),
      );
    }

    return await this.getTask(task.id);
  }

  /**
   * Update a task
   */
  async updateTask(
    taskId: string,
    updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'status' | 'due_date' | 'metadata' | 'tags' | 'column_id' | 'position'>>,
  ): Promise<TaskWithDetails> {
    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
      .select(`
        *,
        column:task_columns(*),
        quote:quotes(id, name, status, status_tag_id)
      `)
      .single();

    if (error) throw error;

    return await this.getTask(taskId);
  }

  /**
   * Move task to a different column
   */
  async moveTask(taskId: string, newColumnId: string, newPosition?: number): Promise<TaskWithDetails> {
    // If no position specified, add to end of column
    if (newPosition === undefined) {
      const { data: existingTasks } = await supabase
        .from('tasks')
        .select('position')
        .eq('column_id', newColumnId)
        .order('position', { ascending: false })
        .limit(1);

      newPosition = existingTasks && existingTasks.length > 0
        ? existingTasks[0].position + 1
        : 0;
    }

    return await this.updateTask(taskId, {
      column_id: newColumnId,
      position: newPosition,
    });
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;
  }

  /**
   * Complete a task
   */
  async completeTask(taskId: string): Promise<TaskWithDetails> {
    return await this.updateTask(taskId, {
      status: 'completed',
    });
  }

  // =====================================================
  // TASK ASSIGNMENTS
  // =====================================================

  /**
   * Get all assignments for a task
   */
  async getTaskAssignments(taskId: string): Promise<TaskAssignmentWithUser[]> {
    const { data, error } = await supabase
      .from('task_assignments')
      .select(`
        *,
        user:user_profiles!task_assignments_user_id_fkey(
          user_id,
          email,
          full_name
        )
      `)
      .eq('task_id', taskId);

    if (error) throw error;
    return data || [];
  }

  /**
   * Assign a user to a task
   */
  async assignUser(
    taskId: string,
    userId: string,
    role: TaskAssignment['role'] = 'assignee',
  ): Promise<TaskAssignment> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('task_assignments')
      .insert({
        task_id: taskId,
        user_id: userId,
        role,
        assigned_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Remove a user assignment from a task
   */
  async unassignUser(taskId: string, userId: string, role?: TaskAssignment['role']): Promise<void> {
    let query = supabase
      .from('task_assignments')
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', userId);

    if (role) {
      query = query.eq('role', role);
    }

    const { error } = await query;
    if (error) throw error;
  }

  // =====================================================
  // QUOTE INTEGRATION
  // =====================================================

  /**
   * Create a task from a quote
   */
  async createTaskFromQuote(
    quoteId: string,
    columnId: string,
    additionalData?: {
      title?: string;
      description?: string;
      priority?: Task['priority'];
      assignees?: string[];
    },
  ): Promise<TaskWithDetails> {
    // Fetch quote details
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, name, status, user_id, workspace_id')
      .eq('id', quoteId)
      .single();

    if (quoteError) throw quoteError;

    const title = additionalData?.title || quote.name || `Quote #${quote.id.substring(0, 8)}`;
    const description = additionalData?.description || 'Quote request from customer';

    return await this.createTask({
      title,
      description,
      task_type: 'quote',
      column_id: columnId,
      quote_id: quoteId,
      priority: additionalData?.priority || 'medium',
      workspace_id: quote.workspace_id || undefined,
      assignees: additionalData?.assignees,
      metadata: {
        quote_status: quote.status,
      },
    });
  }

  /**
   * Get all tasks for a specific quote
   */
  async getTasksForQuote(quoteId: string): Promise<TaskWithDetails[]> {
    return await this.getTasks({ task_type: 'quote' }).then((tasks) =>
      tasks.filter((task) => task.quote_id === quoteId),
    );
  }
}


