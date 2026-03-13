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
        cfg.maxDiffChunkSize
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
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
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
    <span class="toolbar-title">🔍 AI MR Reviewer</span>
    <div class="toolbar-spacer"></div>
    <button class="btn-ghost btn-sm" id="btnBack" onclick="showScreen('input')" style="display:none">← New MR</button>
    <button class="btn-ghost btn-sm" onclick="openSettings()">⚙ Settings</button>
  </div>

  <div class="content">
    <!-- ====== INPUT SCREEN ====== -->
    <div id="screen-input" class="screen active">
      <div class="input-card">
        <h2>Review a Merge Request</h2>
        <p>Paste a GitLab MR URL or enter project details manually.</p>

        <div class="input-section">
          <label class="input-label">MR URL</label>
          <div class="url-row">
            <input type="text" id="mrUrl" placeholder="https://gitlab.com/group/project/-/merge_requests/42"
              onkeydown="if(event.key==='Enter') loadByUrl()" />
            <button class="btn-primary" onclick="loadByUrl()">Load</button>
          </div>
        </div>

        <div class="divider">or</div>

        <div class="input-section">
          <label class="input-label">Project & MR ID</label>
          <div class="ids-row">
            <div class="field">
              <label>Project path</label>
              <input type="text" id="projectPath" placeholder="group/project" />
            </div>
            <div class="field" style="max-width:120px">
              <label>MR IID</label>
              <input type="number" id="mrIid" placeholder="42" min="1" />
            </div>
            <button class="btn-primary" onclick="loadByIds()">Load</button>
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
        <button class="btn-secondary" onclick="showScreen('input')">← Back</button>
      </div>
    </div>

    <!-- ====== MR LOADED SCREEN ====== -->
    <div id="screen-mr" class="screen">
      <div class="mr-header" id="mrHeader"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn-primary" id="btnGenerate" onclick="generateReview()">✨ Generate AI Review</button>
      </div>
      <!-- Diff list overview -->
      <div id="diffOverview"></div>
    </div>

    <!-- ====== REVIEW SCREEN ====== -->
    <div id="screen-review" class="screen">
      <div class="mr-header" id="mrHeaderReview"></div>
      <div class="walkthrough">
        <div class="nav-bar">
          <button class="btn-secondary btn-sm" id="btnPrev" onclick="navigate(-1)">← Prev</button>
          <span class="nav-counter" id="navCounter">1 / 1</span>
          <button class="btn-primary btn-sm" id="btnNext" onclick="navigate(1)">Next →</button>
          <div class="nav-spacer"></div>
          <select class="jump-select" id="jumpSelect" onchange="jumpTo(this.value)">
          </select>
        </div>
        <div class="block-content" id="blockContent"></div>
      </div>
    </div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  // State
  let state = {
    mr: null,
    diffBlocks: [],
    parsedDiffs: [],
    narrative: null,
    currentBlock: 0,
    diffModes: {},  // diffId -> 'inline' | 'split'
  };

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'loading':
        showLoading(msg.message);
        break;
      case 'error':
        showError(msg.message);
        break;
      case 'mrLoaded':
        onMrLoaded(msg.mr, msg.diffBlocks);
        break;
      case 'reviewReady':
        onReviewReady(msg.narrative, msg.parsedDiffs);
        break;
    }
  });

  // ============ Screen management ============
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const s = document.getElementById('screen-' + name);
    if (s) s.classList.add('active');
    document.getElementById('btnBack').style.display =
      (name !== 'input') ? '' : 'none';
  }

  function showLoading(msg) {
    document.getElementById('loadingMsg').textContent = msg || 'Loading...';
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

  function openSettings() {
    vscode.postMessage({ type: 'openSettings' });
  }

  // ============ MR Loaded ============
  function onMrLoaded(mr, diffBlocks) {
    state.mr = mr;
    state.diffBlocks = diffBlocks;

    renderMrHeader('mrHeader', mr);
    renderDiffOverview(diffBlocks);
    showScreen('mr');
  }

  function renderMrHeader(targetId, mr) {
    const el = document.getElementById(targetId);
    const desc = mr.description ? mr.description.substring(0, 300) + (mr.description.length > 300 ? '…' : '') : '';
    el.innerHTML = \`
      <div class="mr-title-row">
        <span class="mr-iid">!\${mr.iid}</span>
        <span class="mr-title">\${escHtml(mr.title)}</span>
        <span class="badge">\${escHtml(mr.state || 'open')}</span>
      </div>
      <div class="mr-meta">
        <span>👤 \${escHtml(mr.author?.name || '')}</span>
        <span>🌿 <code>\${escHtml(mr.source_branch)}</code> → <code>\${escHtml(mr.target_branch)}</code></span>
        <a class="link-gitlab" onclick="openGitLab('\${escAttr(mr.web_url)}')">🔗 Open in GitLab</a>
      </div>
      \${desc ? \`<div class="mr-description" id="desc-\${targetId}">\${escHtml(desc)}</div>\` : ''}
    \`;
  }

  function renderDiffOverview(diffBlocks) {
    const el = document.getElementById('diffOverview');
    el.innerHTML = \`
      <div style="font-size:0.9em;color:var(--vscode-descriptionForeground);margin-bottom:12px;">
        \${diffBlocks.length} file(s) changed
      </div>
      \${diffBlocks.map(b => \`
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-family:monospace;font-size:0.88em;border-bottom:1px solid var(--vscode-widget-border,#333)">
          \${b.isNewFile ? '<span style="color:var(--added)">+</span>' : b.isDeletedFile ? '<span style="color:var(--removed)">-</span>' : '<span style="color:var(--vscode-descriptionForeground)">~</span>'}
          <span style="flex:1;word-break:break-all">\${escHtml(b.filePath)}</span>
        </div>
      \`).join('')}
    \`;
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

    // Build jump select
    const jumpSel = document.getElementById('jumpSelect');
    jumpSel.innerHTML = narrative.blocks.map((b, i) =>
      \`<option value="\${i}">Step \${i+1}: \${escHtml(b.title.substring(0,40))}</option>\`
    ).join('');

    renderMrHeader('mrHeaderReview', state.mr);
    renderCurrentBlock();
    showScreen('review');
  }

  function navigate(delta) {
    const blocks = state.narrative.blocks;
    state.currentBlock = Math.max(0, Math.min(blocks.length - 1, state.currentBlock + delta));
    renderCurrentBlock();
    document.getElementById('jumpSelect').value = state.currentBlock;
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

    // Update counter
    document.getElementById('navCounter').textContent = \`\${idx + 1} / \${blocks.length}\`;
    document.getElementById('btnPrev').disabled = idx === 0;
    document.getElementById('btnNext').disabled = idx === blocks.length - 1;

    // Render diffs for this block
    const diffs = block.diffIds
      .map(id => state.parsedDiffs.find(pd => pd.block.id === id))
      .filter(Boolean);

    const diffHtml = diffs.map(pd => renderDiffBlock(pd)).join('');

    document.getElementById('blockContent').innerHTML = \`
      <div class="narrative-block">
        <div class="block-header">
          <div class="block-step">\${idx + 1}</div>
          <div class="block-title">\${escHtml(block.title)}</div>
        </div>

        <div class="block-section">
          <div class="block-section-label">📋 Explanation</div>
          <div class="block-explanation">\${escHtml(block.explanation)}</div>
        </div>

        \${diffs.length > 0 ? \`
        <div class="block-section">
          <div class="block-section-label">📄 Changes (\${diffs.length} file\${diffs.length > 1 ? 's' : ''})</div>
          \${diffHtml}
        </div>
        \` : ''}

        \${block.analysis ? \`
        <div class="block-section">
          <div class="block-section-label">⚠️ Critical Analysis</div>
          <div class="block-analysis">\${escHtml(block.analysis)}</div>
        </div>
        \` : ''}
      </div>
    \`;
  }

  // ============ Diff Rendering ============
  function renderDiffBlock(parsedDiff) {
    const b = parsedDiff.block;
    const diffId = b.id;
    const mode = state.diffModes[diffId] || 'inline';

    const badge = b.isNewFile ? '<span class="diff-badge new">NEW</span>'
      : b.isDeletedFile ? '<span class="diff-badge deleted">DELETED</span>'
      : b.isRenamedFile ? '<span class="diff-badge renamed">RENAMED</span>'
      : '';

    const gitlabUrl = state.mr.web_url + '/diffs';

    const hunksHtml = parsedDiff.hunks.length === 0
      ? '<div style="padding:8px 12px;color:var(--vscode-descriptionForeground);font-size:0.85em">No diff content</div>'
      : parsedDiff.hunks.map(h => renderHunk(h, mode)).join('');

    return \`
      <div class="diff-container" id="dc-\${diffId}">
        <div class="diff-file-header">
          <span class="diff-file-path">\${escHtml(b.filePath)}</span>
          \${badge}
          <div class="diff-mode-toggle">
            <button class="diff-mode-btn \${mode==='inline'?'active':''}" onclick="setDiffMode('\${diffId}','inline')">Inline</button>
            <button class="diff-mode-btn \${mode==='split'?'active':''}" onclick="setDiffMode('\${diffId}','split')">Split</button>
          </div>
          <a class="link-gitlab" onclick="openGitLab('\${escAttr(gitlabUrl)}')">↗ GitLab</a>
        </div>
        <div class="diff-\${mode}" id="dm-\${diffId}">
          \${hunksHtml}
        </div>
      </div>
    \`;
  }

  function renderHunk(hunk, mode) {
    const header = \`<div class="diff-hunk-header">\${escHtml(hunk.header)}</div>\`;
    if (mode === 'split') {
      return header + renderHunkSplit(hunk);
    }
    return header + renderHunkInline(hunk);
  }

  function renderHunkInline(hunk) {
    const rows = hunk.lines.map(l => {
      const cls = l.type === 'added' ? 'line-added' : l.type === 'removed' ? 'line-removed' : '';
      const sign = l.type === 'added' ? '+' : l.type === 'removed' ? '-' : ' ';
      const oldNum = l.oldLineNumber != null ? l.oldLineNumber : '';
      const newNum = l.newLineNumber != null ? l.newLineNumber : '';
      return \`<tr class="\${cls}">
        <td class="line-num">\${oldNum}</td>
        <td class="line-num">\${newNum}</td>
        <td class="line-sign">\${sign}</td>
        <td class="line-code">\${escHtml(l.content)}</td>
      </tr>\`;
    }).join('');
    return \`<table>\${rows}</table>\`;
  }

  function renderHunkSplit(hunk) {
    // Pair up added/removed lines for split view
    const pairs = buildSplitPairs(hunk.lines);
    const rows = pairs.map(([left, right]) => {
      const leftCls = left?.type === 'removed' ? 'line-removed' : '';
      const rightCls = right?.type === 'added' ? 'line-added' : '';
      const leftNum = left?.oldLineNumber ?? left?.newLineNumber ?? '';
      const rightNum = right?.newLineNumber ?? right?.oldLineNumber ?? '';
      return \`<tr>
        <td class="\${leftCls}">
          <div class="split-cell">
            <span class="line-num">\${leftNum}</span>
            <span class="line-code">\${left ? escHtml(left.content) : ''}</span>
          </div>
        </td>
        <td class="split-divider"></td>
        <td class="\${rightCls}">
          <div class="split-cell">
            <span class="line-num">\${rightNum}</span>
            <span class="line-code">\${right ? escHtml(right.content) : ''}</span>
          </div>
        </td>
      </tr>\`;
    }).join('');
    return \`<table>\${rows}</table>\`;
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
        // Look ahead for matching added
        const nextAdded = lines[i + 1];
        if (nextAdded && nextAdded.type === 'added') {
          pairs.push([l, nextAdded]);
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
    // Re-render just this diff block
    const parsedDiff = state.parsedDiffs.find(pd => pd.block.id === diffId);
    if (!parsedDiff) return;
    const container = document.getElementById('dc-' + diffId);
    if (!container) return;
    container.outerHTML = renderDiffBlock(parsedDiff);
  }

  // ============ Helpers ============
  function openGitLab(url) {
    vscode.postMessage({ type: 'openInGitLab', url });
  }

  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escAttr(str) {
    return escHtml(str);
  }
</script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
