import { App, PluginSettingTab, Setting, TFolder, FuzzySuggestModal } from 'obsidian';
import MCPPlugin from './main';

class FolderSuggestModal extends FuzzySuggestModal<string> {
  private folders: string[];
  private onChoose: (folder: string) => void;

  constructor(app: App, folders: string[], onChoose: (folder: string) => void) {
    super(app);
    this.folders = folders;
    this.onChoose = onChoose;
    this.setPlaceholder('Search for a folder...');
  }

  getItems(): string[] {
    return this.folders;
  }

  getItemText(folder: string): string {
    return folder;
  }

  onChooseItem(folder: string): void {
    this.onChoose(folder);
  }
}

class TagSuggestModal extends FuzzySuggestModal<string> {
  private tags: string[];
  private onChoose: (tag: string) => void;

  constructor(app: App, tags: string[], onChoose: (tag: string) => void) {
    super(app);
    this.tags = tags;
    this.onChoose = onChoose;
    this.setPlaceholder('Search for a tag...');
  }

  getItems(): string[] {
    return this.tags;
  }

  getItemText(tag: string): string {
    return tag;
  }

  onChooseItem(tag: string): void {
    this.onChoose(tag);
  }
}

export class MCPSettingTab extends PluginSettingTab {
  plugin: MCPPlugin;

