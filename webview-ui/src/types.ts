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

// ---- GitLab user / notes / approvals ----

export interface GitLabUser {
  id: number;
  name: string;
  username: string;
}

export interface GitLabNote {
  id: number;
  body: string;
  author: GitLabUser;
  created_at: string;
  updated_at: string;
  system: boolean;
  type?: string | null;
}

export interface ApprovalState {
  approved: boolean;
  approvedBy: GitLabUser[];
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
  | { type: 'mrLoaded'; mr: MergeRequest; diffBlocks: DiffBlock[]; approvalState: ApprovalState | null; notes: GitLabNote[]; currentUserId: number | null }
  | { type: 'reviewReady'; narrative: ReviewNarrative; parsedDiffs: ParsedDiff[] }
  | { type: 'approvalUpdated'; approvalState: ApprovalState }
  | { type: 'commentAdded'; note: GitLabNote }
  | { type: 'commentDeleted'; noteId: number };
