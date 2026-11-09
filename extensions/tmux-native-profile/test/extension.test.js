'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('activation creates no terminal and profile cancellation cleans its session', async () => {
  let provider;
  let createCount = 0;
  let terminalCount = 0;
  const terminated = [];
  let finishCreate;
  const pending = new Promise(resolve => { finishCreate = resolve; });
  const vscode = {
    env: {},
    workspace: {
      workspaceFolders: [{ uri: { scheme: 'file', fsPath: '/tmp/work', toString: () => 'file:///tmp/work' } }],
      getConfiguration: () => ({ get: () => 'tmux' })
    },
    window: {
      registerTerminalProfileProvider: (_id, value) => { provider = value; return { dispose() {} }; },
      showErrorMessage: async () => {},
      createTerminal: () => { terminalCount++; return { show() {} }; }
    },
    commands: { registerCommand: () => ({ dispose() {} }) },
    TerminalProfile: class { constructor(options) { this.options = options; } }
  };
  class FakeManager {
    async create() { createCount++; return pending; }
    async terminate(name) { terminated.push(name); }
  }
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'vscode') return vscode;
    if (request === './session' && parent?.filename.endsWith('/extension.js'))
      return { tmuxPath: () => '/usr/bin/tmux', SessionManager: FakeManager };
    return original.call(this, request, parent, isMain);
  };
  let extension;
  try {
    delete require.cache[require.resolve('../extension')];
    extension = require('../extension');
  } finally { Module._load = original; }
  extension.activate({ subscriptions: [] });
  assert.equal(terminalCount, 0, 'activation must not open a terminal');
  assert.equal(await provider.provideTerminalProfile({ isCancellationRequested: true }), undefined);
  assert.equal(createCount, 0);
  const token = { isCancellationRequested: false };
  const result = provider.provideTerminalProfile(token);
  token.isCancellationRequested = true;
  finishCreate({ name: 'vscodenative-test', options: {} });
  assert.equal(await result, undefined);
  assert.deepEqual(terminated, ['vscodenative-test']);
});
