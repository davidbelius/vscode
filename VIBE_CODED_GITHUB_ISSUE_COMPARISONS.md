# GitHub issue comparison: terminal crash consistency

- [#51064 — Previous session not restored after system shutdown](https://github.com/microsoft/vscode/issues/51064)
  - problem: VS Code restores an older editor session when the computer shuts down before Code closes normally.
  - similarity: Both involve newer location/session state being unavailable or inconsistent after an abrupt shutdown.
  - difference: It concerns general editor tabs, predates terminal process revival, and does not involve terminal panel/editor state or PTY snapshots.
  - verdict: not same bug (same crash-consistency limitation).

- [#133516 — Test: Terminal process revive](https://github.com/microsoft/vscode/issues/133516)
  - problem: This test-plan issue defines and validates saving terminal buffers and relaunch information during application or window shutdown.
  - similarity: It covers the terminal process snapshot that is absent in our hard-kill reproduction.
  - difference: It describes expected shutdown-time behavior rather than reporting inconsistent state after an abrupt kill.
  - verdict: not same bug (relevant design documentation).

- [#131634 — Restore terminal sessions across application restarts](https://github.com/microsoft/vscode/issues/131634)
  - problem: VS Code originally lacked terminal buffer and process restoration across complete application restarts.
  - similarity: Its implementation is the process-revival mechanism on which our mixed-location restoration depends.
  - difference: It addresses implementing normal restart restoration, not transactional consistency after the application and PTY host are forcibly killed.
  - verdict: not same bug (underlying feature).

- [#117265 — Test: PTY host process and persistent local terminals](https://github.com/microsoft/vscode/issues/117265)
  - problem: This test plan validates terminal reconnection, layout restoration, and recovery from PTY-host failures.
  - similarity: It explicitly considers killed PTY hosts and preserving terminal layouts and processes.
  - difference: Its restoration case uses window reload while VS Code remains able to coordinate persistence; it does not kill the entire application before state is written.
  - verdict: not same bug (related recovery subsystem).

- [#140429 — Terminal editor not restored after restart](https://github.com/microsoft/vscode/issues/140429)
  - problem: Terminals in the editor area disappeared after a normal VS Code close and restart while panel terminals restored correctly.
  - similarity: Both can produce missing terminal-editor state during process revival.
  - difference: It reproduced after an orderly close, affected terminal editors specifically, and was fixed and verified in 2022; our result requires an immediate hard kill and affects consistency between independently persisted state.
  - verdict: not same bug.

