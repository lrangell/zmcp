import {
  CHECKBOX_PATTERNS,
  DATE_EMOJIS,
  Priority,
  PRIORITY_EMOJIS,
  RECURRENCE_EMOJI,
  Task,
  TaskStatus,
  TaskUpdate,
} from '../types/tasks';

// Format checkbox based on status
export const formatCheckbox = (status: TaskStatus): string => {
  return `[${CHECKBOX_PATTERNS[status].replace(/[[\]]/g, '')}]`;
};

// Format priority emoji
export const formatPriority = (priority?: Priority | null): string => {
  if (!priority) return '';
  return PRIORITY_EMOJIS[priority];
};

// Format date with emoji
export const formatDate = (dateType: keyof typeof DATE_EMOJIS, date?: string | null): string => {
  if (!date) return '';
  return `${DATE_EMOJIS[dateType]} ${date}`;
};

// Format recurrence pattern
export const formatRecurrence = (recurrence?: string | null): string => {
  if (!recurrence) return '';
  return `${RECURRENCE_EMOJI} ${recurrence}`;
};

// Format tags
export const formatTags = (tags: string[]): string => {
  return tags.map((tag) => `#${tag}`).join(' ');
};

// Build complete task line from task object
export const formatTask = (task: Task): string => {
  const indent = ' '.repeat(task.indent);
  const checkbox = formatCheckbox(task.status);
  const parts: string[] = [`${indent}- ${checkbox} ${task.text}`];

  // Add priority
  if (task.priority) {
    parts.push(formatPriority(task.priority));
  }

  // Add dates
  if (task.dates.due) {
    parts.push(formatDate('due', task.dates.due));
  }
  if (task.dates.scheduled) {
    parts.push(formatDate('scheduled', task.dates.scheduled));
  }
  if (task.dates.start) {
    parts.push(formatDate('start', task.dates.start));
  }
  if (task.dates.completed) {
    parts.push(formatDate('completed', task.dates.completed));
  }
  if (task.dates.created) {
    parts.push(formatDate('created', task.dates.created));
  }

  // Add recurrence
  if (task.recurrence) {
    parts.push(formatRecurrence(task.recurrence));
  }

  // Add tags
  if (task.tags.length > 0) {
    parts.push(formatTags(task.tags));
  }

  return parts.join(' ');
};

// Apply updates to a task
export const applyUpdates = (task: Task, updates: TaskUpdate): Task => {
  const updatedTask = { ...task };

  if (updates.text !== undefined) {
    updatedTask.text = updates.text;
  }

  if (updates.status !== undefined) {
    updatedTask.status = updates.status;
  }

  if (updates.priority !== undefined) {
    updatedTask.priority = updates.priority === null ? undefined : updates.priority;
  }

  if (updates.due !== undefined) {
    if (updates.due === null) {
      delete updatedTask.dates.due;
    } else {
      updatedTask.dates.due = updates.due;
    }
  }

  if (updates.scheduled !== undefined) {
    if (updates.scheduled === null) {
      delete updatedTask.dates.scheduled;
    } else {
      updatedTask.dates.scheduled = updates.scheduled;
    }
  }

  if (updates.recurrence !== undefined) {
    updatedTask.recurrence = updates.recurrence === null ? undefined : updates.recurrence;
  }

  return updatedTask;
};

// Remove all emoji attributes from a line
export const removeEmojis = (line: string): string => {
  const allEmojis = [
    ...Object.values(PRIORITY_EMOJIS),
    ...Object.values(DATE_EMOJIS),
    RECURRENCE_EMOJI,
  ];

  let result = line;
  for (const emoji of allEmojis) {
    // Remove emoji and any text following it until next emoji or end
    const pattern = new RegExp(`\\s*${emoji}[^${allEmojis.join('')}]*`, 'g');
    result = result.replace(pattern, '');
  }

  return result.trim();
};

// Update task line in file content
export const updateTaskInContent = (
  content: string,
  lineNumber: number,
  newTaskLine: string
): string => {
  const lines = content.split('\n');
  if (lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`Invalid line number: ${lineNumber}`);
  }

  lines[lineNumber - 1] = newTaskLine;
  return lines.join('\n');
};

// Create a new task line from parameters
export const createTaskLine = (
  text: string,
  options: {
    status?: TaskStatus;
    priority?: Priority;
    due?: string;
    scheduled?: string;
    start?: string;
    recurrence?: string;
    tags?: string[];
    indent?: number;
  } = {}
): string => {
  const task: Task = {
    text,
    status: options.status || 'open',
    priority: options.priority,
    dates: {
      due: options.due,
      scheduled: options.scheduled,
      start: options.start,
    },
    recurrence: options.recurrence,
    tags: options.tags || [],
    location: { file: '', line: 0 }, // Will be set when inserting
    indent: options.indent || 0,
  };

  return formatTask(task);
};
