import type { PromptArgument } from './promptProcessor/types';

export interface MCPSettings {
  port: number;
  promptFolders: string[];
  promptTags: string[];
  serverEnabled: boolean;
}

export const DEFAULT_SETTINGS: MCPSettings = {
  port: 3000,
  promptFolders: [],
  promptTags: [],
  serverEnabled: false,
};

export interface NoteMetadata {
  path: string;
  name: string;
  created: number;
  modified: number;
  size: number;
  tags: string[];
}

export interface PromptResource {
  uri: string;
  name: string;
  description: string;
  content: string;
  path?: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
  documentationUrl?: string;
  authorUrl?: string;
  fundingUrl?: string;
}

export interface PluginManifest {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  authorUrl?: string;
  fundingUrl?: string;
}

export interface DynamicPrompt {
  name: string;
  description: string;
  arguments: PromptArgument[];
}

export interface PromptContent {
  description: string;
  messages: PromptMessage[];
}

export interface PromptMessage {
  role: 'user' | 'assistant' | 'system';
  content: MessageContent;
}

export interface MessageContent {
  type: 'text' | 'image' | 'audio' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}
