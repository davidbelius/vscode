'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { workspaceFolder } = require('../workspace');

test('local workspace folder uses active editor folder', () => {
  const first = { uri: { scheme: 'file', fsPath: '/work/one' } };
  const second = { uri: { scheme: 'file', fsPath: '/work/two' } };
  const workspace = { workspaceFolders: [first, second], getWorkspaceFolder: () => second };
  assert.equal(workspaceFolder(workspace, { activeTextEditor: { document: { uri: {} } } }, {}), '/work/two');
});

test('Remote SSH workspace URI resolves to extension-host path', () => {
  const remote = { uri: { scheme: 'vscode-remote', fsPath: '/home/agent/work' } };
  assert.equal(workspaceFolder({ workspaceFolders: [remote] }, {}, { remoteName: 'ssh-remote' }), '/home/agent/work');
});

test('virtual and untrusted remote scheme combinations are rejected', () => {
  const virtual = { uri: { scheme: 'memfs', fsPath: '/virtual' } };
  assert.throws(() => workspaceFolder({ workspaceFolders: [virtual] }, {}, {}), /extension host/);
  const remote = { uri: { scheme: 'vscode-remote', fsPath: '/work' } };
  assert.throws(() => workspaceFolder({ workspaceFolders: [remote] }, {}, {}), /extension host/);
});
