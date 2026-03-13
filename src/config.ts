import * as vscode from 'vscode';
import { ExtensionConfig } from './types';

const SECTION = 'ai-review-helper';

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    gitlabUrl: cfg.get<string>('gitlabUrl', 'https://gitlab.com').replace(/\/$/, ''),
    gitlabToken: cfg.get<string>('gitlabToken', ''),
    llmProvider: cfg.get<string>('llmProvider', 'openai'),
    llmApiKey: cfg.get<string>('llmApiKey', ''),
    llmModel: cfg.get<string>('llmModel', 'gpt-4o'),
    llmBaseUrl: cfg.get<string>('llmBaseUrl', ''),
    maxDiffChunkSize: cfg.get<number>('maxDiffChunkSize', 8000),
  };
}

export async function saveConfig(settings: Partial<ExtensionConfig>): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const target = vscode.ConfigurationTarget.Global;

  const updates: [string, unknown][] = [];

  if (settings.gitlabUrl !== undefined) updates.push(['gitlabUrl', settings.gitlabUrl]);
  if (settings.gitlabToken !== undefined) updates.push(['gitlabToken', settings.gitlabToken]);
  if (settings.llmProvider !== undefined) updates.push(['llmProvider', settings.llmProvider]);
  if (settings.llmApiKey !== undefined) updates.push(['llmApiKey', settings.llmApiKey]);
  if (settings.llmModel !== undefined) updates.push(['llmModel', settings.llmModel]);
  if (settings.llmBaseUrl !== undefined) updates.push(['llmBaseUrl', settings.llmBaseUrl]);
  if (settings.maxDiffChunkSize !== undefined) updates.push(['maxDiffChunkSize', settings.maxDiffChunkSize]);

  for (const [key, value] of updates) {
    await cfg.update(key, value, target);
  }
}

export function getLlmBaseUrl(config: ExtensionConfig): string {
  if (config.llmBaseUrl) {
    return config.llmBaseUrl.replace(/\/$/, '');
  }
  switch (config.llmProvider) {
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'openai':
    default:
      return 'https://api.openai.com/v1';
  }
}

export function validateConfig(config: ExtensionConfig): string[] {
  const errors: string[] = [];

  if (!config.gitlabUrl) {
    errors.push('GitLab URL is required');
  }
  if (!config.gitlabToken) {
    errors.push('GitLab Token is required');
  }
  if (!config.llmApiKey) {
    errors.push('LLM API Key is required');
  }
  if (!config.llmModel) {
    errors.push('LLM Model is required');
  }

  return errors;
}
