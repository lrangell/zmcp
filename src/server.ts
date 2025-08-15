import { MCPServer, Tool, Param, ErrorCode, McpError, wrapError } from 'ts-mcp-forge';
import { Result, ok, err, ResultAsync, okAsync } from 'neverthrow';
import { App, TFile } from 'obsidian';
import { MCPSettings, NoteMetadata, PromptResource, PluginInfo, PluginManifest } from './types';
import {
  Task,
  TaskFilter,
  CreateTaskParams,
  UpdateTaskParams,
  CompleteTaskParams,
  SearchTaskParams,
} from './types/tasks';
import { PromptProcessor } from './promptProcessor';
import type { PromptArgument } from './promptProcessor/types';
import {
  getFile,
  getMarkdownFiles,
  readFile,
  createFile,
  modifyFile,
  deleteFile,
  readFileByTFile,
  modifyFileByTFile,
  fileExists,
} from './utils/fileOperations';
import { filterTasks, getMatchContext, searchTaskText } from './utils/taskMatcher';
import { applyUpdates, createTaskLine, formatTask, updateTaskInContent } from './utils/taskUpdater';
import {
  readAllTasks,
  readTasksFromFile,
  insertTaskIntoContent,
  findTaskAtLine,
  parseJSON,
  getOrCreateFile,
} from './utils/taskHelpers';
import { createFileValidator } from './utils/validation';

export class ObsidianMCPServer extends MCPServer {
  private app: App;
  private settings: MCPSettings;
  private promptResources: Map<string, PromptResource> = new Map();
  private fileWatchers: Set<() => void> = new Set();
  private vaultPrompts: Map<string, any> = new Map();

  constructor(app: App, settings: MCPSettings) {
    super('Obsidian MCP Server', '1.0.0');
    this.app = app;
    this.settings = settings;
    this.loadPromptResources();
    this.setupFileWatchers();
  }

  handleInitialize() {
    const baseResponse = super.handleInitialize();

    const promptsList = this.listPrompts();
    const promptsCount = Array.isArray(promptsList) ? promptsList.length : 0;

    if (this.promptResources.size > 0 || promptsCount > 0) {
      baseResponse.capabilities.prompts = {
        listChanged: true,
      };
    }

    return baseResponse;
  }

  updateSettings(settings: MCPSettings) {
    this.settings = settings;
    this.loadPromptResources();
  }

  private loadPromptResources() {
    this.promptResources.clear();

    const validator = createFileValidator(this.settings, this.app);

    const markdownFilesResult = getMarkdownFiles();

    const fileToPromptResource = (file: TFile): PromptResource => {
      const promptName = validator.generatePromptName(file.basename);
      return {
        uri: `obsidian://prompt/${file.path}`,
        name: promptName,
        description: `Prompt from ${file.path}`,
        content: '',
        path: file.path,
      };
    };

    markdownFilesResult
      .map((files) => files.filter(validator.isPromptFile))
      .map((files) =>
        files.map((file) => {
          const resource = fileToPromptResource(file);
          this.promptResources.set(resource.name, resource);
          return resource;
        })
      )
      .match(
        () => {
          this.registerDynamicPrompts();
        },
        () => {}
      );
  }

  private getCapabilities() {
    const tools = this.listTools();
    const prompts = this.listPrompts();
    const resources = this.listResources();

    return {
      tools: Array.isArray(tools) ? tools.length : (tools as any)?.tools?.length || 0,
      prompts: Array.isArray(prompts) ? prompts.length : (prompts as any)?.prompts?.length || 0,
      resources: Array.isArray(resources)
        ? resources.length
        : (resources as any)?.resources?.length || 0,
    };
  }

