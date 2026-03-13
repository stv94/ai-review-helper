import * as vscode from 'vscode';
import { ReviewPanel } from './panels/reviewPanel';
import { SettingsPanel } from './panels/settingsPanel';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-review-helper.reviewMR', () => {
      ReviewPanel.createOrShow(context.extensionUri);
    }),

    vscode.commands.registerCommand('ai-review-helper.openSettings', () => {
      SettingsPanel.createOrShow(context.extensionUri);
    })
  );
}

export function deactivate(): void {}
