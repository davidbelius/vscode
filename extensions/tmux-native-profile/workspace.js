'use strict';

function workspaceFolder(workspace, window, env) {
  const folders = workspace.workspaceFolders || [];
  if (!folders.length) throw new Error('Open a workspace folder before creating a tmux terminal');
  const active = window.activeTextEditor?.document?.uri;
  const selected = (active && workspace.getWorkspaceFolder(active)) || folders[0];
  if (selected.uri.scheme !== 'file' && !(selected.uri.scheme === 'vscode-remote' && env.remoteName))
    throw new Error('The workspace folder must be on the extension host filesystem');
  return selected.uri.fsPath;
}

module.exports = { workspaceFolder };
