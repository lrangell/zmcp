import { match, P } from 'ts-pattern';
import { pipe, map, filter, unique } from 'remeda';
import { MIME_TYPES } from './constants';

export function wrapInNode(
  tag: string,
  content: string,
  attributes?: Record<string, string>
): string {
  const attrs = attributes
    ? ' ' +
      Object.entries(attributes)
        .map(([k, v]) => `${k}="${escapeXmlAttribute(v)}"`)
        .join(' ')
    : '';
  return `<${tag}${attrs}>\n${content}\n</${tag}>`;
}

export function wrapSimple(tag: string, content: string): string {
  return `<${tag}>${content}</${tag}>`;
}

export function sanitizeTagName(name: string): string {
  return pipe(
    name,
    (s) => s.replace(/[\s\-.]/g, '_'),
    (s) => s.replace(/[^a-zA-Z0-9_]/g, ''),
    (s) => (s.match(/^[a-zA-Z_]/) ? s : `_${s}`),
    (s) => s || 'note'
  );
}

export function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function getMimeType(extension: string): string {
  const ext = extension.toLowerCase().replace('.', '');
  return match(ext)
    .with(P.union('jpg', 'jpeg'), () => MIME_TYPES.jpg)
    .with('png', () => MIME_TYPES.png)
    .with('gif', () => MIME_TYPES.gif)
    .with('webp', () => MIME_TYPES.webp)
    .with('svg', () => MIME_TYPES.svg)
    .with('mp3', () => MIME_TYPES.mp3)
    .with('wav', () => MIME_TYPES.wav)
    .with('ogg', () => MIME_TYPES.ogg)
    .with('pdf', () => MIME_TYPES.pdf)
    .otherwise(() => 'application/octet-stream');
}

export function isImageExtension(extension: string): boolean {
  const ext = extension.toLowerCase().replace('.', '');
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
}

export function isAudioExtension(extension: string): boolean {
  const ext = extension.toLowerCase().replace('.', '');
  return ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext);
}

export function parseObsidianLink(link: string): {
  path: string;
  section?: string;
  alias?: string;
} {
  const parts = link.split('|');
  const pathAndSection = parts[0];
  const alias = parts[1];

  const sectionMatch = pathAndSection.match(/^(.+?)#(.+)$/);
  if (sectionMatch) {
    return {
      path: sectionMatch[1],
      section: sectionMatch[2],
      alias,
    };
  }

  return {
    path: pathAndSection,
    alias,
  };
}

export function parseImageDimensions(link: string): {
  path: string;
  width?: number;
  height?: number;
  alt?: string;
} {
  const parts = link.split('|');
  const path = parts[0];
  const dimensionsOrAlt = parts[1];

  if (!dimensionsOrAlt) {
    return { path };
  }

  const dimensionMatch = dimensionsOrAlt.match(/^(\d+)(?:x(\d+))?$/);
  if (dimensionMatch) {
    return {
      path,
      width: parseInt(dimensionMatch[1], 10),
      height: dimensionMatch[2] ? parseInt(dimensionMatch[2], 10) : undefined,
    };
  }

  return {
    path,
    alt: dimensionsOrAlt,
  };
}

export function extractUniqueTags(items: string[]): string[] {
  return pipe(
    items,
    filter((item): item is string => item !== null && item !== undefined),
    map((item) => item.trim()),
    filter((item) => item.length > 0),
    unique()
  );
}

export function sortByPosition<T extends { position: { start: number } }>(segments: T[]): T[] {
  return [...segments].sort((a, b) => a.position.start - b.position.start);
}

export function rangesOverlap(
  range1: { start: number; end: number },
  range2: { start: number; end: number }
): boolean {
  return range1.start < range2.end && range2.start < range1.end;
}

export function mergeOverlappingSegments<T extends { position: { start: number; end: number } }>(
  segments: T[]
): T[] {
  if (segments.length === 0) return [];

  const sorted = sortByPosition(segments);
  const result: T[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];

    if (!rangesOverlap(last.position, current.position)) {
      result.push(current);
    }
  }

  return result;
}

export function extractTextBetweenSegments(
  content: string,
  segments: Array<{ position: { start: number; end: number } }>
): string[] {
  const sorted = sortByPosition(segments);
  const textSegments: string[] = [];

  let lastEnd = 0;
  for (const segment of sorted) {
    if (segment.position.start > lastEnd) {
      const text = content.substring(lastEnd, segment.position.start);
      if (text.trim()) {
        textSegments.push(text);
      }
    }
    lastEnd = segment.position.end;
  }

  if (lastEnd < content.length) {
    const text = content.substring(lastEnd);
    if (text.trim()) {
      textSegments.push(text);
    }
  }

  return textSegments;
}

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function sanitizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
}

export function getFileExtension(path: string): string {
  const match = path.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

export function getBaseName(path: string): string {
  const parts = path.split('/');
  const fileName = parts[parts.length - 1];
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
}