  constructor(app: App, plugin: MCPPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();

    this.containerEl.createEl('h2', { text: 'MCP Server Settings' });

    new Setting(this.containerEl)
      .setName('Server Status')
      .setDesc('Enable or disable the MCP server')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.serverEnabled).onChange(async (value) => {
          this.plugin.settings.serverEnabled = value;
          await this.plugin.saveSettings();

          if (value) {
            await this.plugin.startServer();
          } else {
            await this.plugin.stopServer();
          }

          this.display();
        })
      );

    if (this.plugin.settings.serverEnabled && this.plugin.isServerRunning()) {
      this.containerEl.createEl('div', {
        text: `🟢 Server running on port ${this.plugin.settings.port}`,
        cls: 'setting-item-description',
      });
    } else if (this.plugin.settings.serverEnabled && !this.plugin.isServerRunning()) {
      this.containerEl.createEl('div', {
        text: '🔴 Server failed to start',
        cls: 'setting-item-description mod-warning',
      });
    }

    new Setting(this.containerEl)
      .setName('Port')
      .setDesc('Port number for the MCP server')
      .addText((text) =>
        text
          .setPlaceholder('3000')
          .setValue(String(this.plugin.settings.port))
          .onChange(async (value) => {
            const port = parseInt(value);
            if (!isNaN(port) && port > 0 && port < 65536) {
              this.plugin.settings.port = port;
              await this.plugin.saveSettings();

              if (this.plugin.settings.serverEnabled) {
                await this.plugin.restartServer();
              }
            }
          })
      );

    this.containerEl.createEl('h3', { text: 'Prompt Resources' });
    this.containerEl.createEl('p', {
      text: 'Select folders and tags to serve as prompt resources',
      cls: 'setting-item-description',
    });

    this.createFoldersSection(this.containerEl);

    this.createTagsSection(this.containerEl);
  }

  private createFoldersSection(containerEl: HTMLElement): void {
    const folderSetting = new Setting(containerEl)
      .setName('Prompt Folders')
      .setDesc('Click "Add Folder" to select folders to include as prompt sources');

    const selectedFoldersContainer = containerEl.createDiv({
      cls: 'selected-items-container',
    });

    selectedFoldersContainer.style.marginBottom = '10px';
    selectedFoldersContainer.style.minHeight = '30px';

    this.renderSelectedFolders(selectedFoldersContainer);

    folderSetting.addButton((button) => {
      button.setButtonText('Add Folder').onClick(() => {
        const allFolders = this.getAllFolders();
        const availableFolders = allFolders.filter(
          (folder) => !this.plugin.settings.promptFolders.includes(folder)
        );

        const modal = new FolderSuggestModal(this.app, availableFolders, async (folder) => {
          if (!this.plugin.settings.promptFolders.includes(folder)) {
            this.plugin.settings.promptFolders.push(folder);
            await this.plugin.saveSettings();
            this.plugin.updateServerSettings();
            this.renderSelectedFolders(selectedFoldersContainer);
          }
        });
        modal.open();
      });
    });
  }

  private createTagsSection(containerEl: HTMLElement): void {
    const tagSetting = new Setting(containerEl)
      .setName('Prompt Tags')
      .setDesc('Click "Add Tag" to select tags to include as prompt sources');

    const selectedTagsContainer = containerEl.createDiv({
      cls: 'selected-items-container',
    });

    selectedTagsContainer.style.marginBottom = '10px';
    selectedTagsContainer.style.minHeight = '30px';

    this.renderSelectedTags(selectedTagsContainer);

    tagSetting.addButton((button) => {
      button.setButtonText('Add Tag').onClick(() => {
        const allTags = this.getAllTags();
        const availableTags = allTags.filter(
          (tag) => !this.plugin.settings.promptTags.includes(tag)
        );

        const modal = new TagSuggestModal(this.app, availableTags, async (tag) => {
          if (!this.plugin.settings.promptTags.includes(tag)) {
            this.plugin.settings.promptTags.push(tag);
            await this.plugin.saveSettings();
            this.plugin.updateServerSettings();
            this.renderSelectedTags(selectedTagsContainer);
          }
        });
        modal.open();
      });
    });
  }

  private renderSelectedFolders(container: HTMLElement): void {
    container.empty();

    if (this.plugin.settings.promptFolders.length === 0) {
      container.createEl('div', {
        text: 'No folders selected',
        cls: 'setting-item-description',
      });
      return;
    }

    const listEl = container.createEl('div', {
      cls: 'selected-items-list',
    });

    this.plugin.settings.promptFolders.forEach((folder) => {
      const itemEl = listEl.createDiv({
        cls: 'selected-item',
      });

      itemEl.style.display = 'inline-flex';
      itemEl.style.alignItems = 'center';
      itemEl.style.margin = '2px';
      itemEl.style.padding = '2px 8px';
      itemEl.style.backgroundColor = 'var(--background-secondary)';
      itemEl.style.borderRadius = '4px';
      itemEl.style.border = '1px solid var(--background-modifier-border)';

      itemEl.createSpan({ text: folder });

      const removeBtn = itemEl.createSpan({
        text: '×',
        cls: 'remove-item',
      });

      removeBtn.style.marginLeft = '8px';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.fontWeight = 'bold';
      removeBtn.style.color = 'var(--text-muted)';

      removeBtn.addEventListener('click', async () => {
        this.plugin.settings.promptFolders = this.plugin.settings.promptFolders.filter(
          (f) => f !== folder
        );
        await this.plugin.saveSettings();
        this.plugin.updateServerSettings();
        this.renderSelectedFolders(container);
      });

      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.color = 'var(--text-error)';
      });

      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.color = 'var(--text-muted)';
      });
    });
  }

  private renderSelectedTags(container: HTMLElement): void {
    container.empty();

    if (this.plugin.settings.promptTags.length === 0) {
      container.createEl('div', {
        text: 'No tags selected',
        cls: 'setting-item-description',
      });
      return;
    }

    const listEl = container.createEl('div', {
      cls: 'selected-items-list',
    });

    this.plugin.settings.promptTags.forEach((tag) => {
      const itemEl = listEl.createDiv({
        cls: 'selected-item',
      });

      itemEl.style.display = 'inline-flex';
      itemEl.style.alignItems = 'center';
      itemEl.style.margin = '2px';
      itemEl.style.padding = '2px 8px';
      itemEl.style.backgroundColor = 'var(--background-secondary)';
      itemEl.style.borderRadius = '4px';
      itemEl.style.border = '1px solid var(--background-modifier-border)';

      itemEl.createSpan({ text: tag });

      const removeBtn = itemEl.createSpan({
        text: '×',
        cls: 'remove-item',
      });

      removeBtn.style.marginLeft = '8px';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.fontWeight = 'bold';
      removeBtn.style.color = 'var(--text-muted)';

      removeBtn.addEventListener('click', async () => {
        this.plugin.settings.promptTags = this.plugin.settings.promptTags.filter((t) => t !== tag);
        await this.plugin.saveSettings();
        this.plugin.updateServerSettings();
        this.renderSelectedTags(container);
      });

      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.color = 'var(--text-error)';
      });

      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.color = 'var(--text-muted)';
      });
    });
  }

  private getAllFolders(): string[] {
    const folders: string[] = [];
    const vault = this.app.vault;

    const addFolder = (folder: TFolder) => {
      if (folder.path && folder.path !== '/') {
        folders.push(folder.path);
      }

      folder.children.forEach((child) => {
        if (child instanceof TFolder) {
          addFolder(child);
        }
      });
    };

    addFolder(vault.getRoot());
    return folders.sort();
  }

  private getAllTags(): string[] {
    const tags = new Set<string>();
    const files = this.app.vault.getMarkdownFiles();

    files.forEach((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.tags) {
        cache.tags.forEach((tag) => tags.add(tag.tag));
      }
      if (cache?.frontmatter?.tags) {
        const frontmatterTags = cache.frontmatter.tags;
        if (Array.isArray(frontmatterTags)) {
          frontmatterTags.forEach((tag) => tags.add(tag.startsWith('#') ? tag : `#${tag}`));
        }
      }
    });

    return Array.from(tags).sort();
  }
}
