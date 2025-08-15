import { Plugin, Notice } from 'obsidian';
import { HTTPTransport } from 'ts-mcp-forge';
import { ObsidianMCPServer } from './server';
import { MCPSettingTab } from './settings';
import { MCPSettings, DEFAULT_SETTINGS, PLUGIN_NAME } from './types';
import { logger } from './utils/logger';

export default class MCPPlugin extends Plugin {
  settings: MCPSettings;
  private server: ObsidianMCPServer | null = null;
  private transport: HTTPTransport | null = null;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new MCPSettingTab(this.app, this));

    this.addCommand({
      id: 'start-mcp-server',
      name: `Start ${PLUGIN_NAME}`,
      callback: () => this.startServer(),
    });

    this.addCommand({
      id: 'stop-mcp-server',
      name: `Stop ${PLUGIN_NAME}`,
      callback: () => this.stopServer(),
    });

    this.addCommand({
      id: 'restart-mcp-server',
      name: `Restart ${PLUGIN_NAME}`,
      callback: () => this.restartServer(),
    });

    if (this.settings.serverEnabled) {
      await this.startServer();
    }
  }

  async onunload() {
    await this.stopServer();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async startServer() {
    try {
      logger.info('Starting MCP server...');
      if (this.transport) {
        await this.stopServer();
      }

      this.server = new ObsidianMCPServer(this.app, this.settings);
      this.transport = new HTTPTransport({
        port: this.settings.port,
        host: '0.0.0.0',
      });

      await this.transport.start(this.server);

      logger.info(`Server started successfully on port ${this.settings.port}`);
      new Notice(`${PLUGIN_NAME} started on port ${this.settings.port}`);
    } catch (error) {
      logger.error('Failed to start server:', error);
      new Notice(`Failed to start ${PLUGIN_NAME}: ${error}`);
      this.transport = null;
      this.server = null;
    }
  }

  async stopServer() {
    try {
      logger.info('Stopping MCP server...');
      if (this.transport) {
        if (this.server) {
          this.server.cleanup();
        }

        await this.transport.stop();
        this.transport = null;
        this.server = null;
        logger.info('Server stopped');
        new Notice(`${PLUGIN_NAME} stopped`);
      }
    } catch (error) {
      logger.error('Failed to stop server:', error);
      new Notice(`Failed to stop ${PLUGIN_NAME}: ${error}`);
    }
  }

  async restartServer() {
    await this.stopServer();
    if (this.settings.serverEnabled) {
      await this.startServer();
    }
  }

  updateServerSettings() {
    if (this.server) {
      this.server.updateSettings(this.settings);
    }
  }

  isServerRunning(): boolean {
    return this.transport !== null;
  }
}
