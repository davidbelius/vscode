'use strict';

const vscode = require('vscode');
const { createHash } = require('node:crypto');
const { tmuxPath, SessionManager } = require('./session');
const { workspaceFolder } = require('./workspace');

function manager() {
  const settings = vscode.workspace.getConfiguration('tmuxNativeProfile');
  const workspace = vscode.workspace.workspaceFile?.toString() ||
    vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString()).join('\n');
  if (!workspace) throw new Error('Open a workspace before creating a managed tmux session');
  const owner = 'vibecoded.tmux-native-profile:' + createHash('sha256').update(workspace).digest('hex');
  return new SessionManager(tmuxPath(settings.get('tmuxPath', 'tmux')), owner);
}

async function createSession() {
  const current = manager();
  return { current, session: await current.create(workspaceFolder(vscode.workspace, vscode.window, vscode.env)) };
}

async function reportFailure(action, error) {
  await vscode.window.showErrorMessage(`Tmux Native Profile: ${action}: ${error.message}`);
}

function activate(context) {
  context.subscriptions.push(vscode.window.registerTerminalProfileProvider('tmuxNativeProfile.persistent', {
    async provideTerminalProfile(token) {
      if (token.isCancellationRequested) return undefined;
      try {
        const { current, session } = await createSession();
        if (token.isCancellationRequested) { await current.terminate(session.name); return undefined; }
        try { return new vscode.TerminalProfile(session.options); }
        catch (error) { await current.terminate(session.name); throw error; }
      } catch (error) { await reportFailure('could not create session', error); throw error; }
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('tmuxNativeProfile.newTerminal', async () => {
    try {
      const { current, session } = await createSession();
      try { vscode.window.createTerminal(session.options).show(); }
      catch (error) { await current.terminate(session.name); throw error; }
    } catch (error) { await reportFailure('could not create terminal', error); throw error; }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('tmuxNativeProfile.terminateSession', async () => {
    try {
      const current = manager();
      const sessions = await current.list();
      if (!sessions.length) { await vscode.window.showInformationMessage('No managed tmux sessions in this workspace.'); return; }
      const name = await vscode.window.showQuickPick(sessions, { placeHolder: 'Select a managed tmux session to terminate' });
      if (name) await current.terminate(name);
    } catch (error) { await reportFailure('could not terminate session', error); throw error; }
  }));
}

function deactivate() { /* Closing VS Code leaves tmux sessions running. */ }

module.exports = { activate, deactivate };
