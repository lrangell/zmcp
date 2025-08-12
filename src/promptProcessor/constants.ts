export enum SegmentType {
  Text = 'text',
  Variable = 'variable',
  Link = 'link',
  Image = 'image',
  Embed = 'embed',
  Callout = 'callout',
  CodeBlock = 'code',
  DataView = 'dataview',
}

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
}

export enum ContentType {
  Text = 'text',
  Image = 'image',
  Audio = 'audio',
  Resource = 'resource',
}

export enum CalloutType {
  Note = 'note',
  Tip = 'tip',
  Important = 'important',
  Warning = 'warning',
  Caution = 'caution',
  Abstract = 'abstract',
  Summary = 'summary',
  Success = 'success',
  Question = 'question',
  Failure = 'failure',
  Danger = 'danger',
  Bug = 'bug',
  Example = 'example',
  Quote = 'quote',
  Info = 'info',
}

export const REGEX_PATTERNS = {
  VARIABLE: /\{\{(\w+)\}\}/g,
  LINK: /\[\[([^\]]+)\]\]/g,
  IMAGE: /!\[\[([^\]]+)\]\]/g,
  EMBED: /!\[\[([^\]]+)\]\]/g,
  CALLOUT: /^>\s*\[!(\w+)\]([+-]?)\s*(.*)?$/gm,
  CODE_BLOCK: /^```(\w*)\n([\s\S]*?)^```$/gm,
  DATAVIEW_BLOCK: /^```dataview\n([\s\S]*?)^```$/gm,
  DATAVIEW_INLINE: /`=\s*([\s\S]*?)\s*`/g,
} as const;

export const MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  pdf: 'application/pdf',
} as const;
