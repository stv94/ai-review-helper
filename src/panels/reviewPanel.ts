import * as vscode from 'vscode';
import { WebViewToExtMessage, MergeRequest, DiffBlock, ParsedDiff, ReviewNarrative, GitLabUser } from '../types';
import { getConfig, getLlmBaseUrl, validateConfig } from '../config';
import { GitLabClient, parseMrUrl } from '../clients/gitlabClient';
import { LlmClient } from '../clients/llmClient';
import { changesToDiffBlocks, parseAllDiffs } from '../parsers/diffParser';
import { ensureDiffCoverage, validateNarrativeDiffIds } from '../builders/narrativeBuilder';

export class ReviewPanel {
  static currentPanel: ReviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  // Current state
  private currentMr: MergeRequest | null = null;
  private currentDiffBlocks: DiffBlock[] = [];
  private currentUser: GitLabUser | null = null;

  private constructor(panel: vscode.WebviewPanel, private readonly extensionUri: vscode.Uri) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: WebViewToExtMessage) => this.handleMessage(msg),
      null,
      this.disposables
    );
  }

  static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ReviewPanel.currentPanel) {
      ReviewPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'aiReviewHelper',
      'AI Merge Request Reviewer',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    ReviewPanel.currentPanel = new ReviewPanel(panel, extensionUri);
  }

  private post(msg: object): void {
    this.panel.webview.postMessage(msg);
  }

  private async handleMessage(msg: WebViewToExtMessage): Promise<void> {
    switch (msg.type) {
      case 'loadMR':
        await this.loadMrByUrl(msg.mrUrl);
        break;

      case 'loadMRByIds':
        await this.loadMrByIds(msg.projectPath, msg.mrIid);
        break;

      case 'generateReview':
        await this.generateReview();
        break;

      case 'openInGitLab':
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;

      case 'openSettings':
        vscode.commands.executeCommand('ai-review-helper.openSettings');
        break;

      case 'approveMR':
        await this.handleApproveMR();
        break;

      case 'revokeMR':
        await this.handleRevokeMR();
        break;

      case 'addComment':
        await this.handleAddComment(msg.body);
        break;

      case 'deleteComment':
        await this.handleDeleteComment(msg.noteId);
        break;
    }
  }

  private async loadMrByUrl(mrUrl: string): Promise<void> {
    const cfg = getConfig();
    const errors = validateConfig(cfg);
    if (errors.length > 0) {
      this.post({
        type: 'error',
        message: `Please configure settings first:\n• ${errors.join('\n• ')}`,
      });
      return;
    }

    const parsed = parseMrUrl(mrUrl, cfg.gitlabUrl);
    if (!parsed) {
      this.post({
        type: 'error',
        message: `Cannot parse MR URL: "${mrUrl}"\nExpected format: https://gitlab.com/group/project/-/merge_requests/42`,
      });
      return;
    }

    // If the URL base differs from configured base, use configured base (trust settings)
    await this.loadMrByIds(parsed.projectPath, parsed.mrIid);
  }

  private async loadMrByIds(projectPath: string, mrIid: number): Promise<void> {
    const cfg = getConfig();
    const errors = validateConfig(cfg);
    if (errors.length > 0) {
      this.post({
        type: 'error',
        message: `Please configure settings first:\n• ${errors.join('\n• ')}`,
      });
      return;
    }

    this.post({ type: 'loading', message: 'Loading Merge Request from GitLab...' });

    try {
      const gitlab = new GitLabClient(cfg.gitlabUrl, cfg.gitlabToken);

      // Fetch required data first
      const [mr, changes] = await Promise.all([
        gitlab.getMergeRequest(projectPath, mrIid),
        gitlab.getMergeRequestChanges(projectPath, mrIid),
      ]);

      const diffBlocks = changesToDiffBlocks(changes);
      this.currentMr = mr;
      this.currentDiffBlocks = diffBlocks;

      // Fetch optional data (best-effort — failures don't block the UI)
      const [userResult, approvalsResult, notesResult] = await Promise.allSettled([
        gitlab.getCurrentUser(),
        gitlab.getMrApprovalState(projectPath, mrIid),
        gitlab.getMrNotes(projectPath, mrIid),
      ]);

      this.currentUser = userResult.status === 'fulfilled' ? userResult.value : null;
      const approvalState = approvalsResult.status === 'fulfilled' ? approvalsResult.value : null;
      const notes = notesResult.status === 'fulfilled' ? notesResult.value : [];

      this.post({
        type: 'mrLoaded',
        mr,
        diffBlocks,
        approvalState,
        notes,
        currentUserId: this.currentUser?.id ?? null,
      });
    } catch (err) {
      this.post({ type: 'error', message: (err as Error).message });
    }
  }

  private async generateReview(): Promise<void> {
    if (!this.currentMr || this.currentDiffBlocks.length === 0) {
      this.post({ type: 'error', message: 'No MR loaded. Please load a Merge Request first.' });
      return;
    }

    const cfg = getConfig();

    this.post({ type: 'loading', message: 'Generating AI review...' });

    try {
      const baseUrl = getLlmBaseUrl(cfg);
      const llm = new LlmClient(baseUrl, cfg.llmApiKey, cfg.llmModel);

      let narrative = await llm.generateNarrative(
        this.currentMr,
        this.currentDiffBlocks,
        cfg.maxDiffChunkSize,
        cfg.language
      );

      narrative = validateNarrativeDiffIds(narrative, this.currentDiffBlocks);
      narrative = ensureDiffCoverage(narrative, this.currentDiffBlocks);

      const parsedDiffs = parseAllDiffs(this.currentDiffBlocks);

      this.post({ type: 'reviewReady', narrative, parsedDiffs });
    } catch (err) {
      this.post({ type: 'error', message: `LLM error: ${(err as Error).message}` });
      // Fallback: show raw diffs
      const parsedDiffs = parseAllDiffs(this.currentDiffBlocks);
      const fallbackNarrative: ReviewNarrative = {
        overview: '',
        blocks: [
          {
            title: 'All Changes (Raw Diffs)',
            explanation: 'AI analysis failed. Showing all diff blocks below.',
            diffIds: this.currentDiffBlocks.map((b) => b.id),
            diffContexts: [],
            analysis: `Error: ${(err as Error).message}`,
          },
        ],
      };
      this.post({ type: 'reviewReady', narrative: fallbackNarrative, parsedDiffs });
    }
  }

  private async handleApproveMR(): Promise<void> {
    if (!this.currentMr) return;
    const cfg = getConfig();
    const gitlab = new GitLabClient(cfg.gitlabUrl, cfg.gitlabToken);
    try {
      await gitlab.approveMR(this.currentMr.projectPath, this.currentMr.iid);
      const approvalState = await gitlab.getMrApprovalState(this.currentMr.projectPath, this.currentMr.iid);
      this.post({ type: 'approvalUpdated', approvalState });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to approve MR: ${(err as Error).message}`);
    }
  }

  private async handleRevokeMR(): Promise<void> {
    if (!this.currentMr) return;
    const cfg = getConfig();
    const gitlab = new GitLabClient(cfg.gitlabUrl, cfg.gitlabToken);
    try {
      await gitlab.revokeMR(this.currentMr.projectPath, this.currentMr.iid);
      const approvalState = await gitlab.getMrApprovalState(this.currentMr.projectPath, this.currentMr.iid);
      this.post({ type: 'approvalUpdated', approvalState });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to revoke approval: ${(err as Error).message}`);
    }
  }

  private async handleAddComment(body: string): Promise<void> {
    if (!this.currentMr || !body.trim()) return;
    const cfg = getConfig();
    const gitlab = new GitLabClient(cfg.gitlabUrl, cfg.gitlabToken);
    try {
      const note = await gitlab.addMrNote(this.currentMr.projectPath, this.currentMr.iid, body.trim());
      this.post({ type: 'commentAdded', note });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to add comment: ${(err as Error).message}`);
    }
  }

  private async handleDeleteComment(noteId: number): Promise<void> {
    if (!this.currentMr) return;
    const cfg = getConfig();
    const gitlab = new GitLabClient(cfg.gitlabUrl, cfg.gitlabToken);
    try {
      await gitlab.deleteMrNote(this.currentMr.projectPath, this.currentMr.iid, noteId);
      this.post({ type: 'commentDeleted', noteId });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to delete comment: ${(err as Error).message}`);
    }
  }

  dispose(): void {
    ReviewPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const lang = getConfig().language || 'en';

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'main.css')
    );

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource};
                 script-src ${webview.cspSource};
                 img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>AI MR Reviewer</title>
</head>
<body>
  <div id="root" data-lang="${lang}"></div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

