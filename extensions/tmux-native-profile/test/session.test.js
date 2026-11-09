'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile: callback } = require('node:child_process');
const { promisify } = require('node:util');
const execFile = promisify(callback);
const { tmuxPath, managedName, launchOptions, SessionManager, OWNER_OPTION } = require('../session');

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const OWNER = 'test:workspace-1';

test('resolves an absolute tmux executable', () => {
  assert.equal(tmuxPath('tmux', '/usr/bin'), '/usr/bin/tmux');
  assert.throws(() => tmuxPath('dir/tmux'), /absolute/);
});

test('create generates immutable exact-target native arguments with actual socket', async () => {
  const calls = [];
  const ids = [ID1, ID2];
  const manager = new SessionManager('/usr/bin/tmux', OWNER, async (file, args) => {
    calls.push({ file, args });
    return { stdout: args.includes('display-message') ? '/tmp/tmux-1000/default\n' : '' };
  }, () => ids.shift());
  const first = await manager.create('/tmp/workspace');
  const second = await manager.create('/tmp/workspace');
  assert.notEqual(first.name, second.name);
  assert.deepEqual(first.options.shellArgs, ['-N', '-S', '/tmp/tmux-1000/default', 'attach-session', '-t', `=${first.name}`]);
  assert.equal(first.options.shellPath, '/usr/bin/tmux');
  assert.equal(first.options.cwd, '/tmp/workspace');
  assert.deepEqual(calls[0].args, ['-L', 'default', 'new-session', '-d', '-s', first.name, '-c', '/tmp/workspace']);
  assert.deepEqual(calls[1].args, ['-L', 'default', 'set-option', '-t', `=${first.name}:`, OWNER_OPTION, OWNER]);
  assert.equal(first.options.shellArgs.includes('new-session'), false);
});

test('termination requires matching name and workspace owner', async () => {
  const calls = [];
  const manager = new SessionManager('/usr/bin/tmux', OWNER, async (file, args) => {
    calls.push(args);
    return { stdout: `ordinary|${OWNER}\nvscodenative-${ID1}|other\nvscodenative-${ID2}|${OWNER}\n` };
  });
  assert.deepEqual(await manager.list(), [`vscodenative-${ID2}`]);
  await assert.rejects(manager.terminate('ordinary'), /unowned/);
  await assert.rejects(manager.terminate(`vscodenative-${ID1}`), /unowned/);
  await manager.terminate(`vscodenative-${ID2}`);
  assert.deepEqual(calls.at(-1), ['-L', 'default', 'kill-session', '-t', `=vscodenative-${ID2}`]);
  assert.equal(managedName('vscodenative-evil'), false);
});

test('real standard tmux server: foreign session remains and missing exact attach cannot recreate', async (t) => {
  const executable = tmuxPath('tmux');
  const owner = `test:${process.pid}:${Date.now()}`;
  const manager = new SessionManager(executable, owner);
  const foreign = `vscode_foreign_test_${process.pid}_${Date.now()}`;
  const created = [];
  t.after(async () => {
    for (const name of created) {
      try { await execFile(executable, ['-L', 'default', 'kill-session', '-t', `=${name}`]); } catch { /* already gone */ }
    }
    try { await execFile(executable, ['-L', 'default', 'kill-session', '-t', `=${foreign}`]); } catch { /* already gone */ }
  });
  await execFile(executable, ['-L', 'default', 'new-session', '-d', '-s', foreign, '-c', os.tmpdir()]);
  const one = await manager.create(os.tmpdir()); created.push(one.name);
  const two = await manager.create(os.tmpdir()); created.push(two.name);
  assert.deepEqual((await manager.list()).sort(), [one.name, two.name].sort());
  const before = await execFile(executable, ['-L', 'default', 'display-message', '-p', '-t', `=${two.name}:`, '#{pane_pid}']);
  await manager.terminate(one.name);
  assert.deepEqual(await manager.list(), [two.name]);
  const after = await execFile(executable, ['-L', 'default', 'display-message', '-p', '-t', `=${two.name}:`, '#{pane_pid}']);
  assert.equal(after.stdout, before.stdout, 'unselected session process identity remains');
  await execFile(executable, ['-L', 'default', 'has-session', '-t', `=${foreign}:`]);
  const missing = launchOptions(executable, two.options.shellArgs[2], one.name, os.tmpdir());
  await assert.rejects(execFile(missing.shellPath, missing.shellArgs), /can't find session|no sessions/i);
  assert.deepEqual(await manager.list(), [two.name]);
  assert.equal(path.isAbsolute(two.options.shellArgs[2]), true);
  assert.equal(fs.existsSync(two.options.shellArgs[2]), true);
});
