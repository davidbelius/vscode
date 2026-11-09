'use strict';

const { randomUUID } = require('node:crypto');
const { execFile: execFileCallback } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');

const execFile = promisify(execFileCallback);
const SESSION_PREFIX = 'vscodenative-';
const OWNER_OPTION = '@vscode_native_profile_owner';

function tmuxPath(configured = 'tmux', envPath = process.env.PATH || '') {
  if (path.isAbsolute(configured)) {
    fs.accessSync(configured, fs.constants.X_OK);
    return configured;
  }
  if (configured.includes(path.sep)) throw new Error('tmuxNativeProfile.tmuxPath must be absolute or a bare executable name');
  for (const folder of envPath.split(path.delimiter)) {
    if (!folder || !path.isAbsolute(folder)) continue;
    const candidate = path.join(folder, configured);
    try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch { /* keep searching */ }
  }
  throw new Error(`Cannot find tmux executable: ${configured}`);
}

function managedName(name) {
  return typeof name === 'string' && new RegExp(`^${SESSION_PREFIX}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`).test(name);
}

function launchOptions(executable, actualSocket, name, cwd) {
  if (!managedName(name)) throw new Error('Invalid managed session identity');
  if (!path.isAbsolute(actualSocket)) throw new Error('tmux did not return an absolute socket path');
  return { name: 'Tmux Persistent', shellPath: executable,
    shellArgs: ['-N', '-S', actualSocket, 'attach-session', '-t', `=${name}`], cwd };
}

class SessionManager {
  constructor(executable, owner, run = execFile, uuid = randomUUID) {
    if (!owner || /[\r\n\t]/.test(owner)) throw new Error('A workspace owner identity is required');
    this.executable = executable;
    this.owner = owner;
    this.run = run;
    this.uuid = uuid;
  }

  async create(cwd) {
    if (!path.isAbsolute(cwd)) throw new Error('A local workspace folder is required for tmux');
    const name = SESSION_PREFIX + this.uuid();
    // -L default ignores inherited $TMUX and uses the user's standard server.
    await this.run(this.executable, ['-L', 'default', 'new-session', '-d', '-s', name, '-c', cwd]);
    try {
      await this.run(this.executable, ['-L', 'default', 'set-option', '-t', `=${name}:`, OWNER_OPTION, this.owner]);
      const { stdout } = await this.run(this.executable, ['-L', 'default', 'display-message', '-p', '-t', `=${name}:`, '#{socket_path}']);
      return { name, options: launchOptions(this.executable, stdout.trim(), name, cwd) };
    } catch (error) {
      // Remove only this newly created session if its identity cannot be recorded.
      try { await this.run(this.executable, ['-L', 'default', 'kill-session', '-t', `=${name}`]); } catch { /* preserve original error */ }
      throw error;
    }
  }

  async list() {
    try {
      const { stdout } = await this.run(this.executable, ['-L', 'default', 'list-sessions', '-F', `#{session_name}|#{${OWNER_OPTION}}`]);
      return stdout.split(/\r?\n/).map(line => line.split('|'))
        .filter(([name, owner]) => managedName(name) && owner === this.owner)
        .map(([name]) => name);
    } catch (error) {
      if (error.code === 1 && /^no server running on /i.test((error.stderr || '').trim())) return [];
      throw error;
    }
  }

  async terminate(name) {
    if (!managedName(name) || !(await this.list()).includes(name)) throw new Error('Refusing to terminate an unowned tmux session');
    await this.run(this.executable, ['-L', 'default', 'kill-session', '-t', `=${name}`]);
  }
}

module.exports = { SESSION_PREFIX, OWNER_OPTION, tmuxPath, managedName, launchOptions, SessionManager };
