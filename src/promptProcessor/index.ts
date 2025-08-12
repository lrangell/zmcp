import { App, TFile, getAllTags } from 'obsidian';
import { Result, ok, err } from 'neverthrow';
import { match } from 'ts-pattern';
import { pipe, map, filter, flatMap, reduce, unique } from 'remeda';
import { SegmentType, ContentType, MessageRole, REGEX_PATTERNS } from './constants';
import {
  ParsedSegment,
  ProcessedContent,
  PromptArgument,
  ProcessingContext,
  ProcessingResult,
  PromptMetadata,
  TextContent,
  VariableContent,
  LinkContent,
  ImageContent,
  CalloutContent,
  CodeBlockContent,
  DataViewContent,
  EmbedContent,
} from './types';
import {
  sanitizeTagName,
  getMimeType,
  isImageExtension,
  parseObsidianLink,
  parseImageDimensions,
  sortByPosition,
  mergeOverlappingSegments,
  extractTextBetweenSegments,
  bufferToBase64,
  getFileExtension,
  getBaseName,
} from './utils';
import { PromptMessage } from '../types';

export class PromptProcessor {
  constructor(
    private app: App,
    private file: TFile
  ) {}

  async processPrompt(args?: Record<string, string>): Promise<Result<ProcessingResult, string>> {
    try {
      const content = await this.app.vault.read(this.file);
      const segmentsResult = this.parseSegments(content);

      if (segmentsResult.isErr()) {
        return err(segmentsResult.error);
      }

      const processed = await this.processSegments(segmentsResult.value, args);
      const result = this.buildResult(processed);

      return ok(result);
    } catch (error) {
      return err(`Failed to process prompt: ${String(error)}`);
    }
  }

  async extractVariables(): Promise<PromptArgument[]> {
    try {
      const content = await this.app.vault.read(this.file);
      const regex = new RegExp(REGEX_PATTERNS.VARIABLE);
      const matches = Array.from(content.matchAll(regex));

      return pipe(
        matches,
        map((match) => match[1]),
        unique(),
        map((name: string) => ({
          name,
          description: `Variable: ${name}`,
          required: true,
        }))
      );
    } catch (error) {
      console.error('Failed to extract variables:', error);
      return [];
    }
  }

  private parseSegments(content: string): Result<ParsedSegment[], string> {
    const parsers = [
      () => this.parseVariables(content),
      () => this.parseLinks(content),
      () => this.parseImages(content),
      () => this.parseCallouts(content),
      () => this.parseCodeBlocks(content),
      () => this.parseDataView(content),
    ];

    const allSegments = pipe(
      parsers,
      map((parser) => parser()),
      flatMap((segments) => segments)
    );

    const mergedSegments = pipe(allSegments, mergeOverlappingSegments, sortByPosition);

    const textBetween = extractTextBetweenSegments(content, mergedSegments);

    const completeSegments = this.insertTextSegments(content, mergedSegments, textBetween);

    return ok(completeSegments);
  }

  private parseVariables(content: string): ParsedSegment[] {
    const regex = new RegExp(REGEX_PATTERNS.VARIABLE);
    const matches = Array.from(content.matchAll(regex));

    return matches.map((match) => ({
      type: SegmentType.Variable,
      content: {
        name: match[1],
      } as VariableContent,
      position: {
        start: match.index!,
        end: match.index! + match[0].length,
      },
      raw: match[0],
    }));
  }

  private parseLinks(content: string): ParsedSegment[] {
    const regex = new RegExp(REGEX_PATTERNS.LINK);
    const matches = Array.from(content.matchAll(regex));

    return matches.map((match) => {
      const linkContent = parseObsidianLink(match[1]);
      return {
        type: SegmentType.Link,
        content: linkContent as LinkContent,
        position: {
          start: match.index!,
          end: match.index! + match[0].length,
        },
        raw: match[0],
      };
    });
  }

  private parseImages(content: string): ParsedSegment[] {
    const regex = new RegExp(REGEX_PATTERNS.IMAGE);
    const matches = Array.from(content.matchAll(regex));

    return matches.map((match) => {
      const imageContent = parseImageDimensions(match[1]);
      const extension = getFileExtension(imageContent.path);

      const segmentType = isImageExtension(extension) ? SegmentType.Image : SegmentType.Embed;

      if (segmentType === SegmentType.Image) {
        return {
          type: SegmentType.Image,
          content: imageContent as ImageContent,
          position: {
            start: match.index!,
            end: match.index! + match[0].length,
          },
          raw: match[0],
        };
      } else {
        return {
          type: SegmentType.Embed,
          content: {
            path: imageContent.path,
          } as EmbedContent,
          position: {
            start: match.index!,
            end: match.index! + match[0].length,
          },
          raw: match[0],
        };
      }
    });
  }