  private setupFileWatchers() {
    const vault = this.app.vault;

    const onCreate = this.app.vault.on('create', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        if (this.isPromptFile(file)) {
          this.loadPromptResources();
          this.sendPromptListChangedNotification();
        }
      }
    });

    const onDelete = this.app.vault.on('delete', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        const promptName = file.basename.replace(/\.md$/, '').toLowerCase().replace(/\s+/g, '-');
        if (this.promptResources.has(promptName)) {
          this.loadPromptResources();
          this.sendPromptListChangedNotification();
        }
      }
    });

    const onModify = this.app.vault.on('modify', (file) => {
      if (file instanceof TFile && file.extension === 'md') {
        if (this.isPromptFile(file)) {
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
    const validator = createFileValidator(this.settings, this.app);
    return validator.isPromptFile(file);
  }

  private wasPromptFile(path: string): boolean {
    const validator = createFileValidator(this.settings, this.app);
    const promptName = validator.generatePromptName(path);
    return this.promptResources.has(promptName);
  }

  private sendPromptListChangedNotification() {
    // Notification will be implemented when ts-mcp-forge adds support
  }

  cleanup() {
    this.fileWatchers.forEach((unregister) => unregister());
    this.fileWatchers.clear();
  }

  private async registerDynamicPrompts() {
    this.vaultPrompts.clear();

    const processResource = async ([promptName, resource]: [string, PromptResource]): Promise<
      Result<
        { promptName: string; resource: PromptResource; variables: PromptArgument[] } | null,
        string
      >
    > => {
      const filePath = resource.path || resource.uri.replace('obsidian://prompt/', '');

      if (!fileExists(filePath)) {
        return ok(null);
      }

      const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;

      const processor = new PromptProcessor(this.app, file);
      return ResultAsync.fromPromise(
        processor.extractVariables(),
        (e) => `Failed to extract variables: ${e}`
      ).map((variables) => ({ promptName, resource, variables }));
    };

    const resources = Array.from(this.promptResources.entries());
    const promiseResults = await Promise.all(resources.map(processResource));

    promiseResults.forEach((result) => {
      result
        .map((value) => {
          if (value !== null) {
            const { promptName, resource, variables } = value;
            this.vaultPrompts.set(promptName, {
              name: promptName,
              description: resource.description,
              arguments: variables,
            });
          }
        })
        .mapErr(() => {
          /* Ignore errors for individual resources */
        });
    });
  }

  listPrompts() {
    const staticPrompts = super.listPrompts();
    const vaultPromptsList = Array.from(this.vaultPrompts.values());

    // Handle both array and object return types from super.listPrompts()
    const staticArray = Array.isArray(staticPrompts) ? staticPrompts : [];

    return [...staticArray, ...vaultPromptsList];
  }

  async getPrompt(name: string, args?: any): Promise<Result<any, McpError>> {
    if (!this.promptResources.has(name)) {
      return super.getPrompt(name, args);
    }

    const resource = this.promptResources.get(name)!;
    const filePath = resource.path || resource.uri.replace('obsidian://prompt/', '');

    if (!fileExists(filePath)) {
      return err(wrapError(ErrorCode.InvalidRequest, `Prompt file not found: ${filePath}`));
    }

    const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;

    const processor = new PromptProcessor(this.app, file);
    const result = await processor.processPrompt(args);

    return result
      .map((processed) => ({
        description: resource.description,
        messages: processed.messages,
      }))
      .mapErr((error) => wrapError(ErrorCode.InternalError, error));
  }

  async complete(
    ref: { type: string; name?: string; uri?: string },
    argument?: { name: string; value: string }
  ): Promise<
    Result<{ completion: { values: string[]; total: number; hasMore: boolean } }, string>
  > {
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
    return getMarkdownFiles().map((files) => files.map((file) => this.fileToMetadata(file)));
  }

  @Tool('read', 'Read the content of a note')
  async read(@Param('Path to the note') path: string): Promise<Result<string, string>> {
    return readFile(path);
  }

  @Tool('create', 'Create a new note')
  async create(
    @Param('Path for the new note') path: string,
    @Param('Content of the note') content: string
  ): Promise<Result<string, string>> {
    return createFile(path, content).map((file) => `Created note: ${file.path}`);
  }

  @Tool('update', 'Update an existing note')
  async update(
    @Param('Path to the note') path: string,
    @Param('New content for the note') content: string
  ): Promise<Result<string, string>> {
    return modifyFile(path, content).map(() => `Updated note: ${path}`);
  }

  @Tool('delete', 'Delete a note')
  async delete(@Param('Path to the note') path: string): Promise<Result<string, string>> {
    return deleteFile(path).map(() => `Deleted note: ${path}`);
  }

  @Tool('search', 'Search notes by content or title')
  async search(@Param('Search query') query: string): Promise<Result<NoteMetadata[], string>> {
    const lowerQuery = query.toLowerCase();

    return getMarkdownFiles().asyncAndThen((files) =>
      ResultAsync.fromPromise(
        (async () => {
          const checkFile = async (file: TFile): Promise<TFile | null> => {
            if (file.basename.toLowerCase().includes(lowerQuery)) {
              return file;
            }

            try {
              const content = await this.app.vault.cachedRead(file);
              if (content.toLowerCase().includes(lowerQuery)) {
                return file;
              }
            } catch {
              // Failed to read file, skip it
            }

            return null;
          };

          const results = await Promise.all(files.map(checkFile));
          const matchingFiles = results
            .filter((file): file is TFile => file !== null)
            .map((file) => this.fileToMetadata(file));

          return matchingFiles;
        })(),
        (error) => `Failed to search files: ${String(error)}`
      )
    );
  }

  @Tool('tags', 'Get all tags used in the vault')
  async tags(): Promise<Result<string[], string>> {
    const validator = createFileValidator(this.settings, this.app);

    return getMarkdownFiles()
      .map((files) => files.flatMap(validator.extractFileTags))
      .map((allTags) => [...new Set(allTags)].sort());
  }

  @Tool('plugins', 'List all installed Obsidian plugins')
  async plugins(): Promise<Result<PluginInfo[], string>> {
    const getPluginDocumentationUrl = (
      pluginId: string,
      manifest: PluginManifest
    ): string | undefined => {
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
      manifest: PluginManifest,
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
        const appWithPlugins = this.app as App & {
          plugins?: {
            manifests?: Record<string, PluginManifest>;
            enabledPlugins?: Set<string>;
          };
        };
        const manifests = appWithPlugins.plugins?.manifests || {};
        const enabledPlugins = appWithPlugins.plugins?.enabledPlugins || new Set<string>();
        return { manifests, enabledPlugins };
      },
      () => 'Failed to access plugins'
    )()
      .map(({ manifests, enabledPlugins }) =>
        Object.entries(manifests).map(([id, manifest]) =>
          manifestToPluginInfo(id, manifest, enabledPlugins)
        )
      )
      .map(sortByName);
  }

  @Tool('list-tasks', 'Query and retrieve tasks from the vault')
  async listTasks(
    @Param('Filter by task status') status?: TaskFilter['status'],
    @Param('Filter by priority level') priority?: TaskFilter['priority'],
    @Param('Limit to specific file or folder') path?: string,
    @Param('Tasks due before date (YYYY-MM-DD)') due_before?: string,
    @Param('Tasks due after date (YYYY-MM-DD)') due_after?: string,
    @Param('Only recurring tasks') is_recurring?: boolean,
    @Param('Filter by tags (comma-separated)') tags?: string,
    @Param('Maximum results to return') limit?: number
  ): Promise<
    Result<
      {
        tasks: Task[];
        total: number;
        filtered: number;
      },
      string
    >
  > {
    const filter: TaskFilter = {
      status,
      priority,
      path,
      due_before,
      due_after,
      is_recurring,
      tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
      limit,
    };

    return readAllTasks(this.app.vault)
      .map((allTasks) => {
        const filteredTasks = filterTasks(allTasks, filter);
        return {
          tasks: filteredTasks,
          total: allTasks.length,
          filtered: filteredTasks.length,
        };
      })
      .mapErr((error) => `Failed to list tasks: ${error}`);
  }

  @Tool('create-task', 'Create new tasks in specified locations')
  async createTask(
    @Param('Task description') text: string,
    @Param('Target file path') file: string,
    @Param('Where to add (append/prepend/after_heading)')
    position?: CreateTaskParams['position'],
    @Param('Heading to add task under') heading?: string,
    @Param('Priority level') priority?: CreateTaskParams['priority'],
    @Param('Due date (YYYY-MM-DD)') due?: string,
    @Param('Scheduled date (YYYY-MM-DD)') scheduled?: string,
    @Param('Start date (YYYY-MM-DD)') start?: string,
    @Param('Recurrence pattern') recurrence?: string,
    @Param('Tags (comma-separated)') tags?: string
  ): Promise<
    Result<
      {
        created: boolean;
        task: Task;
        location: {
          file: string;
          line: number;
        };
      },
      string
    >
  > {
    const taskTags = tags ? tags.split(',').map((t) => t.trim()) : [];
    const taskLine = createTaskLine(text, {
      priority,
      due,
      scheduled,
      start,
      recurrence,
      tags: taskTags,
    });

    const fileResult = getOrCreateFile(this.app.vault, file, '').andThen((existingFile) =>
      readFileByTFile(existingFile).andThen((content) => {
        const actualContent = content || '';
        const result = insertTaskIntoContent(actualContent, taskLine, position, heading);
        return result.asyncAndThen(
          ({ content: newContent, lineNumber }: { content: string; lineNumber: number }) =>
            modifyFileByTFile(existingFile, newContent).map(() => lineNumber)
        );
      })
    );

    return fileResult.map((lineNumber: number) => {
      const task: Task = {
        text,
        status: 'open',
        priority,
        dates: { due, scheduled, start },
        recurrence,
        tags: taskTags,
        location: { file, line: lineNumber, heading },
        indent: 0,
      };

      return {
        created: true,
        task,
        location: { file, line: lineNumber },
      };
    });
  }

  @Tool('update-task', 'Modify existing tasks')
  async updateTask(
    @Param('File containing the task') file: string,
    @Param('Line number of task') line: number,
    @Param('Updates to apply (JSON)') updates?: string
  ): Promise<
    Result<
      {
        updated: boolean;
        before: Task;
        after: Task;
      },
      string
    >
  > {
    const taskUpdates = updates
      ? parseJSON<UpdateTaskParams['updates']>(updates)
      : ok({} as UpdateTaskParams['updates']);

    return getFile(file)
      .asyncAndThen((fileObj: TFile) =>
        readFileByTFile(fileObj).andThen((content) =>
          readTasksFromFile(this.app.vault, fileObj)
            .andThen((tasks) => findTaskAtLine(tasks, line))
            .map((task) => ({ task, content, fileObj }))
        )
      )
      .andThen(({ task, content, fileObj }) => {
        const updatedTask = applyUpdates(task, taskUpdates.unwrapOr({}));
        const newTaskLine = formatTask(updatedTask);
        const newContent = updateTaskInContent(content, line, newTaskLine);

        return modifyFileByTFile(fileObj, newContent).map(() => ({
          updated: true,
          before: task,
          after: updatedTask,
        }));
      })
      .mapErr((error) => `Failed to update task: ${error}`);
  }

  @Tool('complete-task', 'Mark tasks as complete')
  async completeTask(
    @Param('File containing the task') file: string,
    @Param('Line number') line: number,
    @Param('Date of completion (YYYY-MM-DD)') completion_date?: string
  ): Promise<
    Result<
      {
        completed: boolean;
        task: Task;
        recurrence?: string;
      },
      string
    >
  > {
    const params: CompleteTaskParams = {
      file,
      line,
      completion_date,
    };

    const today = new Date().toISOString().split('T')[0];
    const completionDate = params.completion_date || today;

    return getFile(params.file)
      .asyncAndThen((fileObj) =>
        readFileByTFile(fileObj).andThen((content) =>
          readTasksFromFile(this.app.vault, fileObj)
            .andThen((tasks) => findTaskAtLine(tasks, line))
            .map((task) => ({ task, content, fileObj }))
        )
      )
      .andThen(({ task, content, fileObj }) => {
        const completedTask = {
          ...task,
          status: 'done' as const,
          dates: {
            ...task.dates,
            completed: completionDate,
          },
        };

        const newTaskLine = formatTask(completedTask);
        const newContent = updateTaskInContent(content, line, newTaskLine);

        return modifyFileByTFile(fileObj, newContent).map(() => ({
          completed: true,
          task: completedTask,
          recurrence: task.recurrence,
        }));
      })
      .mapErr((error) => `Failed to complete task: ${error}`);
  }

  @Tool('search-tasks', 'Search tasks by content')
  async searchTasks(
    @Param('Search text') query: string,
    @Param('Case sensitive search') case_sensitive?: boolean,
    @Param('Include completed tasks') search_completed?: boolean,
    @Param('Limit to path') path?: string
  ): Promise<
    Result<
      {
        matches: Array<{
          task: Task;
          matched_text: string;
          context: string;
        }>;
        total: number;
      },
      string
    >
  > {
    const params: SearchTaskParams = {
      query,
      case_sensitive,
      search_completed,
      path,
    };

    return getMarkdownFiles()
      .map((files: TFile[]) =>
        files.filter((file) => !params.path || file.path.includes(params.path))
      )
      .asyncAndThen((files: TFile[]) => {
        const searchResults = files.map((file) =>
          readTasksFromFile(this.app.vault, file)
            .map((tasks) =>
              tasks
                .filter((task) => params.search_completed || task.status !== 'done')
                .filter((task) => searchTaskText(task, params.query, params.case_sensitive))
                .map((task) => {
                  const { matched_text, context } = getMatchContext(task.text, params.query);
                  return { task, matched_text, context };
                })
            )
            .orElse(() => okAsync([]))
        );

        return ResultAsync.combineWithAllErrors(searchResults)
          .map((results) => {
            const matches = results.flat();
            return {
              matches,
              total: matches.length,
            };
          })
          .orElse(() => okAsync({ matches: [], total: 0 }));
      })
      .mapErr((error) => `Failed to search tasks: ${error}`);
  }

  private fileToMetadata(file: TFile): NoteMetadata {
    const validator = createFileValidator(this.settings, this.app);

    return {
      path: file.path,
      name: file.basename,
      created: file.stat.ctime,
      modified: file.stat.mtime,
      size: file.stat.size,
      tags: validator.extractFileTags(file),
    };
  }
}
