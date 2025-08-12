import { SegmentType, ContentType, CalloutType } from './constants';
import { PromptMessage } from '../types';

export interface Position {
  start: number;
  end: number;
  line?: number;
  column?: number;
}

export interface ParsedSegment {
  type: SegmentType;
  content: SegmentContent;
  position: Position;
  raw: string;
}

export type SegmentContent =
  | TextContent
  | VariableContent
  | LinkContent
  | ImageContent
  | EmbedContent
  | CalloutContent
  | CodeBlockContent
  | DataViewContent;

export interface TextContent {
  text: string;
}

export interface VariableContent {
  name: string;
  defaultValue?: string;
}

export interface LinkContent {
  path: string;
  alias?: string;
  section?: string;
}

export interface ImageContent {
  path: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface EmbedContent {
  path: string;
  section?: string;
}

export interface CalloutContent {
  type: CalloutType | string;
  title?: string;
  content: string;
  foldable?: boolean;
  defaultFolded?: boolean;
}

export interface CodeBlockContent {
  language: string;
  code: string;
  meta?: string;
}

export interface DataViewContent {
  query: string;
  type: 'block' | 'inline';
}

export interface ProcessedContent {
  type: ContentType;
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

export interface ProcessingContext {
  variables: Map<string, string>;
  maxDepth: number;
  currentDepth: number;
  visitedFiles: Set<string>;
  errors: string[];
  warnings: string[];
}

export interface PromptMetadata {
  variables: string[];
  links: string[];
  embeds: string[];
  images: string[];
  hasDataView: boolean;
  hasCallouts: boolean;
  hasCodeBlocks: boolean;
}

export interface ProcessingResult {
  messages: PromptMessage[];
  metadata: PromptMetadata;
  errors: string[];
  warnings: string[];
}