  private parseCallouts(content: string): ParsedSegment[] {
    const lines = content.split('\n');
    const segments: ParsedSegment[] = [];
    let inCallout = false;
    let calloutStart = 0;
    let calloutContent: string[] = [];
    let calloutType = '';
    let calloutTitle = '';
    let calloutFoldable = false;
    let calloutDefaultFolded = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const calloutMatch = line.match(/^>\s*\[!(\w+)\]([+-]?)\s*(.*)$/);

      if (calloutMatch) {
        if (inCallout && calloutContent.length > 0) {
          segments.push(
            this.createCalloutSegment(
              calloutStart,
              content,
              calloutType,
              calloutTitle,
              calloutContent,
              calloutFoldable,
              calloutDefaultFolded
            )
          );
        }

        inCallout = true;
        calloutStart = content.indexOf(line, calloutStart);
        calloutType = calloutMatch[1];
        calloutFoldable = calloutMatch[2] !== '';
        calloutDefaultFolded = calloutMatch[2] === '-';
        calloutTitle = calloutMatch[3] || '';
        calloutContent = [];
      } else if (inCallout && line.startsWith('>')) {
        calloutContent.push(line.substring(1).trim());
      } else if (inCallout) {
        segments.push(
          this.createCalloutSegment(
            calloutStart,
            content,
            calloutType,
            calloutTitle,
            calloutContent,
            calloutFoldable,
            calloutDefaultFolded
          )
        );
        inCallout = false;
        calloutContent = [];
      }
    }

    if (inCallout && calloutContent.length > 0) {
      segments.push(
        this.createCalloutSegment(
          calloutStart,
          content,
          calloutType,
          calloutTitle,
          calloutContent,
          calloutFoldable,
          calloutDefaultFolded
        )
      );
    }

