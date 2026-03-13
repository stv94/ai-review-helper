import * as vscode from 'vscode';
import { WebViewToExtMessage, MergeRequest, DiffBlock, ParsedDiff, ReviewNarrative } from '../types';
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

      const [mr, changes] = await Promise.all([
        gitlab.getMergeRequest(projectPath, mrIid),
        gitlab.getMergeRequestChanges(projectPath, mrIid),
      ]);

      const diffBlocks = changesToDiffBlocks(changes);
      this.currentMr = mr;
      this.currentDiffBlocks = diffBlocks;

      this.post({ type: 'mrLoaded', mr, diffBlocks });
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
        blocks: [
          {
            title: 'All Changes (Raw Diffs)',
            explanation: 'AI analysis failed. Showing all diff blocks below.',
            diffIds: this.currentDiffBlocks.map((b) => b.id),
            analysis: `Error: ${(err as Error).message}`,
          },
        ],
      };
      this.post({ type: 'reviewReady', narrative: fallbackNarrative, parsedDiffs });
    }
  }

  dispose(): void {
    ReviewPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  private getHtml(): string {
    const nonce = getNonce();
    const lang = getConfig().language || 'en';
    return /* html */ `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src data:;">
  <title>AI MR Reviewer</title>
  <style nonce="${nonce}">
    :root {
      --radius: 6px;
      --added: #2ea043;
      --added-bg: rgba(46,160,67,0.12);
      --removed: #f85149;
      --removed-bg: rgba(248,81,73,0.12);
      --context-fg: var(--vscode-editor-foreground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    /* ========== Layout ========== */
    .app { display: flex; flex-direction: column; height: 100vh; }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: var(--vscode-titleBar-activeBackground, var(--vscode-editor-background));
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      flex-shrink: 0;
    }
    .toolbar-title {
      font-weight: 600;
      font-size: 1em;
      white-space: nowrap;
    }
    .toolbar-spacer { flex: 1; }

    .content { flex: 1; overflow: hidden; display: flex; }

    /* ========== Screens ========== */
    .screen { display: none; flex: 1; overflow-y: auto; padding: 24px; }
    .screen.active { display: flex; flex-direction: column; }

    /* ========== Input Screen ========== */
    .input-card {
      background: var(--vscode-editorWidget-background, var(--vscode-input-background));
      border: 1px solid var(--vscode-widget-border, #444);
      border-radius: var(--radius);
      padding: 28px;
      max-width: 600px;
      margin: 40px auto 0;
      width: 100%;
    }
    .input-card h2 { font-size: 1.2em; margin-bottom: 6px; }
    .input-card p { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-bottom: 24px; }

    .input-section { margin-bottom: 24px; }
    .input-label {
      font-weight: 500;
      margin-bottom: 6px;
      display: block;
    }

    .url-row { display: flex; gap: 8px; }

    input[type="text"], input[type="number"] {
      width: 100%;
      padding: 8px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: var(--radius);
      font-family: inherit;
      font-size: inherit;
      outline: none;
    }
    input:focus { border-color: var(--vscode-focusBorder); }

    .ids-row { display: flex; gap: 8px; align-items: end; }
    .ids-row .field { flex: 1; }
    .ids-row .field label { display: block; font-size: 0.88em; margin-bottom: 4px; color: var(--vscode-descriptionForeground); }

    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 20px 0;
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--vscode-widget-border, #444);
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      font-weight: 500;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      white-space: nowrap;
    }
    .btn-primary:not(:disabled):hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:not(:disabled):hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-sm { padding: 5px 10px; font-size: 0.85em; }
    .btn-ghost {
      background: transparent;
      border: 1px solid var(--vscode-widget-border, #555);
      color: var(--vscode-foreground);
      padding: 5px 10px;
      font-size: 0.85em;
    }
    .btn-ghost:hover { background: var(--vscode-list-hoverBackground); }

    /* ========== Loading ========== */
    .loading-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: var(--vscode-descriptionForeground);
    }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid var(--vscode-widget-border, #444);
      border-top-color: var(--vscode-button-background);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ========== Error ========== */
    .error-box {
      background: rgba(248,81,73,0.1);
      border: 1px solid var(--vscode-testing-iconFailed, #f14c4c);
      border-radius: var(--radius);
      padding: 16px;
      white-space: pre-wrap;
      color: var(--vscode-testing-iconFailed, #f85149);
      font-size: 0.9em;
    }

    /* ========== MR Header ========== */
    .mr-header {
      background: var(--vscode-editorWidget-background, var(--vscode-input-background));
      border: 1px solid var(--vscode-widget-border, #444);
      border-radius: var(--radius);
      padding: 16px 20px;
      margin-bottom: 20px;
      flex-shrink: 0;
    }
    .mr-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .mr-iid { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .mr-title { font-weight: 600; font-size: 1.1em; }
    .mr-meta {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: 500;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .mr-description {
      margin-top: 10px;
      font-size: 0.88em;
      color: var(--vscode-descriptionForeground);
      white-space: pre-wrap;
      max-height: 80px;
      overflow: hidden;
      position: relative;
    }
    .mr-description.expanded { max-height: none; }
    .expand-link {
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      font-size: 0.85em;
    }

    .header-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;
    }

    /* ========== Walkthrough ========== */
    .walkthrough { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    .nav-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .nav-counter {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
      min-width: 80px;
    }
    .nav-spacer { flex: 1; }
    .jump-select {
      padding: 5px 8px;
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: var(--radius);
      font-family: inherit;
      font-size: 0.88em;
      max-width: 250px;
    }

    .block-content { flex: 1; overflow-y: auto; padding-bottom: 20px; }

    .narrative-block {
      background: var(--vscode-editorWidget-background, var(--vscode-input-background));
      border: 1px solid var(--vscode-widget-border, #444);
      border-radius: var(--radius);
      overflow: hidden;
      margin-bottom: 20px;
    }

    .block-header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .block-step {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 50%;
      width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.82em;
      font-weight: 700;
      flex-shrink: 0;
    }
    .block-title { font-weight: 600; font-size: 1.05em; }

    .block-section {
      padding: 14px 18px;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
    }
    .block-section:last-child { border-bottom: none; }
    .block-section-label {
      font-size: 0.78em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }
    .block-explanation { line-height: 1.6; white-space: pre-wrap; }

    .block-analysis {
      line-height: 1.6;
      white-space: pre-wrap;
      background: rgba(255, 200, 50, 0.06);
      border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700);
      padding: 10px 14px;
      border-radius: 0 var(--radius) var(--radius) 0;
      font-size: 0.92em;
    }

    /* ========== Diff Viewer ========== */
    .diff-container {
      border: 1px solid var(--vscode-widget-border, #444);
      border-radius: var(--radius);
      overflow: hidden;
      margin-bottom: 12px;
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      font-size: var(--vscode-editor-font-size, 13px);
    }

    .diff-file-header {
      background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
      padding: 6px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      flex-wrap: wrap;
    }
    .diff-file-path {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.88em;
      color: var(--vscode-foreground);
      flex: 1;
      word-break: break-all;
    }
    .diff-badge {
      font-size: 0.75em;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 600;
    }
    .diff-badge.new { background: rgba(46,160,67,0.25); color: var(--added); }
    .diff-badge.deleted { background: rgba(248,81,73,0.25); color: var(--removed); }
    .diff-badge.renamed { background: rgba(130,80,255,0.25); color: #a78bfa; }

    .diff-mode-toggle {
      display: flex;
      gap: 4px;
    }
    .diff-mode-btn {
      padding: 2px 8px;
      font-size: 0.8em;
      border: 1px solid var(--vscode-widget-border, #555);
      border-radius: 3px;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
    }
    .diff-mode-btn.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    .diff-hunk-header {
      background: rgba(130,80,255,0.08);
      border-top: 1px solid var(--vscode-widget-border, #333);
      border-bottom: 1px solid var(--vscode-widget-border, #333);
      padding: 3px 12px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.82em;
      user-select: none;
    }

    /* Inline mode */
    .diff-inline table { width: 100%; border-collapse: collapse; }
    .diff-inline td { vertical-align: top; }
    .line-num {
      width: 40px;
      min-width: 40px;
      text-align: right;
      padding: 1px 8px 1px 4px;
      color: var(--vscode-editorLineNumber-foreground, #858585);
      font-size: 0.85em;
      user-select: none;
      border-right: 1px solid var(--vscode-widget-border, #333);
    }
    .line-sign {
      width: 18px;
      min-width: 18px;
      text-align: center;
      padding: 1px 2px;
      user-select: none;
      font-weight: 700;
    }
    .line-code {
      padding: 1px 12px 1px 6px;
      white-space: pre-wrap;
      word-break: break-all;
      width: 100%;
    }

    tr.line-added td { background: var(--added-bg); }
    tr.line-added .line-sign { color: var(--added); }
    tr.line-removed td { background: var(--removed-bg); }
    tr.line-removed .line-sign { color: var(--removed); }

    /* Split mode */
    .diff-split table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .diff-split td { vertical-align: top; width: 50%; }
    .split-cell {
      display: flex;
    }
    .split-cell .line-num { min-width: 36px; }
    .split-cell .line-code { min-height: 18px; }
    .split-divider { width: 1px; background: var(--vscode-widget-border, #333); }

    /* Large diffs toggle */
    .diff-collapsed {
      padding: 10px 16px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.88em;
      cursor: pointer;
      text-align: center;
    }
    .diff-collapsed:hover { background: var(--vscode-list-hoverBackground); }

    .link-gitlab {
      font-size: 0.82em;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: none;
      white-space: nowrap;
    }
    .link-gitlab:hover { text-decoration: underline; }
  </style>
</head>
<body>
<div class="app">
  <!-- Toolbar -->
  <div class="toolbar">
    <span class="toolbar-title" id="toolbarTitle">🔍 AI MR Reviewer</span>
    <div class="toolbar-spacer"></div>
    <button class="btn-ghost btn-sm" id="btnBack" style="display:none">← New MR</button>
    <button class="btn-ghost btn-sm" id="btnSettings">⚙ Settings</button>
  </div>

  <div class="content">
    <!-- ====== INPUT SCREEN ====== -->
    <div id="screen-input" class="screen active">
      <div class="input-card">
        <h2 id="cardTitle">Review a Merge Request</h2>
        <p id="cardSubtitle">Paste a GitLab MR URL or enter project details manually.</p>

        <div class="input-section">
          <label class="input-label" id="urlLabel">MR URL</label>
          <div class="url-row">
            <input type="text" id="mrUrl" placeholder="https://gitlab.com/group/project/-/merge_requests/42" />
            <button class="btn-primary" id="btnLoadUrl">Load</button>
          </div>
        </div>

        <div class="divider" id="orDivider">or</div>

        <div class="input-section">
          <label class="input-label" id="idsLabel">Project & MR ID</label>
          <div class="ids-row">
            <div class="field">
              <label id="pathLabel">Project path</label>
              <input type="text" id="projectPath" placeholder="group/project" />
            </div>
            <div class="field" style="max-width:120px">
              <label id="iidLabel">MR IID</label>
              <input type="number" id="mrIid" placeholder="42" min="1" />
            </div>
            <button class="btn-primary" id="btnLoadIds">Load</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ====== LOADING SCREEN ====== -->
    <div id="screen-loading" class="screen">
      <div class="loading-screen">
        <div class="spinner"></div>
        <div id="loadingMsg">Loading...</div>
      </div>
    </div>

    <!-- ====== ERROR SCREEN ====== -->
    <div id="screen-error" class="screen">
      <div class="error-box" id="errorMsg"></div>
      <div style="margin-top:16px">
        <button class="btn-secondary" id="btnErrorBack">← Back</button>
      </div>
    </div>

    <!-- ====== MR LOADED SCREEN ====== -->
    <div id="screen-mr" class="screen">
      <div class="mr-header" id="mrHeader"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn-primary" id="btnGenerate">✨ Generate AI Review</button>
        <!-- text set by applyTranslations() -->
      </div>
      <div id="diffOverview"></div>
    </div>

    <!-- ====== REVIEW SCREEN ====== -->
    <div id="screen-review" class="screen">
      <div class="mr-header" id="mrHeaderReview"></div>
      <div class="walkthrough">
        <div class="nav-bar">
          <button class="btn-secondary btn-sm" id="btnPrev">← Prev</button>
          <span class="nav-counter" id="navCounter"></span>
          <button class="btn-primary btn-sm" id="btnNext">Next →</button>
          <div class="nav-spacer"></div>
          <select class="jump-select" id="jumpSelect"></select>
        </div>
        <div class="block-content" id="blockContent"></div>
      </div>
    </div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const LANG = '${lang}';

  // ============ Translations ============
  const TR = {
    en: {
      title: '🔍 AI MR Reviewer',
      btnBack: '← New MR', btnSettings: '⚙ Settings',
      urlLabel: 'MR URL', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
      btnLoad: 'Load', orDivider: 'or',
      idsLabel: 'Project & MR ID', pathLabel: 'Project path', iidLabel: 'MR IID',
      cardTitle: 'Review a Merge Request',
      cardSubtitle: 'Paste a GitLab MR URL or enter project details manually.',
      btnGenerate: '✨ Generate AI Review',
      btnPrev: '← Prev', btnNext: 'Next →',
      filesChanged: (n) => n + ' file(s) changed',
      stepLabel: (n, t) => n + ' / ' + t,
      jumpPrefix: 'Step',
      secExplanation: '📋 Explanation',
      secChanges: (n) => '📄 Changes (' + n + ' file' + (n > 1 ? 's' : '') + ')',
      secAnalysis: '⚠️ Critical Analysis',
      noDiff: 'No diff content',
      btnInline: 'Inline', btnSplit: 'Split',
      linkGitlab: '↗ GitLab', linkOpenMr: '🔗 Open in GitLab',
      loadingDefault: 'Loading...',
    },
    ru: {
      title: '🔍 AI MR Ревьюер',
      btnBack: '← Новый MR', btnSettings: '⚙ Настройки',
      urlLabel: 'URL Merge Request', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
      btnLoad: 'Загрузить', orDivider: 'или',
      idsLabel: 'Проект и ID', pathLabel: 'Путь к проекту', iidLabel: 'MR IID',
      cardTitle: 'Ревью Merge Request',
      cardSubtitle: 'Вставьте URL MR или укажите проект и номер вручную.',
      btnGenerate: '✨ Создать AI-ревью',
      btnPrev: '← Назад', btnNext: 'Далее →',
      filesChanged: (n) => 'Изменено файлов: ' + n,
      stepLabel: (n, t) => n + ' / ' + t,
      jumpPrefix: 'Шаг',
      secExplanation: '📋 Объяснение',
      secChanges: (n) => '📄 Изменения (' + n + ' файл' + (n === 1 ? '' : n < 5 ? 'а' : 'ов') + ')',
      secAnalysis: '⚠️ Критический анализ',
      noDiff: 'Нет содержимого diff',
      btnInline: 'Строчно', btnSplit: 'Разделить',
      linkGitlab: '↗ GitLab', linkOpenMr: '🔗 Открыть в GitLab',
      loadingDefault: 'Загрузка...',
    },
    de: {
      title: '🔍 AI MR Reviewer',
      btnBack: '← Neuer MR', btnSettings: '⚙ Einstellungen',
      urlLabel: 'MR-URL', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
      btnLoad: 'Laden', orDivider: 'oder',
      idsLabel: 'Projekt & MR-ID', pathLabel: 'Projektpfad', iidLabel: 'MR IID',
      cardTitle: 'Merge Request prüfen',
      cardSubtitle: 'Fügen Sie eine GitLab-MR-URL ein oder geben Sie die Projektdaten manuell ein.',
      btnGenerate: '✨ AI-Review erstellen',
      btnPrev: '← Zurück', btnNext: 'Weiter →',
      filesChanged: (n) => n + ' Datei(en) geändert',
      stepLabel: (n, t) => n + ' / ' + t,
      jumpPrefix: 'Schritt',
      secExplanation: '📋 Erklärung',
      secChanges: (n) => '📄 Änderungen (' + n + ' Datei' + (n > 1 ? 'en' : '') + ')',
      secAnalysis: '⚠️ Kritische Analyse',
      noDiff: 'Kein Diff-Inhalt',
      btnInline: 'Inline', btnSplit: 'Geteilt',
      linkGitlab: '↗ GitLab', linkOpenMr: '🔗 In GitLab öffnen',
      loadingDefault: 'Wird geladen...',
    },
    fr: {
      title: '🔍 Revue MR IA',
      btnBack: '← Nouveau MR', btnSettings: '⚙ Paramètres',
      urlLabel: 'URL de la MR', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
      btnLoad: 'Charger', orDivider: 'ou',
      idsLabel: 'Projet & ID MR', pathLabel: 'Chemin du projet', iidLabel: 'MR IID',
      cardTitle: 'Réviser une Merge Request',
      cardSubtitle: "Collez l'URL de la MR ou entrez le projet manuellement.",
      btnGenerate: '✨ Générer la revue IA',
      btnPrev: '← Précédent', btnNext: 'Suivant →',
      filesChanged: (n) => n + ' fichier(s) modifié(s)',
      stepLabel: (n, t) => n + ' / ' + t,
      jumpPrefix: 'Étape',
      secExplanation: '📋 Explication',
      secChanges: (n) => '📄 Modifications (' + n + ' fichier' + (n > 1 ? 's' : '') + ')',
      secAnalysis: '⚠️ Analyse critique',
      noDiff: 'Aucun contenu diff',
      btnInline: 'Intégré', btnSplit: 'Divisé',
      linkGitlab: '↗ GitLab', linkOpenMr: '🔗 Ouvrir dans GitLab',
      loadingDefault: 'Chargement...',
    },
    es: {
      title: '🔍 Revisor MR IA',
      btnBack: '← Nuevo MR', btnSettings: '⚙ Ajustes',
      urlLabel: 'URL de la MR', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
      btnLoad: 'Cargar', orDivider: 'o',
      idsLabel: 'Proyecto e ID MR', pathLabel: 'Ruta del proyecto', iidLabel: 'MR IID',
      cardTitle: 'Revisar Merge Request',
      cardSubtitle: 'Pegue la URL de la MR o ingrese el proyecto manualmente.',
      btnGenerate: '✨ Generar revisión IA',
      btnPrev: '← Anterior', btnNext: 'Siguiente →',
      filesChanged: (n) => n + ' archivo(s) cambiado(s)',
      stepLabel: (n, t) => n + ' / ' + t,
      jumpPrefix: 'Paso',
      secExplanation: '📋 Explicación',
      secChanges: (n) => '📄 Cambios (' + n + ' archivo' + (n > 1 ? 's' : '') + ')',
      secAnalysis: '⚠️ Análisis crítico',
      noDiff: 'Sin contenido diff',
      btnInline: 'En línea', btnSplit: 'Dividido',
      linkGitlab: '↗ GitLab', linkOpenMr: '🔗 Abrir en GitLab',
      loadingDefault: 'Cargando...',
    },
    pt: {
      title: '🔍 Revisor MR IA',
      btnBack: '← Novo MR', btnSettings: '⚙ Configurações',
      urlLabel: 'URL da MR', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
      btnLoad: 'Carregar', orDivider: 'ou',
      idsLabel: 'Projeto & ID MR', pathLabel: 'Caminho do projeto', iidLabel: 'MR IID',
      cardTitle: 'Revisar Merge Request',
      cardSubtitle: 'Cole a URL da MR ou insira o projeto manualmente.',
      btnGenerate: '✨ Gerar revisão IA',
      btnPrev: '← Anterior', btnNext: 'Próximo →',
      filesChanged: (n) => n + ' arquivo(s) alterado(s)',
      stepLabel: (n, t) => n + ' / ' + t,
      jumpPrefix: 'Passo',
      secExplanation: '📋 Explicação',
      secChanges: (n) => '📄 Alterações (' + n + ' arquivo' + (n > 1 ? 's' : '') + ')',
      secAnalysis: '⚠️ Análise crítica',
      noDiff: 'Sem conteúdo diff',
      btnInline: 'Em linha', btnSplit: 'Dividido',
      linkGitlab: '↗ GitLab', linkOpenMr: '🔗 Abrir no GitLab',
      loadingDefault: 'Carregando...',
    },
    zh: {
      title: '🔍 AI MR 审查工具',
      btnBack: '← 新的 MR', btnSettings: '⚙ 设置',
      urlLabel: 'MR 链接', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
      btnLoad: '加载', orDivider: '或',
      idsLabel: '项目和 MR ID', pathLabel: '项目路径', iidLabel: 'MR IID',
      cardTitle: '审查 Merge Request',
      cardSubtitle: '粘贴 GitLab MR 链接，或手动输入项目信息。',
      btnGenerate: '✨ 生成 AI 审查',
      btnPrev: '← 上一步', btnNext: '下一步 →',
      filesChanged: (n) => '已更改 ' + n + ' 个文件',
      stepLabel: (n, t) => n + ' / ' + t,
      jumpPrefix: '步骤',
      secExplanation: '📋 说明',
      secChanges: (n) => '📄 更改（' + n + ' 个文件）',
      secAnalysis: '⚠️ 关键分析',
      noDiff: '无 diff 内容',
      btnInline: '内联', btnSplit: '分屏',
      linkGitlab: '↗ GitLab', linkOpenMr: '🔗 在 GitLab 中打开',
      loadingDefault: '加载中...',
    },
    ja: {
      title: '🔍 AI MR レビュアー',
      btnBack: '← 新しい MR', btnSettings: '⚙ 設定',
      urlLabel: 'MR URL', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
      btnLoad: '読み込む', orDivider: 'または',
      idsLabel: 'プロジェクトと MR ID', pathLabel: 'プロジェクトパス', iidLabel: 'MR IID',
      cardTitle: 'Merge Request をレビューする',
      cardSubtitle: 'GitLab MR の URL を貼り付けるか、プロジェクト情報を手動で入力してください。',
      btnGenerate: '✨ AI レビューを生成',
      btnPrev: '← 前へ', btnNext: '次へ →',
      filesChanged: (n) => n + ' ファイルが変更されました',
      stepLabel: (n, t) => n + ' / ' + t,
      jumpPrefix: 'ステップ',
      secExplanation: '📋 説明',
      secChanges: (n) => '📄 変更（' + n + ' ファイル）',
      secAnalysis: '⚠️ クリティカル分析',
      noDiff: 'diff の内容なし',
      btnInline: 'インライン', btnSplit: '分割',
      linkGitlab: '↗ GitLab', linkOpenMr: '🔗 GitLab で開く',
      loadingDefault: '読み込み中...',
    },
  };

  // Pick translations, fall back to English
  const t = TR[LANG] || TR['en'];

  let state = {
    mr: null,
    diffBlocks: [],
    parsedDiffs: [],
    narrative: null,
    currentBlock: 0,
    diffModes: {},
  };

  // ============ Wire up static buttons ============
  document.getElementById('btnBack').addEventListener('click', () => showScreen('input'));
  document.getElementById('btnSettings').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
  document.getElementById('btnLoadUrl').addEventListener('click', loadByUrl);
  document.getElementById('btnLoadIds').addEventListener('click', loadByIds);
  document.getElementById('btnErrorBack').addEventListener('click', () => showScreen('input'));
  document.getElementById('btnGenerate').addEventListener('click', generateReview);
  document.getElementById('btnPrev').addEventListener('click', () => navigate(-1));
  document.getElementById('btnNext').addEventListener('click', () => navigate(1));
  document.getElementById('jumpSelect').addEventListener('change', function() { jumpTo(this.value); });

  document.getElementById('mrUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadByUrl();
  });

  // ============ Apply translations to static HTML ============
  function applyTranslations() {
    document.getElementById('toolbarTitle').textContent = t.title;
    document.getElementById('btnBack').textContent = t.btnBack;
    document.getElementById('btnSettings').textContent = t.btnSettings;
    document.getElementById('cardTitle').textContent = t.cardTitle;
    document.getElementById('cardSubtitle').textContent = t.cardSubtitle;
    document.getElementById('urlLabel').textContent = t.urlLabel;
    document.getElementById('mrUrl').placeholder = t.urlPlaceholder;
    document.getElementById('btnLoadUrl').textContent = t.btnLoad;
    document.getElementById('orDivider').textContent = t.orDivider;
    document.getElementById('idsLabel').textContent = t.idsLabel;
    document.getElementById('pathLabel').textContent = t.pathLabel;
    document.getElementById('iidLabel').textContent = t.iidLabel;
    document.getElementById('btnLoadIds').textContent = t.btnLoad;
    document.getElementById('btnGenerate').textContent = t.btnGenerate;
    document.getElementById('btnPrev').textContent = t.btnPrev;
    document.getElementById('btnNext').textContent = t.btnNext;
  }
  applyTranslations();

  // ============ Event delegation for dynamic content ============
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target) return;

    // GitLab link
    const gitlabLink = target.closest('[data-gitlab-url]');
    if (gitlabLink) {
      vscode.postMessage({ type: 'openInGitLab', url: gitlabLink.dataset.gitlabUrl });
      return;
    }

    // Diff mode toggle button
    const modeBtn = target.closest('[data-diff-mode]');
    if (modeBtn) {
      setDiffMode(modeBtn.dataset.diffId, modeBtn.dataset.diffMode);
      return;
    }
  });

  // ============ Extension messages ============
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'loading':  showLoading(msg.message); break;
      case 'error':    showError(msg.message);   break;
      case 'mrLoaded': onMrLoaded(msg.mr, msg.diffBlocks); break;
      case 'reviewReady': onReviewReady(msg.narrative, msg.parsedDiffs); break;
    }
  });

  // ============ Screen management ============
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const s = document.getElementById('screen-' + name);
    if (s) s.classList.add('active');
    document.getElementById('btnBack').style.display = (name !== 'input') ? '' : 'none';
  }

  function showLoading(msg) {
    document.getElementById('loadingMsg').textContent = msg || t.loadingDefault;
    showScreen('loading');
  }

  function showError(msg) {
    document.getElementById('errorMsg').textContent = msg;
    showScreen('error');
  }

  // ============ Load MR ============
  function loadByUrl() {
    const url = document.getElementById('mrUrl').value.trim();
    if (!url) return;
    vscode.postMessage({ type: 'loadMR', mrUrl: url });
  }

  function loadByIds() {
    const path = document.getElementById('projectPath').value.trim();
    const iid = parseInt(document.getElementById('mrIid').value, 10);
    if (!path || !iid) return;
    vscode.postMessage({ type: 'loadMRByIds', projectPath: path, mrIid: iid });
  }

  // ============ MR Loaded ============
  function onMrLoaded(mr, diffBlocks) {
    state.mr = mr;
    state.diffBlocks = diffBlocks;
    document.getElementById('btnGenerate').disabled = false;
    renderMrHeader('mrHeader', mr);
    renderDiffOverview(diffBlocks);
    showScreen('mr');
  }

  function renderMrHeader(targetId, mr) {
    const el = document.getElementById(targetId);
    const desc = mr.description
      ? escHtml(mr.description.substring(0, 300)) + (mr.description.length > 300 ? '…' : '')
      : '';
    el.innerHTML =
      '<div class="mr-title-row">' +
        '<span class="mr-iid">!' + mr.iid + '</span>' +
        '<span class="mr-title">' + escHtml(mr.title) + '</span>' +
        '<span class="badge">' + escHtml(mr.state || 'open') + '</span>' +
      '</div>' +
      '<div class="mr-meta">' +
        '<span>👤 ' + escHtml((mr.author && mr.author.name) || '') + '</span>' +
        '<span>🌿 <code>' + escHtml(mr.source_branch) + '</code> → <code>' + escHtml(mr.target_branch) + '</code></span>' +
        '<a class="link-gitlab" data-gitlab-url="' + escAttr(mr.web_url) + '">' + t.linkOpenMr + '</a>' +
      '</div>' +
      (desc ? '<div class="mr-description">' + desc + '</div>' : '');
  }

  function renderDiffOverview(diffBlocks) {
    const el = document.getElementById('diffOverview');
    let html = '<div style="font-size:0.9em;color:var(--vscode-descriptionForeground);margin-bottom:12px;">' +
      t.filesChanged(diffBlocks.length) + '</div>';
    for (const b of diffBlocks) {
      const sign = b.isNewFile
        ? '<span style="color:var(--added)">+</span>'
        : b.isDeletedFile
        ? '<span style="color:var(--removed)">-</span>'
        : '<span style="color:var(--vscode-descriptionForeground)">~</span>';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-family:monospace;font-size:0.88em;border-bottom:1px solid var(--vscode-widget-border,#333)">' +
        sign +
        '<span style="flex:1;word-break:break-all">' + escHtml(b.filePath) + '</span>' +
        '</div>';
    }
    el.innerHTML = html;
  }

  // ============ Generate Review ============
  function generateReview() {
    document.getElementById('btnGenerate').disabled = true;
    vscode.postMessage({ type: 'generateReview' });
  }

  // ============ Review Ready ============
  function onReviewReady(narrative, parsedDiffs) {
    state.narrative = narrative;
    state.parsedDiffs = parsedDiffs;
    state.currentBlock = 0;

    const jumpSel = document.getElementById('jumpSelect');
    jumpSel.innerHTML = narrative.blocks.map((b, i) =>
      '<option value="' + i + '">' + t.jumpPrefix + ' ' + (i+1) + ': ' + escHtml(b.title.substring(0,40)) + '</option>'
    ).join('');

    renderMrHeader('mrHeaderReview', state.mr);
    renderCurrentBlock();
    showScreen('review');
  }

  function navigate(delta) {
    const len = state.narrative.blocks.length;
    state.currentBlock = Math.max(0, Math.min(len - 1, state.currentBlock + delta));
    document.getElementById('jumpSelect').value = state.currentBlock;
    renderCurrentBlock();
  }

  function jumpTo(index) {
    state.currentBlock = parseInt(index, 10);
    renderCurrentBlock();
  }

  function renderCurrentBlock() {
    const blocks = state.narrative.blocks;
    const idx = state.currentBlock;
    const block = blocks[idx];
    if (!block) return;

    document.getElementById('navCounter').textContent = t.stepLabel(idx + 1, blocks.length);
    document.getElementById('btnPrev').disabled = idx === 0;
    document.getElementById('btnNext').disabled = idx === blocks.length - 1;

    const diffs = block.diffIds
      .map(id => state.parsedDiffs.find(pd => pd.block.id === id))
      .filter(Boolean);

    let html =
      '<div class="narrative-block">' +
        '<div class="block-header">' +
          '<div class="block-step">' + (idx + 1) + '</div>' +
          '<div class="block-title">' + escHtml(block.title) + '</div>' +
        '</div>' +
        '<div class="block-section">' +
          '<div class="block-section-label">' + t.secExplanation + '</div>' +
          '<div class="block-explanation">' + escHtml(block.explanation) + '</div>' +
        '</div>';

    if (diffs.length > 0) {
      html += '<div class="block-section">' +
        '<div class="block-section-label">' + t.secChanges(diffs.length) + '</div>' +
        diffs.map(pd => renderDiffBlock(pd)).join('') +
        '</div>';
    }

    if (block.analysis) {
      html +=
        '<div class="block-section">' +
          '<div class="block-section-label">' + t.secAnalysis + '</div>' +
          '<div class="block-analysis">' + escHtml(block.analysis) + '</div>' +
        '</div>';
    }

    html += '</div>';
    document.getElementById('blockContent').innerHTML = html;
  }

  // ============ Diff Rendering ============
  function renderDiffBlock(parsedDiff) {
    const b = parsedDiff.block;
    const diffId = b.id;
    const mode = state.diffModes[diffId] || 'inline';

    const badge = b.isNewFile
      ? '<span class="diff-badge new">NEW</span>'
      : b.isDeletedFile
      ? '<span class="diff-badge deleted">DELETED</span>'
      : b.isRenamedFile
      ? '<span class="diff-badge renamed">RENAMED</span>'
      : '';

    const gitlabUrl = state.mr.web_url + '/diffs';

    const hunksHtml = parsedDiff.hunks.length === 0
      ? '<div style="padding:8px 12px;color:var(--vscode-descriptionForeground);font-size:0.85em">' + t.noDiff + '</div>'
      : parsedDiff.hunks.map(h => renderHunk(h, mode)).join('');

    return '<div class="diff-container" id="dc-' + diffId + '">' +
      '<div class="diff-file-header">' +
        '<span class="diff-file-path">' + escHtml(b.filePath) + '</span>' +
        badge +
        '<div class="diff-mode-toggle">' +
          '<button class="diff-mode-btn ' + (mode==='inline'?'active':'') + '" data-diff-id="' + diffId + '" data-diff-mode="inline">' + t.btnInline + '</button>' +
          '<button class="diff-mode-btn ' + (mode==='split'?'active':'') + '" data-diff-id="' + diffId + '" data-diff-mode="split">' + t.btnSplit + '</button>' +
        '</div>' +
        '<a class="link-gitlab" data-gitlab-url="' + escAttr(gitlabUrl) + '">' + t.linkGitlab + '</a>' +
      '</div>' +
      '<div class="diff-' + mode + '" id="dm-' + diffId + '">' + hunksHtml + '</div>' +
    '</div>';
  }

  function renderHunk(hunk, mode) {
    const header = '<div class="diff-hunk-header">' + escHtml(hunk.header) + '</div>';
    return mode === 'split'
      ? header + renderHunkSplit(hunk)
      : header + renderHunkInline(hunk);
  }

  function renderHunkInline(hunk) {
    let rows = '';
    for (const l of hunk.lines) {
      const cls = l.type === 'added' ? 'line-added' : l.type === 'removed' ? 'line-removed' : '';
      const sign = l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' ';
      const oldNum = l.oldLineNumber != null ? l.oldLineNumber : '';
      const newNum = l.newLineNumber != null ? l.newLineNumber : '';
      rows += '<tr class="' + cls + '">' +
        '<td class="line-num">' + oldNum + '</td>' +
        '<td class="line-num">' + newNum + '</td>' +
        '<td class="line-sign">' + sign + '</td>' +
        '<td class="line-code">' + escHtml(l.content) + '</td>' +
      '</tr>';
    }
    return '<table>' + rows + '</table>';
  }

  function renderHunkSplit(hunk) {
    const pairs = buildSplitPairs(hunk.lines);
    let rows = '';
    for (const [left, right] of pairs) {
      const leftCls = left && left.type === 'removed' ? 'line-removed' : '';
      const rightCls = right && right.type === 'added' ? 'line-added' : '';
      const leftNum = left ? (left.oldLineNumber != null ? left.oldLineNumber : left.newLineNumber != null ? left.newLineNumber : '') : '';
      const rightNum = right ? (right.newLineNumber != null ? right.newLineNumber : right.oldLineNumber != null ? right.oldLineNumber : '') : '';
      rows += '<tr>' +
        '<td class="' + leftCls + '"><div class="split-cell"><span class="line-num">' + leftNum + '</span><span class="line-code">' + (left ? escHtml(left.content) : '') + '</span></div></td>' +
        '<td class="split-divider"></td>' +
        '<td class="' + rightCls + '"><div class="split-cell"><span class="line-num">' + rightNum + '</span><span class="line-code">' + (right ? escHtml(right.content) : '') + '</span></div></td>' +
      '</tr>';
    }
    return '<table>' + rows + '</table>';
  }

  function buildSplitPairs(lines) {
    const pairs = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (l.type === 'context') {
        pairs.push([l, l]);
        i++;
      } else if (l.type === 'removed') {
        const next = lines[i + 1];
        if (next && next.type === 'added') {
          pairs.push([l, next]);
          i += 2;
        } else {
          pairs.push([l, null]);
          i++;
        }
      } else if (l.type === 'added') {
        pairs.push([null, l]);
        i++;
      } else {
        i++;
      }
    }
    return pairs;
  }

  function setDiffMode(diffId, mode) {
    state.diffModes[diffId] = mode;
    const parsedDiff = state.parsedDiffs.find(pd => pd.block.id === diffId);
    if (!parsedDiff) return;
    const container = document.getElementById('dc-' + diffId);
    if (!container) return;
    const newEl = document.createElement('div');
    newEl.innerHTML = renderDiffBlock(parsedDiff);
    container.replaceWith(newEl.firstChild);
  }

  // ============ Helpers ============
  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escAttr(str) { return escHtml(str); }
</script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
