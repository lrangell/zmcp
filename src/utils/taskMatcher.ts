import type { Task, TaskFilter } from '../types/tasks';

/**
 * Create a matcher function for task properties
 */
const createMatcher = <T>(
  getValue: (task: Task) => T | undefined,
  compareFn: (taskValue: T, filterValue: T) => boolean = (a, b) => a === b
) => {
  return (task: Task, filterValue?: T): boolean => {
    if (filterValue === undefined || filterValue === null) return true;
    const taskValue = getValue(task);
    if (taskValue === undefined || taskValue === null) return false;
    return compareFn(taskValue, filterValue);
  };
};

/**
 * Create a date comparison matcher
 */
const createDateMatcher = (
  dateField: 'due' | 'scheduled' | 'start' | 'completed',
  comparison: 'before' | 'after'
) => {
  return (task: Task, dateValue?: string): boolean => {
    if (!dateValue) return true;
    const taskDate = task.dates[dateField];
    if (!taskDate) return false;
    return comparison === 'before' ? taskDate <= dateValue : taskDate >= dateValue;
  };
};

// Individual matchers using the factory
export const matchesStatus = createMatcher((task) => task.status);

export const matchesPriority = createMatcher((task) => task.priority);

export const matchesPath = createMatcher(
  (task) => task.location.file,
  (taskPath, filterPath) => taskPath.includes(filterPath)
);

export const matchesDueBefore = createDateMatcher('due', 'before');
export const matchesDueAfter = createDateMatcher('due', 'after');

export const matchesRecurring = createMatcher(
  (task) => !!task.recurrence,
  (hasRecurrence, shouldHaveRecurrence) => hasRecurrence === shouldHaveRecurrence
);

export const matchesTags = createMatcher(
  (task) => task.tags,
  (taskTags, filterTags) => {
    if (!Array.isArray(filterTags) || filterTags.length === 0) return true;
    return filterTags.every((tag: string) => taskTags.includes(tag));
  }
);

/**
 * Main matcher function that combines all filters
 */
export const matchesFilter = (task: Task, filter: TaskFilter): boolean => {
  return (
    matchesStatus(task, filter.status) &&
    matchesPriority(task, filter.priority) &&
    matchesPath(task, filter.path) &&
    matchesDueBefore(task, filter.due_before) &&
    matchesDueAfter(task, filter.due_after) &&
    matchesRecurring(task, filter.is_recurring) &&
    matchesTags(task, filter.tags)
  );
};

/**
 * Filter an array of tasks based on filter criteria
 */
export const filterTasks = (tasks: Task[], filter: TaskFilter): Task[] => {
  let filtered = tasks.filter((task) => matchesFilter(task, filter));

  // Apply limit if specified
  if (filter.limit && filter.limit > 0) {
    filtered = filtered.slice(0, filter.limit);
  }

  return filtered;
};

/**
 * Search task text for a query string
 */
export const searchTaskText = (
  task: Task,
  query: string,
  caseSensitive: boolean = false
): boolean => {
  const searchText = caseSensitive ? task.text : task.text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  return searchText.includes(searchQuery);
};

/**
 * Get context around matched text
 */
export const getMatchContext = (
  text: string,
  query: string,
  contextLength: number = 30
): { matched_text: string; context: string } => {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return { matched_text: '', context: text };
  }

  const matchEnd = matchIndex + query.length;
  const contextStart = Math.max(0, matchIndex - contextLength);
  const contextEnd = Math.min(text.length, matchEnd + contextLength);

  const context = text.substring(contextStart, contextEnd);
  const matched_text = text.substring(matchIndex, matchEnd);

  return { matched_text, context };
};
