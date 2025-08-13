import { Result, ResultAsync } from 'neverthrow';
import { TFile } from 'obsidian';

/**
 * Wrap a potentially throwing operation in a Result
 */
export const safeOperation = <T>(operation: () => T, operationName: string): Result<T, string> => {
  return Result.fromThrowable(operation, (e) => `Failed to ${operationName}: ${e}`)();
};

/**
 * Wrap an async operation with consistent error handling
 */
export const safeAsyncOperation = <T>(
  operation: () => Promise<T>,
  operationName: string
): ResultAsync<T, string> => {
  return ResultAsync.fromPromise(operation(), (e) => `Failed to ${operationName}: ${e}`);
};

/**
 * Process a collection with error recovery
 */
export const processCollection = <T, R>(
  items: T[],
  processor: (item: T) => ResultAsync<R[], string>,
  onError: () => R[] = () => []
): ResultAsync<R[], string> => {
  const results = items.map((item) =>
    processor(item).orElse(() =>
      ResultAsync.fromPromise(Promise.resolve(onError()), () => 'Error recovery failed')
    )
  );

  return ResultAsync.combineWithAllErrors(results)
    .map((results) => results.flat())
    .orElse(() =>
      ResultAsync.fromPromise(Promise.resolve([]), () => 'Collection processing failed')
    );
};

/**
 * Chain file operations with consistent error handling
 */
export const withFileOperation = <T>(
  getFile: () => Result<TFile, string>,
  operation: (file: TFile) => Promise<T>,
  operationName: string
): ResultAsync<T, string> => {
  return getFile().asyncAndThen((file) =>
    ResultAsync.fromPromise(operation(file), (e) => `Failed to ${operationName}: ${e}`)
  );
};

/**
 * Transform errors with context
 */
export const withErrorContext = <T, E>(
  result: Result<T, E>,
  context: string
): Result<T, string> => {
  return result.mapErr((error) => `${context}: ${error}`);
};

/**
 * Transform async errors with context
 */
export const withAsyncErrorContext = <T, E>(
  result: ResultAsync<T, E>,
  context: string
): ResultAsync<T, string> => {
  return result.mapErr((error) => `${context}: ${error}`);
};
