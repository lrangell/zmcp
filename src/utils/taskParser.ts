import { err, ok, Result } from 'neverthrow';
import {
  DATE_EMOJIS,
  PRIORITY_EMOJIS,
  Priority,
  RECURRENCE_EMOJI,
  Task,
  TaskDates,
  TaskLocation,
  TaskStatus,
} from '../types/tasks';
import { removeEmojis } from './taskUpdater';

// Parse checkbox status from line
export const parseCheckboxStatus = (line: string): TaskStatus | null => {
  const checkboxMatch = line.match(/^(\s*)-\s*\[(.)\]/);
  if (!checkboxMatch) return null;

  const checkChar = checkboxMatch[2].toLowerCase();
  switch (checkChar) {
    case ' ':
      return 'open';
    case 'x':
      return 'done';
    case '/':
      return 'in_progress';
    case '-':
      return 'cancelled';
    default:
      return 'open'; // Default to open for unknown states
  }
};

// Extract indentation level
export const parseIndentation = (line: string): number => {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
};

// Extract task text without checkbox and emojis
export const parseTaskText = (line: string): string => {
  // Remove checkbox prefix
  const withoutCheckbox = line.replace(/^(\s*)-\s*\[.\]\s*/, '');
  // Use removeEmojis utility to clean emoji attributes
  return removeEmojis(withoutCheckbox).trim();
};

// Parse priority emoji
export const parsePriority = (line: string): Priority | undefined => {
  for (const [priority, emoji] of Object.entries(PRIORITY_EMOJIS)) {
    if (line.includes(emoji)) {
      return priority as Priority;
    }
  }
  return undefined;
};

// Parse date emojis and their values
export const parseDates = (line: string): TaskDates => {
  const dates: TaskDates = {};

  for (const [dateType, emoji] of Object.entries(DATE_EMOJIS)) {
    const pattern = new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`);
    const match = line.match(pattern);
    if (match) {
      dates[dateType as keyof TaskDates] = match[1];
    }
  }

  return dates;
};

// Parse recurrence pattern
export const parseRecurrence = (line: string): string | undefined => {
  const pattern = new RegExp(
    `${RECURRENCE_EMOJI}\\s*([^${Object.values(DATE_EMOJIS).join('')}${Object.values(PRIORITY_EMOJIS).join('')}]+?)(?=\\s*(?:${Object.values(DATE_EMOJIS).join('|')}|${Object.values(PRIORITY_EMOJIS).join('|')}|$))`
  );
  const match = line.match(pattern);
  return match ? match[1].trim() : undefined;
};

// Parse hashtags
export const parseTags = (line: string): string[] => {
  const tagPattern = /#[\w-]+/g;
  const matches = line.match(tagPattern);
  return matches ? matches.map((tag) => tag.substring(1)) : [];
};

// Validate if line is a task
export const isValidTask = (line: string): boolean => {
  return /^\s*-\s*\[.\]/.test(line);
};

// Parse complete task from line
export const parseTaskLine = (line: string, location: TaskLocation): Result<Task, string> => {
  if (!isValidTask(line)) {
    return err('Not a valid task line');
  }

  const status = parseCheckboxStatus(line);
  if (!status) {
    return err('Could not parse task status');
  }

  const task: Task = {
    text: parseTaskText(line),
    status,
    priority: parsePriority(line),
    dates: parseDates(line),
    recurrence: parseRecurrence(line),
    tags: parseTags(line),
    location,
    indent: parseIndentation(line),
  };

  return ok(task);
};

// Parse all tasks from file content
export const parseTasksFromContent = (
  content: string,
  filePath: string
): Result<Task[], string> => {
  const lines = content.split('\n');
  const tasks: Task[] = [];
  let currentHeading: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current heading
    if (line.match(/^#+\s+/)) {
      currentHeading = line.replace(/^#+\s+/, '').trim();
    }

    if (isValidTask(line)) {
      const location: TaskLocation = {
        file: filePath,
        line: i + 1,
        heading: currentHeading,
      };

      parseTaskLine(line, location)
        .map((task) => tasks.push(task))
        .mapErr(() => {
          /* Skip invalid task lines */
        });
    }
  }

  return ok(tasks);
};
