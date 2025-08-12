import { MCPServer, Tool, Param } from 'ts-mcp-forge';
import { Result, ok, err, ResultAsync, fromThrowable } from 'neverthrow';
import { App, TFile, getAllTags } from 'obsidian';
import { MCPSettings, NoteMetadata, PromptResource, PluginInfo } from './types';
import { PromptProcessor } from './promptProcessor';
import type { PromptArgument } from './promptProcessor/types';

export class ObsidianMCPServer extends MCPServer {
  private app: App;
  private settings: MCPSettings;
  private promptResources: Map<string, PromptResource> = new Map();
  private fileWatchers: Set<() => void> = new Set();
  private dynamicPrompts: Map<string, any> = new Map();

  constructor(app: App, settings: MCPSettings) {
    super('Obsidian MCP Server', '1.0.0');
    this.app = app;
    this.settings = settings;
    this.loadPromptResources();
    this.setupFileWatchers();

    console.log('[MCP] Server initialized with capabilities:', this.getCapabilities());
  }

  handleInitialize() {
    const baseResponse = super.handleInitialize();

    if (this.promptResources.size > 0 || this.listPrompts().length > 0) {
      baseResponse.capabilities.prompts = {
        listChanged: true,
      };
    }

    console.log('[MCP] Initialize response:', JSON.stringify(baseResponse, null, 2));

    return baseResponse;
  }

  updateSettings(settings: MCPSettings) {
    this.settings = settings;
    this.loadPromptResources();
    console.log('[MCP] Settings updated, reloading prompts');
  }

  private loadPromptResources() {
    this.promptResources.clear();

    const getMarkdownFiles = fromThrowable(
      () => this.app.vault.getMarkdownFiles(),
      (e) => `Failed to get markdown files: ${e}`
    );

    const isPromptFile = (file: TFile): boolean => {
      const checkFolder = () =>
        this.settings.promptFolders.some(
          (folder) => file.path.startsWith(folder + '/') || file.path === folder
        );

      const checkTags = () => {
        const cache = this.app.metadataCache.getFileCache(file);
        const tags = cache ? getAllTags(cache) || [] : [];
        return this.settings.promptTags.some((tag) =>
          tags.includes(tag.startsWith('#') ? tag : `#${tag}`)
        );
      };

      return checkFolder() || checkTags();
    };

    const fileToPromptResource = (file: TFile): PromptResource => {
      const promptName = file.basename.replace(/\.md$/, '').toLowerCase().replace(/\s+/g, '-');
      return {
        uri: `obsidian://prompt/${file.path}`,
        name: promptName,
        description: `Prompt from ${file.path}`,
        content: '',
        path: file.path,
      };
    };

    getMarkdownFiles()
      .map((files) => files.filter(isPromptFile))
      .map((files) =>
        files.map((file) => {
          const resource = fileToPromptResource(file);
          this.promptResources.set(resource.name, resource);
          return resource;
        })
      )
      .match(
        (resources) => {
          console.log(
            `[MCP] Loaded ${resources.length} prompt resources:`,
            resources.map((r) => r.name)
          );
          this.registerDynamicPrompts();
        },
        (error) => console.error(`[MCP] Error loading prompt resources: ${error}`)
      );
  }

  private getCapabilities() {
    return {
      tools: this.listTools().length,
      prompts: this.listPrompts().length,
      resources: this.listResources().length,
    };
  }

