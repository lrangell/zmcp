export type TaskStatus = 'open' | 'done' | 'in_progress' | 'cancelled';
export type Priority = 'highest' | 'high' | 'low' | 'lowest';

export interface TaskDates {
  due?: string;
  scheduled?: string;
  start?: string;
  completed?: string;
  created?: string;
}

export interface TaskLocation {
  file: string;
  line: number;
  heading?: string;
}

export interface Task {
  text: string;
  status: TaskStatus;
  priority?: Priority;
  dates: TaskDates;
  recurrence?: string;
  tags: string[];
  location: TaskLocation;
  indent: number;
}

export interface TaskFilter {
  status?: TaskStatus;
  priority?: Priority;
  path?: string;
  due_before?: string;
  due_after?: string;
  is_recurring?: boolean;
  tags?: string[];
  limit?: number;
}

export interface TaskUpdate {
  text?: string;
  status?: TaskStatus;
  priority?: Priority | null;
  due?: string | null;
  scheduled?: string | null;
  recurrence?: string | null;
}

export interface CreateTaskParams {
  text: string;
  file: string;
  position?: 'append' | 'prepend' | 'after_heading';
  heading?: string;
  priority?: Priority;
  due?: string;
  scheduled?: string;
  start?: string;
  recurrence?: string;
  tags?: string[];
}

export interface UpdateTaskParams {
  file: string;
  line: number;
  updates: TaskUpdate;
}

export interface CompleteTaskParams {
  file: string;
  line: number;
  completion_date?: string;
}

export interface SearchTaskParams {
  query: string;
  case_sensitive?: boolean;
  search_completed?: boolean;
  path?: string;
}

// Emoji mappings
export const PRIORITY_EMOJIS: Record<Priority, string> = {
  highest: '⏫',
  high: '🔼',
  low: '🔽',
  lowest: '⏬',
};

export const DATE_EMOJIS = {
  due: '📅',
  scheduled: '⏳',
  start: '🛫',
  completed: '✅',
  created: '➕',
} as const;

export const RECURRENCE_EMOJI = '🔁';

export const CHECKBOX_PATTERNS: Record<TaskStatus | 'important' | 'question', string> = {
  open: '[ ]',
  done: '[x]',
  in_progress: '[/]',
  cancelled: '[-]',
  important: '[!]',
  question: '[?]',
};
