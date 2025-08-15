export class Logger {
  private static instance: Logger;
  private debugMode: boolean = false;
  private prefix = '[zMCP]';

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
    if (enabled) {
      this.debug('Debug mode enabled');
    }
  }

  private formatMessage(level: string, message: string): string {
    return `${this.prefix} [${level}] ${message}`;
  }

  error(message: string, ...args: any[]) {
    console.error(this.formatMessage('ERROR', message), ...args);
  }

  warn(message: string, ...args: any[]) {
    if (this.debugMode) {
      console.warn(this.formatMessage('WARN', message), ...args);
    }
  }

  info(message: string, ...args: any[]) {
    if (this.debugMode) {
      console.info(this.formatMessage('INFO', message), ...args);
    }
  }

  debug(message: string, ...args: any[]) {
    if (this.debugMode) {
      console.log(this.formatMessage('DEBUG', message), ...args);
    }
  }

  trace(message: string, ...args: any[]) {
    if (this.debugMode) {
      console.log(this.formatMessage('TRACE', message), ...args);
    }
  }
}

export const logger = Logger.getInstance();
