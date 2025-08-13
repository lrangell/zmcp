import { Result, ok, err, ResultAsync, okAsync, errAsync } from 'neverthrow';
import { TFile, Vault } from 'obsidian';
import { Task } from '../types/tasks';
import { parseTasksFromContent } from './taskParser';
import { readFileByTFile, getMarkdownFiles, createFile, fileExists } from './fileOperations';

// Helper to read and parse tasks from a single file
export const readTasksFromFile = (vault: Vault, file: TFile): ResultAsync<Task[], string> => {
  return readFileByTFile(file).andThen((content) => {
    const result = parseTasksFromContent(content, file.path);
    return result;
  });
};

// Helper to read all tasks from vault
export const readAllTasks = (vault: Vault): ResultAsync<Task[], string> => {
  return getMarkdownFiles().asyncAndThen((files: TFile[]) => {
    const taskResults = files.map((file) =>
      readTasksFromFile(vault, file)
        .map((tasks) => tasks)
        .orElse(() => okAsync([]))
    );

    return ResultAsync.combineWithAllErrors(taskResults)
      .map((taskArrays) => taskArrays.flat())
      .orElse(() => okAsync([]));
  });
};

// Helper to get or create a file
export const getOrCreateFile = (
  vault: Vault,
  path: string,
  initialContent: string
): ResultAsync<TFile, string> => {
  if (fileExists(path)) {
    const existingFile = vault.getAbstractFileByPath(path) as TFile;
    return okAsync(existingFile);
  }

  const existingFile = vault.getAbstractFileByPath(path);
  if (existingFile) {
    return errAsync('Path exists but is not a file');
  }

  return createFile(path, initialContent);
};

// Helper to insert task line into content
export const insertTaskIntoContent = (
  content: string,
  taskLine: string,
  position?: 'append' | 'prepend' | 'after_heading',
  heading?: string
): Result<{ content: string; lineNumber: number }, string> => {
  let newContent = content;
  let lineNumber = 1;

  if (!position || position === 'append') {
    newContent = content ? `${content}\n${taskLine}` : taskLine;
    lineNumber = newContent.split('\n').length;
  } else if (position === 'prepend') {
    newContent = taskLine + (content ? `\n${content}` : '');
    lineNumber = 1;
  } else if (position === 'after_heading' && heading) {
    const lines = content.split('\n');
    const headingIndex = lines.findIndex((line) => line.includes(heading));

    if (headingIndex === -1) {
      return err(`Heading not found: ${heading}`);
    }

    const insertIndex = headingIndex + 1;
    lines.splice(insertIndex, 0, taskLine);
    newContent = lines.join('\n');
    lineNumber = insertIndex + 1;
  }

  return ok({ content: newContent, lineNumber });
};

// Helper to find task at specific line
export const findTaskAtLine = (tasks: Task[], line: number): Result<Task, string> => {
  const task = tasks.find((t) => t.location.line === line);
  return task ? ok(task) : err(`No task found at line ${line}`);
};

// Helper to parse JSON safely
export const parseJSON = <T>(json: string): Result<T, string> => {
  try {
    return ok(JSON.parse(json));
  } catch {
    return err('Invalid JSON');
  }
};
