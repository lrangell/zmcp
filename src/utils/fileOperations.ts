import { Result, ok, err, ResultAsync, errAsync } from 'neverthrow';
import { TFile, CachedMetadata, App } from 'obsidian';

// Declare global app for TypeScript
declare global {
  const app: App;
}

// Type aliases for cleaner signatures
export type FileResult = Result<TFile, string>;
export type FilesResult = Result<TFile[], string>;
export type ContentResult = Result<string, string>;
export type BinaryResult = Result<ArrayBuffer, string>;
export type VoidResult = Result<void, string>;

export type FileAsync = ResultAsync<TFile, string>;
export type FilesAsync = ResultAsync<TFile[], string>;
export type ContentAsync = ResultAsync<string, string>;
export type BinaryAsync = ResultAsync<ArrayBuffer, string>;
export type VoidAsync = ResultAsync<void, string>;

// File existence and retrieval
export const getFile = (path: string): FileResult => {
  const file = app.vault.getAbstractFileByPath(path);

  if (file instanceof TFile) {
    return ok(file);
  }

  if (file) {
    return err(`Path exists but is not a file: ${path}`);
  }

  return err(`File not found: ${path}`);
};

export const getMarkdownFiles = (): FilesResult => {
  return Result.fromThrowable(
    () => app.vault.getMarkdownFiles(),
    (e) => `Failed to get markdown files: ${e}`
  )();
};

export const fileExists = (path: string): boolean => {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile;
};

// File reading operations - these MUST be async as Obsidian's API is async
export const readFile = (path: string): ContentAsync => {
  return getFile(path).asyncAndThen((file) =>
    ResultAsync.fromPromise(app.vault.read(file), (e) => `Failed to read file ${path}: ${e}`)
  );
};

export const readBinary = (path: string): BinaryAsync => {
  return getFile(path).asyncAndThen((file) =>
    ResultAsync.fromPromise(
      app.vault.readBinary(file),
      (e) => `Failed to read binary file ${path}: ${e}`
    )
  );
};

// File writing operations - these MUST be async as Obsidian's API is async
export const createFile = (path: string, content: string): FileAsync => {
  const existingFile = app.vault.getAbstractFileByPath(path);

  if (existingFile) {
    return errAsync(`File already exists: ${path}`);
  }

  return ResultAsync.fromPromise(
    app.vault.create(path, content),
    (e) => `Failed to create file ${path}: ${e}`
  );
};

export const modifyFile = (path: string, content: string): VoidAsync => {
  return getFile(path).asyncAndThen((file) =>
    ResultAsync.fromPromise(
      app.vault.modify(file, content),
      (e) => `Failed to modify file ${path}: ${e}`
    )
  );
};

export const deleteFile = (path: string): VoidAsync => {
  return getFile(path).asyncAndThen((file) =>
    ResultAsync.fromPromise(app.vault.delete(file), (e) => `Failed to delete file ${path}: ${e}`)
  );
};

// Metadata operations - these are synchronous
export const getFileCache = (path: string): Result<CachedMetadata | null, string> => {
  return getFile(path).andThen((file) =>
    Result.fromThrowable(
      () => app.metadataCache.getFileCache(file),
      (e) => `Failed to get file cache for ${path}: ${e}`
    )()
  );
};

export const getFileTags = (path: string): Result<string[], string> => {
  return getFileCache(path).map((cache) => {
    if (!cache) return [];

    const tags: string[] = [];

    // Get tags from the cache
    if (cache.tags) {
      tags.push(...cache.tags.map((t) => t.tag));
    }

    // Get tags from frontmatter
    if (cache.frontmatter?.tags) {
      const frontmatterTags = cache.frontmatter.tags;
      if (Array.isArray(frontmatterTags)) {
        tags.push(...frontmatterTags.map((t: string) => (t.startsWith('#') ? t : `#${t}`)));
      } else if (typeof frontmatterTags === 'string') {
        tags.push(frontmatterTags.startsWith('#') ? frontmatterTags : `#${frontmatterTags}`);
      }
    }

    // Return unique tags
    return [...new Set(tags)];
  });
};

export const getFirstLinkpathDest = (linkpath: string, sourcePath: string): FileResult => {
  return Result.fromThrowable(
    () => {
      const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
      if (file instanceof TFile) {
        return file;
      }
      throw new Error(`Link destination not found: ${linkpath}`);
    },
    (e) => `Failed to resolve link ${linkpath}: ${e}`
  )();
};

// Utility operations - pure functions
export const getBaseName = (path: string): string => {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  return filename.replace(/\.[^/.]+$/, '');
};

export const getExtension = (path: string): string => {
  const match = path.match(/\.([^/.]+)$/);
  return match ? match[1] : '';
};

export const normalizePath = (path: string): string => {
  // Remove leading/trailing slashes and normalize separators
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/');
};

// Helper function to create or modify a file
export const createOrModifyFile = (path: string, content: string): FileAsync => {
  const existingFile = app.vault.getAbstractFileByPath(path);

  if (existingFile instanceof TFile) {
    return modifyFile(path, content).map(() => existingFile);
  }

  return createFile(path, content);
};

// Additional helper for getting file by TFile (for compatibility)
export const readFileByTFile = (file: TFile): ContentAsync => {
  return ResultAsync.fromPromise(
    app.vault.read(file),
    (e) => `Failed to read file ${file.path}: ${e}`
  );
};

// Additional helper for modifying file by TFile (for compatibility)
export const modifyFileByTFile = (file: TFile, content: string): VoidAsync => {
  return ResultAsync.fromPromise(
    app.vault.modify(file, content),
    (e) => `Failed to modify file ${file.path}: ${e}`
  );
};
