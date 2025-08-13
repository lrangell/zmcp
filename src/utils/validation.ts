import { App, TFile } from 'obsidian';
import { MCPSettings } from '../types';
import { getFileTags } from './fileOperations';

export const createFileValidator = (settings: MCPSettings, _app: App) => {
  const isPromptFile = (file: TFile): boolean => {
    const checkFolder = () =>
      settings.promptFolders.some(
        (folder) => file.path.startsWith(folder + '/') || file.path === folder
      );

    const checkTags = () => {
      const tags: string[] = getFileTags(file.path).unwrapOr([]);
      return settings.promptTags.some((tag) =>
        tags.includes(tag.startsWith('#') ? tag : `#${tag}`)
      );
    };

    return checkFolder() || checkTags();
  };

  const extractFileTags = (file: TFile): string[] => {
    const tags: string[] = getFileTags(file.path).unwrapOr([]);
    return tags;
  };

  const generatePromptName = (path: string): string => {
    return path.replace(/\.md$/, '').toLowerCase().replace(/\s+/g, '-');
  };

  return {
    isPromptFile,
    extractFileTags,
    generatePromptName,
  };
};