    return segments;
  }

  private createCalloutSegment(
    start: number,
    content: string,
    type: string,
    title: string,
    calloutContent: string[],
    foldable: boolean,
    defaultFolded: boolean
  ): ParsedSegment {
    const fullContent = calloutContent.join('\n');
    const endLine = start + fullContent.length + title.length + type.length + 10;

    return {
      type: SegmentType.Callout,
      content: {
        type,
        title,
        content: fullContent,
        foldable,
        defaultFolded,
      } as CalloutContent,
      position: {
        start,
        end: Math.min(endLine, content.length),
      },
      raw: `> [!${type}]${title ? ' ' + title : ''}\n> ${fullContent}`,
    };
  }

  private parseCodeBlocks(content: string): ParsedSegment[] {
    const regex = new RegExp(REGEX_PATTERNS.CODE_BLOCK, 'gm');
    const matches = Array.from(content.matchAll(regex));

    return matches
      .filter((match) => match[1] !== 'dataview')
      .map((match) => ({
        type: SegmentType.CodeBlock,
        content: {
          language: match[1] || 'text',
          code: match[2],
        } as CodeBlockContent,
        position: {
          start: match.index!,
          end: match.index! + match[0].length,
        },
        raw: match[0],
      }));
  }

  private parseDataView(content: string): ParsedSegment[] {
    const blockRegex = new RegExp(REGEX_PATTERNS.DATAVIEW_BLOCK, 'gm');
    const inlineRegex = new RegExp(REGEX_PATTERNS.DATAVIEW_INLINE);

    const blockMatches = Array.from(content.matchAll(blockRegex));
    const inlineMatches = Array.from(content.matchAll(inlineRegex));

    const blockSegments = blockMatches.map((match) => ({
      type: SegmentType.DataView,
      content: {
        query: match[1],
        type: 'block',
      } as DataViewContent,
      position: {
        start: match.index!,
        end: match.index! + match[0].length,
      },
      raw: match[0],
    }));

    const inlineSegments = inlineMatches.map((match) => ({
      type: SegmentType.DataView,
      content: {
        query: match[1],
        type: 'inline',
      } as DataViewContent,
      position: {
        start: match.index!,
        end: match.index! + match[0].length,
      },
      raw: match[0],
    }));

    return [...blockSegments, ...inlineSegments];
  }

  private insertTextSegments(
    content: string,
    segments: ParsedSegment[],
    _textBetween: string[]
  ): ParsedSegment[] {
    const result: ParsedSegment[] = [];
    let lastEnd = 0;

    if (segments.length > 0 && segments[0].position.start > 0) {
      const text = content.substring(0, segments[0].position.start);
      if (text.trim()) {
        result.push({
          type: SegmentType.Text,
          content: { text } as TextContent,
          position: { start: 0, end: segments[0].position.start },
          raw: text,
        });
      }
    }

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      if (segment.position.start > lastEnd) {
        const text = content.substring(lastEnd, segment.position.start);
        if (text.trim()) {
          result.push({
            type: SegmentType.Text,
            content: { text } as TextContent,
            position: { start: lastEnd, end: segment.position.start },
            raw: text,
          });
        }
      }

      result.push(segment);
      lastEnd = segment.position.end;
    }

    if (lastEnd < content.length) {
      const text = content.substring(lastEnd);
      if (text.trim()) {
        result.push({
          type: SegmentType.Text,
          content: { text } as TextContent,
          position: { start: lastEnd, end: content.length },
          raw: text,
        });
      }
    }

    return result;
  }

  private async processSegments(
    segments: ParsedSegment[],
    args?: Record<string, string>
  ): Promise<ProcessedContent[]> {
    const context: ProcessingContext = {
      variables: new Map(Object.entries(args || {})),
      maxDepth: 5,
      currentDepth: 0,
      visitedFiles: new Set([this.file.path]),
      errors: [],
      warnings: [],
    };

    const processedSegments = await Promise.all(
      segments.map((segment) => this.processSegment(segment, context))
    );

    return processedSegments.flat();
  }

  private async processSegment(
    segment: ParsedSegment,
    context: ProcessingContext
  ): Promise<ProcessedContent[]> {
    return match(segment)
      .with({ type: SegmentType.Text }, (s) => {
        const content = s.content as TextContent;
        return Promise.resolve([{ type: ContentType.Text, text: content.text }]);
      })
      .with({ type: SegmentType.Variable }, (s) => {
        const varContent = s.content as VariableContent;
        const value =
          context.variables.get(varContent.name) ||
          varContent.defaultValue ||
          `{{${varContent.name}}}`;
        return Promise.resolve([{ type: ContentType.Text, text: value }]);
      })
      .with({ type: SegmentType.Link }, async (s) => {
        const linkContent = s.content as LinkContent;
        const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
          linkContent.path,
          this.file.path
        );

        if (linkedFile && linkedFile instanceof TFile) {
          if (context.visitedFiles.has(linkedFile.path)) {
            context.warnings.push(`Circular reference detected: ${linkedFile.path}`);
            return [{ type: ContentType.Text, text: s.raw }];
          }

          if (context.currentDepth >= context.maxDepth) {
            context.warnings.push(`Max depth reached for: ${linkedFile.path}`);
            return [{ type: ContentType.Text, text: s.raw }];
          }

          try {
            const content = await this.app.vault.read(linkedFile);
            const noteName = getBaseName(linkedFile.path);
            const tagName = sanitizeTagName(noteName);
            const wrappedContent = `\n<${tagName}>\n${content}\n</${tagName}>\n`;
            return [{ type: ContentType.Text, text: wrappedContent }];
          } catch {
            context.errors.push(`Failed to read linked file: ${linkedFile.path}`);
            return [{ type: ContentType.Text, text: s.raw }];
          }
        }

        return [{ type: ContentType.Text, text: s.raw }];
      })
      .with({ type: SegmentType.Image }, async (s) => {
        const imageContent = s.content as ImageContent;
        const imageFile = this.app.metadataCache.getFirstLinkpathDest(
          imageContent.path,
          this.file.path
        );

        if (imageFile && imageFile instanceof TFile) {
          try {
            const data = await this.app.vault.readBinary(imageFile);
            const base64 = bufferToBase64(data);
            const mimeType = getMimeType(imageFile.extension);

            return [
              {
                type: ContentType.Image,
                data: base64,
                mimeType,
              },
            ];
          } catch {
            context.errors.push(`Failed to read image: ${imageFile.path}`);
            return [];
          }
        }

        context.warnings.push(`Image not found: ${imageContent.path}`);
        return [];
      })
      .with({ type: SegmentType.Embed }, async (s) => {
        const embedContent = s.content as EmbedContent;
        const embedFile = this.app.metadataCache.getFirstLinkpathDest(
          embedContent.path,
          this.file.path
        );

        if (embedFile && embedFile instanceof TFile) {
          if (context.visitedFiles.has(embedFile.path)) {
            context.warnings.push(`Circular embed detected: ${embedFile.path}`);
            return [{ type: ContentType.Text, text: s.raw }];
          }

          try {
            const content = await this.app.vault.read(embedFile);
            const noteName = getBaseName(embedFile.path);
            const tagName = sanitizeTagName(noteName);
            const wrappedContent = `\n<${tagName}>\n${content}\n</${tagName}>\n`;
            return [{ type: ContentType.Text, text: wrappedContent }];
          } catch {
            context.errors.push(`Failed to read embed: ${embedFile.path}`);
            return [{ type: ContentType.Text, text: s.raw }];
          }
        }

        return [{ type: ContentType.Text, text: s.raw }];
      })
      .with({ type: SegmentType.Callout }, (s) => {
        const calloutContent = s.content as CalloutContent;
        const tagName = sanitizeTagName(calloutContent.type);
        const wrappedContent = calloutContent.title
          ? `\n<${tagName} title="${calloutContent.title}">\n${calloutContent.content}\n</${tagName}>\n`
          : `\n<${tagName}>\n${calloutContent.content}\n</${tagName}>\n`;
        return Promise.resolve([{ type: ContentType.Text, text: wrappedContent }]);
      })
      .with({ type: SegmentType.CodeBlock }, (s) => {
        const codeContent = s.content as CodeBlockContent;
        const wrappedContent = `\n<code language="${codeContent.language}">\n${codeContent.code}\n</code>\n`;
        return Promise.resolve([{ type: ContentType.Text, text: wrappedContent }]);
      })
      .with({ type: SegmentType.DataView }, async (s) => {
        const dataViewContent = s.content as DataViewContent;
        const results = await this.executeDataViewQuery(dataViewContent.query);
        const wrappedContent = `\n<dataview-results>\n${results}\n</dataview-results>\n`;
        return [{ type: ContentType.Text, text: wrappedContent }];
      })
      .otherwise(() => Promise.resolve([]));
  }

  private async executeDataViewQuery(query: string): Promise<string> {
    const listMatch = query.match(/LIST\s+FROM\s+#(\w+)/i);
    if (listMatch) {
      const tag = `#${listMatch[1]}`;
      const files = this.app.vault.getMarkdownFiles();

      const results = pipe(
        files,
        filter((file) => {
          const cache = this.app.metadataCache.getFileCache(file);
          const tags = cache ? getAllTags(cache) || [] : [];
          return tags.includes(tag);
        }),
        map((file) => `- [[${file.basename}]]`)
      );

      return results.join('\n') || 'No results found';
    }

    const tableMatch = query.match(/TABLE\s+(.+?)\s+FROM\s+#(\w+)/i);
    if (tableMatch) {
      const fields = tableMatch[1].split(',').map((f) => f.trim());
      const tag = `#${tableMatch[2]}`;
      const files = this.app.vault.getMarkdownFiles();

      const matchingFiles = pipe(
        files,
        filter((file) => {
          const cache = this.app.metadataCache.getFileCache(file);
          const tags = cache ? getAllTags(cache) || [] : [];
          return tags.includes(tag);
        })
      );

      if (matchingFiles.length === 0) {
        return 'No results found';
      }

      const headers = ['File', ...fields].join(' | ');
      const separator = headers
        .split(' | ')
        .map(() => '---')
        .join(' | ');
      const rows = matchingFiles.map((file) => {
        const row = [`[[${file.basename}]]`];

        fields.forEach(() => row.push('-'));

        return row.join(' | ');
      });

      return [headers, separator, ...rows].join('\n');
    }

    return `<!-- Unsupported DataView query: ${query} -->`;
  }

  private buildResult(processed: ProcessedContent[]): ProcessingResult {
    const messages = this.toPromptMessages(processed);
    const metadata = this.extractMetadata(processed);

    return {
      messages,
      metadata,
      errors: [],
      warnings: [],
    };
  }

  private toPromptMessages(processed: ProcessedContent[]): PromptMessage[] {
    return pipe(
      processed,
      reduce(
        (acc, item) => {
          return match(item)
            .with({ type: ContentType.Text }, (textItem) => {
              const lastMessage = acc.messages[acc.messages.length - 1];

              if (lastMessage && lastMessage.content.type === ContentType.Text) {
                lastMessage.content.text = (lastMessage.content.text || '') + textItem.text;
                return acc;
              } else {
                return {
                  ...acc,
                  messages: [
                    ...acc.messages,
                    {
                      role: MessageRole.User,
                      content: {
                        type: ContentType.Text,
                        text: textItem.text,
                      },
                    },
                  ],
                };
              }
            })
            .with({ type: ContentType.Image }, (imageItem) => ({
              ...acc,
              messages: [
                ...acc.messages,
                {
                  role: MessageRole.User,
                  content: {
                    type: ContentType.Image,
                    data: imageItem.data,
                    mimeType: imageItem.mimeType,
                  },
                },
              ],
            }))
            .otherwise(() => acc);
        },
        { messages: [] as PromptMessage[] }
      ),
      (result) => result.messages
    );
  }

  private extractMetadata(_processed: ProcessedContent[]): PromptMetadata {
    return {
      variables: [],
      links: [],
      embeds: [],
      images: [],
      hasDataView: false,
      hasCallouts: false,
      hasCodeBlocks: false,
    };
  }
}

export * from './types';
export * from './constants';
export * from './utils';
