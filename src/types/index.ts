export interface DiffBlock {
  id: string;
  filePath: string;
  oldPath: string;
  newPath: string;
  patch: string;
  isNewFile: boolean;
  isDeletedFile: boolean;
  isRenamedFile: boolean;
}

export interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'header';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface ParsedDiff {
  block: DiffBlock;
  hunks: DiffHunk[];
}

export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  author_name: string;
  created_at: string;
}

export interface MergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  author: { name: string; username: string };
  web_url: string;
  source_branch: string;
  target_branch: string;
  state: string;
  created_at: string;
  project_id: number;
  projectPath: string;
}

export interface GitLabChange {
  old_path: string;
  new_path: string;
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
  diff: string;
}

export interface NarrativeBlock {
  title: string;
  explanation: string;
  diffIds: string[];
  analysis: string;
}

export interface ReviewNarrative {
  blocks: NarrativeBlock[];
}

export interface ExtensionConfig {
  gitlabUrl: string;
  gitlabToken: string;
  llmProvider: string;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
  maxDiffChunkSize: number;
  language: string;
}

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
  zh: '中文',
  ja: '日本語',
};

export interface ReviewState {
  mr: MergeRequest;
  diffBlocks: DiffBlock[];
  parsedDiffs: ParsedDiff[];
  narrative: ReviewNarrative;
  currentBlockIndex: number;
}

// Messages from WebView to Extension
export type WebViewToExtMessage =
  | { type: 'loadMR'; mrUrl: string }
  | { type: 'loadMRByIds'; projectPath: string; mrIid: number }
  | { type: 'generateReview' }
  | { type: 'openInGitLab'; url: string }
  | { type: 'openSettings' }
  | { type: 'saveSettings'; settings: Partial<ExtensionConfig> }
  | { type: 'testGitLab' }
  | { type: 'testLLM' }
  | { type: 'ready' };

// Messages from Extension to WebView
export type ExtToWebViewMessage =
  | { type: 'mrLoaded'; mr: MergeRequest; diffBlocks: DiffBlock[] }
  | { type: 'reviewReady'; narrative: ReviewNarrative; parsedDiffs: ParsedDiff[] }
  | { type: 'settingsLoaded'; settings: ExtensionConfig }
  | { type: 'settingsSaved' }
  | { type: 'testResult'; target: 'gitlab' | 'llm'; success: boolean; message: string }
  | { type: 'error'; message: string }
  | { type: 'loading'; message: string };
