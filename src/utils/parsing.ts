import { Result, ok, err } from 'neverthrow';

/**
 * Create a parser function with error handling
 */
export const createParser = <T>(
  pattern: RegExp,
  transformer: (match: RegExpMatchArray) => T,
  defaultValue: T
): ((input: string) => T) => {
  return (input: string): T => {
    const match = input.match(pattern);
    return match ? transformer(match) : defaultValue;
  };
};

/**
 * Create a safe parser that returns a Result
 */
export const createSafeParser = <T>(
  pattern: RegExp,
  transformer: (match: RegExpMatchArray) => T,
  errorMessage: string = 'Parse failed'
): ((input: string) => Result<T, string>) => {
  return (input: string): Result<T, string> => {
    const match = input.match(pattern);
    if (!match) {
      return err(`${errorMessage}: No match found`);
    }

    try {
      return ok(transformer(match));
    } catch (e) {
      return err(`${errorMessage}: ${e}`);
    }
  };
};

/**
 * Create a string transformer with multiple operations
 */
export const createStringTransformer = (
  transformations: Array<(input: string) => string>,
  fallback: string = ''
): ((input: string) => string) => {
  return (input: string): string => {
    if (!input) return fallback;

    try {
      let result = input;
      for (const transform of transformations) {
        result = transform(result);
      }
      return result || fallback;
    } catch {
      return fallback;
    }
  };
};

/**
 * Parse key-value pairs from text
 */
export const parseKeyValuePairs = (
  text: string,
  separator: string = ':',
  lineDelimiter: string = '\n'
): Record<string, string> => {
  const result: Record<string, string> = {};

  const lines = text.split(lineDelimiter);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const separatorIndex = trimmed.indexOf(separator);
    if (separatorIndex === -1) continue;

    const key = trimmed.substring(0, separatorIndex).trim();
    const value = trimmed.substring(separatorIndex + 1).trim();

    if (key) {
      result[key] = value;
    }
  }

  return result;
};

/**
 * Extract content between markers
 */
export const extractBetweenMarkers = (
  text: string,
  startMarker: string,
  endMarker: string,
  includeMarkers: boolean = false
): string[] => {
  const results: string[] = [];

  let startIndex = 0;
  while (startIndex < text.length) {
    const start = text.indexOf(startMarker, startIndex);
    if (start === -1) break;

    const end = text.indexOf(endMarker, start + startMarker.length);
    if (end === -1) break;

    if (includeMarkers) {
      results.push(text.substring(start, end + endMarker.length));
    } else {
      results.push(text.substring(start + startMarker.length, end));
    }

    startIndex = end + endMarker.length;
  }

  return results;
};

/**
 * Parse a template string with variables
 */
export const parseTemplate = (
  template: string,
  variablePattern: RegExp = /\{\{(\w+)\}\}/g
): { text: string; variables: string[] } => {
  const variables: string[] = [];
  const matches = template.matchAll(variablePattern);

  for (const match of matches) {
    if (match[1] && !variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  return { text: template, variables };
};

/**
 * Clean and normalize text
 */
export const normalizeText = createStringTransformer([
  (s) => s.trim(),
  (s) => s.replace(/\s+/g, ' '),
  (s) => s.replace(/[^\w\s-]/g, ''),
  (s) => s.toLowerCase(),
]);

/**
 * Sanitize for use as identifier
 */
export const sanitizeIdentifier = createStringTransformer([
  (s) => s.replace(/[\s\-.]/g, '_'),
  (s) => s.replace(/[^a-zA-Z0-9_]/g, ''),
  (s) => (s.match(/^[a-zA-Z_]/) ? s : `_${s}`),
]);
