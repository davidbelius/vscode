# Local terminal editor revival ordering: exploration

## Observation and red regression

In the combined-patch local Insiders UI, a panel terminal and a later editor terminal restored correctly, while an additional managed editor returned as a new Bash terminal after a graceful close/reopen. The original tmux session and its running program survived. The saved editor metadata held process ID 2, and the saved buffer held exact managed tmux launch commands for IDs 1–3. The timeline, with volatile identifiers omitted, is:

| Time | Observed event |
| --- | --- |
| 02:00:20.662–.663 | Attach attempts for saved IDs 2 and 3 failed: “Could not find pty.” |
| 02:00:20.747 | Stored buffer revival mapped old IDs 1, 2, and 3 to new IDs 1, 2, and 3. |
| 02:00:20.793 | The additional editor’s saved ID 2 attach failure was logged. |
| 02:00:20.827 | The later editor attached successfully; the additional editor had fallen back to Bash ID 4. |

The timeline and saved-state check are recorded in the project workspace’s `extension-loop-20261109/local-editor-revival-order-diagnostic.json` and `local-editor-revival-order-log-excerpts.json`. The combined build is the UI observation, not proof of a combination-only defect.

A test-only branch from official Insiders baseline `f405fe233bbd3fd0647968e9356c2816362b2b3d` independently reproduces the race at commit `67ec30c0ac2a2ed4864a8d51fffd8b96d71f577e`. It holds saved-buffer revival at environment resolution, requests attachment for a saved editor ID, releases the gate, and requires attachment to the revived PTY. The focused Electron test is red: the racing attach returned `undefined` rather than revived ID 5. A post-revival control attached ID 5 and revival ran once; the client build and typecheck passed. See `extension-loop-20261109/local-editor-revival-order-red.json` in the project workspace.

## Code path, related work, and placement

On the baseline, [`LocalTerminalBackend.attachToRevivedProcess`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/electron-browser/localTerminalBackend.ts) connects to the direct PTY proxy and immediately asks for a revived ID. Separately, `getTerminalLayoutInfo` resolves saved environments and calls `reviveTerminalProcesses`. A connected proxy therefore does not imply saved-process revival has completed; an editor may attempt its old ID before the mapping exists. Current upstream source retains these separate paths.

Related primary sources do not provide this readiness fix:

- [Issue #190749](https://github.com/microsoft/vscode/issues/190749) and [issue #195854](https://github.com/microsoft/vscode/issues/195854) describe similar default-profile fallback on Remote SSH, without establishing this local timing cause.
- [PR #335203](https://github.com/microsoft/vscode/pull/335203) addresses icon preservation after failed attachment, not attachment ordering.
- [PR #168887](https://github.com/microsoft/vscode/pull/168887) changes shutdown serialization, and [PR #151852](https://github.com/microsoft/vscode/pull/151852) introduced editor revival. Both are ancestors of the baseline; neither coordinates this startup race.
- [PR #182631](https://github.com/microsoft/vscode/pull/182631) defers startup, [PR #186938](https://github.com/microsoft/vscode/pull/186938) connects the PTY host on demand, and [PR #186041](https://github.com/microsoft/vscode/pull/186041) parallelizes revival. These are already represented in the baseline and should retain their lazy startup and performance behavior.

Targeted public issue/PR searches and the reviewed upstream code found no exact fix. This is a bounded search result, not proof that none exists. The local current-ID/PID patch handles ID reuse **after** revival; this defect happens **before** revival exists. The remote revival patch repairs a different backend’s routing and arguments. Existing startup/layout patches guard serialized layout, not local editor readiness. The official-baseline red test supports a new independent `local-editor-revival-order` patch; there is no demonstrated patch interaction requiring a super-patch.

A scoped fix should let attachment trigger or join one saved-buffer revival, share that work with concurrent layout and attach requests, and preserve behavior with no saved state or a failed revival. It must not launch the PTY host eagerly on backend construction or discard existing ID/PID safeguards when combined later. This exploration branch records research only.
