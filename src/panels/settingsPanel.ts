import * as vscode from 'vscode';
import { ExtensionConfig, WebViewToExtMessage, SUPPORTED_LANGUAGES } from '../types';
import { getConfig, saveConfig } from '../config';
import { GitLabClient } from '../clients/gitlabClient';
import { LlmClient } from '../clients/llmClient';
import { getLlmBaseUrl } from '../config';

export class SettingsPanel {
  static currentPanel: SettingsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

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

    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.panel.reveal(column);
      SettingsPanel.currentPanel.sendSettings();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'aiReviewSettings',
      'AI Review Helper — Settings',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
    SettingsPanel.currentPanel.sendSettings();
  }

  private sendSettings(): void {
    const settings = getConfig();
    this.panel.webview.postMessage({ type: 'settingsLoaded', settings });
  }

  private async handleMessage(msg: WebViewToExtMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.sendSettings();
        break;

      case 'saveSettings':
        await saveConfig(msg.settings);
        this.panel.webview.postMessage({ type: 'settingsSaved' });
        vscode.window.showInformationMessage('AI Review Helper settings saved.');
        break;

      case 'testGitLab': {
        const cfg = getConfig();
        const client = new GitLabClient(cfg.gitlabUrl, cfg.gitlabToken);
        const result = await client.testConnection();
        this.panel.webview.postMessage({
          type: 'testResult',
          target: 'gitlab',
          success: result.success,
          message: result.success
            ? `Connected as ${result.user}`
            : result.error ?? 'Unknown error',
        });
        break;
      }

      case 'testLLM': {
        const cfg = getConfig();
        const baseUrl = getLlmBaseUrl(cfg);
        const client = new LlmClient(baseUrl, cfg.llmApiKey, cfg.llmModel);
        const result = await client.testConnection();
        this.panel.webview.postMessage({
          type: 'testResult',
          target: 'llm',
          success: result.success,
          message: result.success
            ? `Connected — model: ${result.model}`
            : result.error ?? 'Unknown error',
        });
        break;
      }
    }
  }

  dispose(): void {
    SettingsPanel.currentPanel = undefined;
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
  <title>AI Review Helper — Settings</title>
  <style nonce="${nonce}">
    :root {
      --radius: 6px;
      --gap: 16px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 24px;
      max-width: 700px;
    }

    h1 {
      font-size: 1.4em;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 32px;
      font-size: 0.92em;
    }

    .section {
      margin-bottom: 32px;
    }
    .section-title {
      font-size: 1em;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-title .icon { font-size: 1.1em; }

    .field {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--vscode-foreground);
    }
    label .hint {
      font-weight: 400;
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-left: 6px;
    }

    input[type="text"],
    input[type="password"],
    input[type="number"],
    select {
      width: 100%;
      padding: 7px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: var(--radius);
      font-family: inherit;
      font-size: inherit;
      outline: none;
      transition: border-color 0.15s;
    }
    input:focus, select:focus {
      border-color: var(--vscode-focusBorder);
    }
    input[type="password"] { letter-spacing: 0.1em; }

    .input-row {
      display: flex;
      gap: 8px;
    }
    .input-row input { flex: 1; }

    .toggle-pw {
      padding: 7px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 0.85em;
      white-space: nowrap;
    }
    .toggle-pw:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      font-weight: 500;
      transition: opacity 0.15s;
    }
    button:active { opacity: 0.8; }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }

    .btn-test {
      padding: 6px 12px;
      font-size: 0.88em;
      background: transparent;
      border: 1px solid var(--vscode-button-secondaryBackground);
      color: var(--vscode-foreground);
    }
    .btn-test:hover { background: var(--vscode-list-hoverBackground); }

    .test-result {
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: var(--radius);
      font-size: 0.88em;
      display: none;
    }
    .test-result.success {
      background: color-mix(in srgb, var(--vscode-testing-iconPassed, #89d185) 15%, transparent);
      color: var(--vscode-testing-iconPassed, #89d185);
      border: 1px solid var(--vscode-testing-iconPassed, #89d185);
      display: block;
    }
    .test-result.error {
      background: color-mix(in srgb, var(--vscode-testing-iconFailed, #f14c4c) 15%, transparent);
      color: var(--vscode-testing-iconFailed, #f14c4c);
      border: 1px solid var(--vscode-testing-iconFailed, #f14c4c);
      display: block;
    }
    .test-result.loading {
      background: color-mix(in srgb, var(--vscode-descriptionForeground) 15%, transparent);
      color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-widget-border, #444);
      display: block;
    }

    .save-bar {
      position: sticky;
      bottom: 0;
      background: var(--vscode-editor-background);
      padding: 16px 0 0;
      border-top: 1px solid var(--vscode-widget-border, #444);
      margin-top: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .save-status {
      font-size: 0.88em;
      color: var(--vscode-testing-iconPassed, #89d185);
      opacity: 0;
      transition: opacity 0.3s;
    }
    .save-status.visible { opacity: 1; }

    .provider-hint {
      margin-top: 6px;
      font-size: 0.82em;
      color: var(--vscode-descriptionForeground);
      padding: 6px 10px;
      background: var(--vscode-textBlockQuote-background);
      border-radius: var(--radius);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
    }

    select option { background: var(--vscode-dropdown-background, #2d2d2d); }
  </style>
</head>
<body>
  <h1>⚙️ AI Review Helper Settings</h1>
  <p class="subtitle">Configure GitLab and LLM connections. Settings are stored in VS Code global settings.</p>

  <!-- GitLab Section -->
  <div class="section">
    <div class="section-title">
      <span class="icon">🦊</span> GitLab
    </div>

    <div class="field">
      <label for="gitlabUrl">GitLab URL</label>
      <input type="text" id="gitlabUrl" placeholder="https://gitlab.com" autocomplete="off" />
    </div>

    <div class="field">
      <label for="gitlabToken">
        Personal Access Token
        <span class="hint">Requires <code>api</code> scope</span>
      </label>
      <div class="input-row">
        <input type="password" id="gitlabToken" placeholder="glpat-xxxxxxxxxxxxxxxxxxxx" autocomplete="off" />
        <button class="toggle-pw" id="toggleGitlabToken">Show</button>
      </div>
    </div>

    <div class="actions">
      <button class="btn-test" id="btnTestGitlab">🔌 Test Connection</button>
    </div>
    <div id="gitlabTestResult" class="test-result"></div>
  </div>

  <!-- LLM Section -->
  <div class="section">
    <div class="section-title">
      <span class="icon">🤖</span> LLM Provider
    </div>

    <div class="field">
      <label for="llmProvider">Provider</label>
      <select id="llmProvider">
        <option value="openai">OpenAI</option>
        <option value="openrouter">OpenRouter</option>
        <option value="custom">Custom (OpenAI-compatible)</option>
      </select>
    </div>

    <div id="providerHint" class="provider-hint" style="display:none"></div>

    <div class="field">
      <label for="llmApiKey">
        API Key
      </label>
      <div class="input-row">
        <input type="password" id="llmApiKey" placeholder="sk-..." autocomplete="off" />
        <button class="toggle-pw" id="toggleLlmApiKey">Show</button>
      </div>
    </div>

    <div class="field">
      <label for="llmModel">
        Model
        <span class="hint">e.g. gpt-4o, gpt-4-turbo, anthropic/claude-3-5-sonnet</span>
      </label>
      <input type="text" id="llmModel" placeholder="gpt-4o" autocomplete="off" />
    </div>

    <div class="field" id="baseUrlField">
      <label for="llmBaseUrl">
        Base URL
        <span class="hint">Leave empty for OpenAI default</span>
      </label>
      <input type="text" id="llmBaseUrl" placeholder="https://openrouter.ai/api/v1" autocomplete="off" />
    </div>

    <div class="field">
      <label for="maxDiffChunkSize">
        Max Diff Chunk Size
        <span class="hint">Characters per LLM request (reduce if hitting context limits)</span>
      </label>
      <input type="number" id="maxDiffChunkSize" min="1000" max="100000" step="1000" />
    </div>

    <div class="actions">
      <button class="btn-test" id="btnTestLlm">🔌 Test LLM Connection</button>
    </div>
    <div id="llmTestResult" class="test-result"></div>
  </div>

  <!-- Language Section -->
  <div class="section">
    <div class="section-title">
      <span class="icon">🌐</span> Language / Язык
    </div>

    <div class="field">
      <label for="language">
        Interface & LLM response language
        <span class="hint">Affects both the UI and the AI review text</span>
      </label>
      <select id="language">
        ${Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) =>
          `<option value="${code}">${name} (${code})</option>`
        ).join('\n        ')}
      </select>
    </div>

    <div class="provider-hint" style="display:block;margin-top:0">
      💡 After changing the language, reopen the Review panel to apply the UI translation.
      LLM responses will use the new language immediately.
    </div>
  </div>

  <!-- Save Bar -->
  <div class="save-bar">
    <button class="btn-primary" id="btnSave">💾 Save Settings</button>
    <button class="btn-secondary" id="btnReset">↩ Reset to defaults</button>
    <span id="saveStatus" class="save-status">✓ Saved</span>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const PROVIDER_HINTS = {
      openai: '',
      openrouter: 'OpenRouter lets you access many models. Get your key at openrouter.ai. The Base URL is set automatically.',
      custom: 'Use any OpenAI-compatible endpoint. Enter the full base URL including path (e.g. http://localhost:1234/v1).',
    };

    const PROVIDER_DEFAULTS = {
      openai: { model: 'gpt-4o', baseUrl: '' },
      openrouter: { model: 'openai/gpt-4o', baseUrl: 'https://openrouter.ai/api/v1' },
      custom: { model: '', baseUrl: '' },
    };

    // ============ Wire up buttons ============
    document.getElementById('btnSave').addEventListener('click', saveSettings);
    document.getElementById('btnReset').addEventListener('click', resetToDefaults);
    document.getElementById('btnTestGitlab').addEventListener('click', testGitLab);
    document.getElementById('btnTestLlm').addEventListener('click', testLLM);
    document.getElementById('llmProvider').addEventListener('change', () => onProviderChange(true));
    document.getElementById('toggleGitlabToken').addEventListener('click', function() { togglePassword('gitlabToken', this); });
    document.getElementById('toggleLlmApiKey').addEventListener('click', function() { togglePassword('llmApiKey', this); });

    // ============ Extension messages ============
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.type) {
        case 'settingsLoaded':
          populateForm(msg.settings);
          break;
        case 'settingsSaved':
          showSaveStatus();
          break;
        case 'testResult':
          showTestResult(msg.target, msg.success, msg.message);
          break;
      }
    });

    function populateForm(s) {
      document.getElementById('gitlabUrl').value = s.gitlabUrl || 'https://gitlab.com';
      document.getElementById('gitlabToken').value = s.gitlabToken || '';
      document.getElementById('llmProvider').value = s.llmProvider || 'openai';
      document.getElementById('llmApiKey').value = s.llmApiKey || '';
      document.getElementById('llmModel').value = s.llmModel || 'gpt-4o';
      document.getElementById('llmBaseUrl').value = s.llmBaseUrl || '';
      document.getElementById('maxDiffChunkSize').value = s.maxDiffChunkSize || 8000;
      document.getElementById('language').value = s.language || 'en';
      onProviderChange(false);
    }

    function collectSettings() {
      return {
        gitlabUrl: document.getElementById('gitlabUrl').value.trim(),
        gitlabToken: document.getElementById('gitlabToken').value.trim(),
        llmProvider: document.getElementById('llmProvider').value,
        llmApiKey: document.getElementById('llmApiKey').value.trim(),
        llmModel: document.getElementById('llmModel').value.trim(),
        llmBaseUrl: document.getElementById('llmBaseUrl').value.trim(),
        maxDiffChunkSize: parseInt(document.getElementById('maxDiffChunkSize').value, 10) || 8000,
        language: document.getElementById('language').value,
      };
    }

    function saveSettings() {
      const settings = collectSettings();
      vscode.postMessage({ type: 'saveSettings', settings });
    }

    function resetToDefaults() {
      populateForm({
        gitlabUrl: 'https://gitlab.com',
        gitlabToken: '',
        llmProvider: 'openai',
        llmApiKey: '',
        llmModel: 'gpt-4o',
        llmBaseUrl: '',
        maxDiffChunkSize: 8000,
        language: 'en',
      });
    }

    function onProviderChange(autoFill) {
      const provider = document.getElementById('llmProvider').value;
      const hint = document.getElementById('providerHint');
      const hintText = PROVIDER_HINTS[provider] || '';
      if (hintText) {
        hint.textContent = hintText;
        hint.style.display = 'block';
      } else {
        hint.style.display = 'none';
      }

      if (autoFill) {
        const defaults = PROVIDER_DEFAULTS[provider];
        if (defaults) {
          if (defaults.model) document.getElementById('llmModel').value = defaults.model;
          if (defaults.baseUrl !== undefined) document.getElementById('llmBaseUrl').value = defaults.baseUrl;
        }
      }
    }

    function togglePassword(inputId, btn) {
      const input = document.getElementById(inputId);
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    }

    function testGitLab() {
      vscode.postMessage({ type: 'saveSettings', settings: collectSettings() });
      showTestResult('gitlab', null, 'Testing connection...');
      vscode.postMessage({ type: 'testGitLab' });
    }

    function testLLM() {
      vscode.postMessage({ type: 'saveSettings', settings: collectSettings() });
      showTestResult('llm', null, 'Testing connection...');
      vscode.postMessage({ type: 'testLLM' });
    }

    function showTestResult(target, success, message) {
      const el = document.getElementById(target === 'gitlab' ? 'gitlabTestResult' : 'llmTestResult');
      el.className = 'test-result';
      if (success === null) {
        el.classList.add('loading');
      } else if (success) {
        el.classList.add('success');
      } else {
        el.classList.add('error');
      }
      el.textContent = message;
    }

    function showSaveStatus() {
      const el = document.getElementById('saveStatus');
      el.classList.add('visible');
      setTimeout(() => el.classList.remove('visible'), 3000);
    }

    // Notify extension we're ready
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
