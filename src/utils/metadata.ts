import { TFile, CachedMetadata, getAllTags } from 'obsidian';
import { Result, ok, err } from 'neverthrow';

/**
 * Extract metadata from a file with fallback
 */
export const extractFileMetadata = <T>(
  file: TFile,
  extractor: (cache: CachedMetadata) => T,
  defaultValue: T
): T => {
  const cache = app.metadataCache.getFileCache(file);
  return cache ? (extractor(cache) ?? defaultValue) : defaultValue;
};

/**
 * Safe metadata extraction with Result
 */
export const safeExtractMetadata = <T>(
  file: TFile,
  extractor: (cache: CachedMetadata) => T | null,
  errorMessage: string = 'Failed to extract metadata'
): Result<T, string> => {
  const cache = app.metadataCache.getFileCache(file);

  if (!cache) {
    return err(`${errorMessage}: No cache for file ${file.path}`);
  }

  const result = extractor(cache);

  if (result === null || result === undefined) {
    return err(`${errorMessage}: Extractor returned null`);
  }

  return ok(result);
};

/**
 * Get all tags from a file's metadata
 */
export const extractTags = (file: TFile): string[] => {
  return extractFileMetadata(file, (cache) => getAllTags(cache) || [], []);
};

/**
 * Get frontmatter from a file
 */
export const extractFrontmatter = (file: TFile): Record<string, any> => {
  return extractFileMetadata(file, (cache) => cache.frontmatter || {}, {});
};

/**
 * Get headings from a file
 */
export const extractHeadings = (
  file: TFile
): Array<{
  heading: string;
  level: number;
  position: { start: { line: number }; end: { line: number } };
}> => {
  return extractFileMetadata(file, (cache) => cache.headings || [], []);
};

/**
 * Get links from a file
 */
export const extractLinks = (
  file: TFile
): Array<{
  link: string;
  original: string;
  position: { start: { line: number }; end: { line: number } };
}> => {
  return extractFileMetadata(file, (cache) => cache.links || [], []);
};

/**
 * Get embeds from a file
 */
export const extractEmbeds = (
  file: TFile
): Array<{
  link: string;
  original: string;
  position: { start: { line: number }; end: { line: number } };
}> => {
  return extractFileMetadata(file, (cache) => cache.embeds || [], []);
};

/**
 * Check if file has specific frontmatter property
 */
export const hasFrontmatterProperty = (file: TFile, property: string): boolean => {
  const frontmatter = extractFrontmatter(file);
  return property in frontmatter;
};

/**
 * Get frontmatter property value
 */
export const getFrontmatterValue = <T = any>(file: TFile, property: string, defaultValue: T): T => {
  const frontmatter = extractFrontmatter(file);
  return (frontmatter[property] as T) ?? defaultValue;
};

/**
 * Check if file contains a specific tag
 */
export const hasTag = (file: TFile, tag: string): boolean => {
  const tags = extractTags(file);
  const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
  return tags.includes(normalizedTag);
};

/**
 * Get heading at specific line
 */
export const getHeadingAtLine = (file: TFile, line: number): string | null => {
  const headings = extractHeadings(file);

  // Find the heading that comes before the line
  let currentHeading: string | null = null;

  for (const heading of headings) {
    if (heading.position.start.line > line) {
      break;
    }
    currentHeading = heading.heading;
  }

  return currentHeading;
};

/**
 * Count specific metadata items
 */
export const countMetadataItems = (
  file: TFile
): {
  tags: number;
  links: number;
  embeds: number;
  headings: number;
} => {
  return {
    tags: extractTags(file).length,
    links: extractLinks(file).length,
    embeds: extractEmbeds(file).length,
    headings: extractHeadings(file).length,
  };
};
