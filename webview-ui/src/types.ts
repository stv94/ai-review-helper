// ---- Diff / Parsed types ----

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

export interface ParsedDiff {
  block: DiffBlock;
  hunks: DiffHunk[];
}

// ---- MR types ----

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

// ---- Narrative types ----

export interface DiffContext {
  diffId: string;
  context: string;
}

export interface NarrativeBlock {
  title: string;
  explanation: string;
  diffIds: string[];
  diffContexts: DiffContext[];
  analysis: string;
}

export interface ReviewNarrative {
  overview: string;
  blocks: NarrativeBlock[];
}

// ---- Extension → WebView messages ----

export type ExtMessage =
  | { type: 'loading'; message: string }
  | { type: 'error'; message: string }
  | { type: 'mrLoaded'; mr: MergeRequest; diffBlocks: DiffBlock[] }
  | { type: 'reviewReady'; narrative: ReviewNarrative; parsedDiffs: ParsedDiff[] };