  private setupFileWatchers() {
    const vault = this.app.vault;

    const onCreate = this.app.vault.on('create', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        if (this.isPromptFile(file)) {
          console.log(`[MCP] Prompt file created: ${file.path}`);
          this.loadPromptResources();
          this.sendPromptListChangedNotification();
        }
      }
    });

    const onDelete = this.app.vault.on('delete', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        const promptName = file.basename.replace(/\.md$/, '').toLowerCase().replace(/\s+/g, '-');
        if (this.promptResources.has(promptName)) {
          console.log(`[MCP] Prompt file deleted: ${file.path}`);
          this.loadPromptResources();
          this.sendPromptListChangedNotification();
        }
      }
    });

    const onModify = this.app.vault.on('modify', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        if (this.isPromptFile(file)) {
          console.log(`[MCP] Prompt file modified: ${file.path}`);
          this.loadPromptResources();
          this.sendPromptListChangedNotification();
        }
      }
    });

    const onRename = this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile && file.extension === 'md') {
        const wasPrompt = this.wasPromptFile(oldPath);
        const isPrompt = this.isPromptFile(file);

        if (wasPrompt || isPrompt) {
          console.log(`[MCP] Prompt file renamed: ${oldPath} -> ${file.path}`);
          this.loadPromptResources();
          this.sendPromptListChangedNotification();
        }
      }
    });

    this.fileWatchers.add(() => vault.offref(onCreate));
    this.fileWatchers.add(() => vault.offref(onDelete));
    this.fileWatchers.add(() => vault.offref(onModify));
    this.fileWatchers.add(() => vault.offref(onRename));
  }

  private isPromptFile(file: TFile): boolean {
    const checkFolder = () =>
      this.settings.promptFolders.some(
        (folder) => file.path.startsWith(folder + '/') || file.path === folder
      );

    const getFileTags = fromThrowable(
      () => {
        const cache = this.app.metadataCache.getFileCache(file);
        return cache ? getAllTags(cache) || [] : [];
      },
      () => [] as string[]
    );

    const checkTags = (tags: string[]) =>
      this.settings.promptTags.some((tag) => tags.includes(tag.startsWith('#') ? tag : `#${tag}`));

    return checkFolder() || getFileTags().map(checkTags).unwrapOr(false);
  }

  private wasPromptFile(path: string): boolean {
    const promptName = path.replace(/\.md$/, '').toLowerCase().replace(/\s+/g, '-');
    return this.promptResources.has(promptName);
  }

  private sendPromptListChangedNotification() {
    console.log('[MCP] Prompt list changed notification should be sent');
  }

  cleanup() {
    this.fileWatchers.forEach((unregister) => unregister());
    this.fileWatchers.clear();
  }

  private async registerDynamicPrompts() {
    this.dynamicPrompts.clear();

    const processResource = async ([promptName, resource]: [string, PromptResource]): Promise<
      Result<
        { promptName: string; resource: PromptResource; variables: PromptArgument[] } | null,
        string
      >
    > => {
      const filePath = resource.path || resource.uri.replace('obsidian://prompt/', '');
      const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;

      if (!file) {
        return ok(null);
      }

      const processor = new PromptProcessor(this.app, file);
      return ResultAsync.fromPromise(
        processor.extractVariables(),
        (e) => `Failed to extract variables: ${e}`
      ).map((variables) => ({ promptName, resource, variables }));
    };

    const resources = Array.from(this.promptResources.entries());
    const promiseResults = await Promise.all(resources.map(processResource));

    promiseResults.forEach((result) => {
      if (result.isOk() && result.value !== null) {
        const { promptName, resource, variables } = result.value;
        this.dynamicPrompts.set(promptName, {
          name: promptName,
          description: resource.description,
          arguments: variables,
        });
        console.log(
          `[MCP] Registered dynamic prompt: ${promptName} with ${variables.length} variables`
        );
      }
    });
  }

  listPrompts() {
    const staticPrompts = super.listPrompts();
    const dynamicPromptsList = Array.from(this.dynamicPrompts.values());

    console.log(
      `[MCP] Listing prompts - Static: ${staticPrompts.length}, Dynamic: ${dynamicPromptsList.length}`
    );

    return [...staticPrompts, ...dynamicPromptsList];
  }

  async getPrompt(name: string, args?: any): Promise<Result<any, any>> {
    if (!this.promptResources.has(name)) {
      return super.getPrompt(name, args) as Promise<Result<any, any>>;
    }

    const resource = this.promptResources.get(name)!;
    const filePath = resource.path || resource.uri.replace('obsidian://prompt/', '');
    const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;

    if (!file) {
      return err(`Prompt file not found: ${filePath}`) as Result<any, any>;
    }

    const processor = new PromptProcessor(this.app, file);
    const result = await processor.processPrompt(args);

    return result.map((processed) => {
      console.log(
        `[MCP] Serving dynamic prompt: ${name} with ${processed.messages.length} messages`
      );
      return {
        description: resource.description,
        messages: processed.messages,
      };
    }) as Result<any, any>;
  }

  async complete(
    ref: { type: string; name?: string; uri?: string },
    argument?: { name: string; value: string }
  ): Promise<Result<any, string>> {
    const getPromptCompletions = (searchValue: string) =>
      Result.fromThrowable(
        () => {
          const matches = Array.from(this.promptResources.keys())
            .filter((name) => name.toLowerCase().includes(searchValue.toLowerCase()))
            .slice(0, 100);
          return {
            completion: {
              values: matches,
              total: matches.length,
              hasMore: false,
            },
          };
        },
        (e) => `Failed to generate completions: ${e}`
      )();

    const emptyCompletion = () =>
      ok({
        completion: {
          values: [],
          total: 0,
          hasMore: false,
        },
      });

    return ref.type === 'ref/prompt' && argument?.name === 'promptName'
      ? getPromptCompletions(argument.value)
      : emptyCompletion();
  }

  @Tool('notes', 'List all notes in the vault')
  async notes(): Promise<Result<NoteMetadata[], string>> {
    return Result.fromThrowable(
      () => this.app.vault.getMarkdownFiles(),
      (e) => `Failed to list notes: ${e}`
    )().map((files) => files.map((file) => this.fileToMetadata(file)));
  }

  @Tool('read', 'Read the content of a note')
  async read(@Param('Path to the note') path: string): Promise<Result<string, string>> {
    const file = this.app.vault.getAbstractFileByPath(path) as TFile;
    if (!file) {
      return err(`Note not found: ${path}`);
    }

    return ResultAsync.fromPromise(this.app.vault.read(file), (e) => `Failed to read note: ${e}`);
  }

  @Tool('create', 'Create a new note')
  async create(
    @Param('Path for the new note') path: string,
    @Param('Content of the note') content: string
  ): Promise<Result<string, string>> {
    const existingFile = this.app.vault.getAbstractFileByPath(path);
    if (existingFile) {
      return err(`Note already exists: ${path}`);
    }

    return ResultAsync.fromPromise(
      this.app.vault.create(path, content),
      (e) => `Failed to create note: ${e}`
    ).map((file) => `Created note: ${file.path}`);
  }

  @Tool('update', 'Update an existing note')
  async update(
    @Param('Path to the note') path: string,
    @Param('New content for the note') content: string
  ): Promise<Result<string, string>> {
    const file = this.app.vault.getAbstractFileByPath(path) as TFile;
    if (!file) {
      return err(`Note not found: ${path}`);
    }

    return ResultAsync.fromPromise(
      this.app.vault.modify(file, content),
      (e) => `Failed to update note: ${e}`
    ).map(() => `Updated note: ${path}`);
  }

  @Tool('delete', 'Delete a note')
  async delete(@Param('Path to the note') path: string): Promise<Result<string, string>> {
    const file = this.app.vault.getAbstractFileByPath(path) as TFile;
    if (!file) {
      return err(`Note not found: ${path}`);
    }

    return ResultAsync.fromPromise(
      this.app.vault.delete(file),
      (e) => `Failed to delete note: ${e}`
    ).map(() => `Deleted note: ${path}`);
  }

  @Tool('search', 'Search notes by content or title')
  async search(@Param('Search query') query: string): Promise<Result<NoteMetadata[], string>> {
    const lowerQuery = query.toLowerCase();

    const files = Result.fromThrowable(
      () => this.app.vault.getMarkdownFiles(),
      (e) => `Failed to get files: ${e}`
    )();

    if (files.isErr()) {
      return err(files.error);
    }

    const checkFile = async (file: TFile): Promise<TFile | null> => {
      if (file.basename.toLowerCase().includes(lowerQuery)) {
        return file;
      }

      try {
        const content = await this.app.vault.cachedRead(file);
        if (content.toLowerCase().includes(lowerQuery)) {
          return file;
        }
      } catch (e) {
        console.error(`Failed to read file ${file.path}: ${e}`);
      }

      return null;
    };

    const results = await Promise.all(files.value.map(checkFile));
    const matchingFiles = results
      .filter((file): file is TFile => file !== null)
      .map((file) => this.fileToMetadata(file));

    return ok(matchingFiles);
  }

  @Tool('tags', 'Get all tags used in the vault')
  async tags(): Promise<Result<string[], string>> {
    const extractTagsFromFile = (file: TFile): string[] => {
      const cache = this.app.metadataCache.getFileCache(file);
      return cache ? getAllTags(cache) || [] : [];
    };

    return Result.fromThrowable(
      () => this.app.vault.getMarkdownFiles(),
      (e) => `Failed to get files: ${e}`
    )()
      .map((files) => files.flatMap(extractTagsFromFile))
      .map((allTags) => [...new Set(allTags)].sort());
  }

  @Tool('plugins', 'List all installed Obsidian plugins')
  async plugins(): Promise<Result<PluginInfo[], string>> {
    const getPluginDocumentationUrl = (pluginId: string, manifest: any): string | undefined => {
      if (manifest.authorUrl?.includes('github.com')) {
        return manifest.authorUrl;
      }

      if (manifest.fundingUrl?.includes('github.com')) {
        const match = manifest.fundingUrl.match(/github\.com\/sponsors\/([^/]+)/);
        if (match) {
          return `https://github.com/${match[1]}`;
        }
        return manifest.fundingUrl;
      }

      if (manifest.authorUrl) return manifest.authorUrl;
      if (manifest.fundingUrl) return manifest.fundingUrl;

      const internalPlugins = [
        'file-explorer',
        'global-search',
        'switcher',
        'graph',
        'backlink',
        'page-preview',
        'note-composer',
        'command-palette',
        'editor-status',
        'markdown-importer',
        'word-count',
        'file-recovery',
      ];
      if (internalPlugins.includes(pluginId)) {
        return `https://help.obsidian.md/Plugins/Core+plugins`;
      }

      return undefined;
    };

    const manifestToPluginInfo = (
      pluginId: string,
      manifest: any,
      enabledPlugins: Set<string>
    ): PluginInfo => ({
      id: pluginId,
      name: manifest.name || pluginId,
      description: manifest.description || '',
      version: manifest.version || '',
      author: manifest.author || '',
      enabled: enabledPlugins.has(pluginId),
      documentationUrl: getPluginDocumentationUrl(pluginId, manifest),
      authorUrl: manifest.authorUrl,
      fundingUrl: manifest.fundingUrl,
    });

    const sortByName = (plugins: PluginInfo[]) =>
      [...plugins].sort((a, b) => a.name.localeCompare(b.name));

    return Result.fromThrowable(
      () => {
        const appWithPlugins = this.app as any;
        const manifests = appWithPlugins.plugins?.manifests || {};
        const enabledPlugins = appWithPlugins.plugins?.enabledPlugins || new Set<string>();
        return { manifests, enabledPlugins };
      },
      (e) => `Failed to access plugins: ${e}`
    )()
      .map(({ manifests, enabledPlugins }) =>
        Object.entries(manifests).map(([id, manifest]) =>
          manifestToPluginInfo(id, manifest, enabledPlugins)
        )
      )
      .map(sortByName);
  }

  private fileToMetadata(file: TFile): NoteMetadata {
    const extractTags = fromThrowable(
      () => {
        const cache = this.app.metadataCache.getFileCache(file);
        return cache ? getAllTags(cache) || [] : [];
      },
      () => [] as string[]
    );

    return {
      path: file.path,
      name: file.basename,
      created: file.stat.ctime,
      modified: file.stat.mtime,
      size: file.stat.size,
      tags: extractTags().unwrapOr([]),
    };
  }
}
