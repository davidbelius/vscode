# Terminal editor custom names are lost after close/reopen

## Scope and branches

Research date: 2026-11-07. This branch is `vibecoded/terminal-editor-custom-name/exploration`. The independent regression branch is `vibecoded/terminal-editor-custom-name/unit-test`. Both start at upstream Insiders development commit `f405fe233bbd3fd0647968e9356c2816362b2b3d`. Neither includes patches from the previous attempt. No product fix has been implemented.

## Stock reproduction

The GUI reproduction used official Microsoft VS Code 1.145.2, Linux x64, commit `c4453f8ea430795f941c1b2ff6c9321135a74a02`. The downloaded archive SHA256 was `3b01286639fa026fd860944b811d418f7b93bc5dc447d9e607b0cd1377cfbaa2`. Local tests disabled extensions. Remote tests used Remote-SSH 0.128.0, its supporting extensions, and an empty remote extensions directory. Terminal Sessions was absent. Remote-SSH connected back to an isolated account on the same Linux host; no network-outage claims follow from these tests.

1. Open a folder in a clean profile with persistent terminal sessions enabled.
2. Open a terminal in the editor area and assign a custom name with Terminal: Rename.
3. Keep a panel terminal with a different custom name as a control.
4. Run Developer: Reload Window: both names survive.
5. Close the last VS Code window, then reopen the same folder with the same profile.
6. The panel name survives, but the terminal editor name becomes the shell name, `bash`.

The tested mixed layout had three editor groups: a full-height left group, and two stacked right groups. The lower-right group contained documents and a terminal editor. The panel had three terminals, with the first two split together. Tab order, selected tab positions, group rectangles and panel split grouping survived the tested reloads and close/reopens. Custom panel names `build-A`, `tests-B`, and `logs-C` survived. Editor name `server-D` survived reload but became `bash` after reopen. Renaming to `server-D-repeat` and repeating close/reopen reproduced the loss. A local control similarly lost `local-server-D` while retaining panel name `local-build-A`.

`observations.json` contains the measured group rectangles, tab labels, selected-tab states and panel labels from these trials. It omits environment-identifying text. Earlier automated renames that did not successfully fill the rename prompt are excluded from the evidence. Successful trials explicitly focused that prompt and verified the resulting labels before proceeding.

## Bug versus intended behavior

The terminal developer's [verification instructions for #138509](https://github.com/microsoft/vscode/issues/138509#issuecomment-987332450) explicitly require a user-assigned name to survive restart, while a process-derived title should reset to the new shell's name. This makes custom-name loss a bug, independently of whether the shell process survives.

[Official persistent-session documentation](https://code.visualstudio.com/docs/terminal/advanced#_persistent-sessions) distinguishes process reconnection on reload from process revival after restart. Our ordinary shell PID and exported marker survived remote reload but changed/disappeared after close/reopen. Manually attached tmux sessions survived with unchanged pane PIDs, but their clients did not reattach after close/reopen. That does not, by itself, establish a VS Code bug: relaunching bash does not replay the command previously typed to attach tmux. Automatic tmux launch profiles were not tested.

## Source and log findings

Source was inspected at the exact stock commit and at the fresh Insiders base, rather than trusting the old patched checkout.

- `TerminalInputSerializer._toJson` saves `title` and `titleSource` for editor terminals.
- `TerminalEditorService.reviveInput` creates the instance with `attachPersistentProcess` and `findRevivedId: true`.
- `TerminalInstance` tries to re-establish the saved title after process creation, but only if `attachPersistentProcess` is still present.
- `TerminalProcessManager.createProcess` clears `attachPersistentProcess` when attachment fails, and launches a replacement shell.
- Remote logs from the verified repeat contain `Attach to process failed for terminal`, with the saved title `server-D-repeat` and `titleSource: 0` (API/user rename). The name therefore reached the restoration code; it was not simply omitted during saving.

The lost attachment metadata is a concrete failure path to test. The reason remote attachment fails has not yet been fully diagnosed. The same visible local failure need not have the same cause. One other saved title had source `Config` rather than `Api`; static-title provenance is another possible contributor, not a proven explanation for all cases.

The regression should drive the actual terminal instance through unavailable-process fallback and assert its visible title after a shell-title update. Successful attachment and process-derived titles should be controls. It must not depend on an extension, a live SSH server, tmux, or old product patches. A passing replacement-shell control prevents solving custom-name persistence by incorrectly freezing all process-derived names.

## Upstream discussions and fixes

| Link | Relevance | Fix/status checked 2026-11-07 |
|---|---|---|
| [#139868](https://github.com/microsoft/vscode/issues/139868) | Names lost after restart; does not establish our editor/panel distinction | Closed as not reproducible; reporter said 1.63.2 resolved it; no exact fix linked |
| [#138509](https://github.com/microsoft/vscode/issues/138509) | Explicit custom-name preservation requirement | Fixed by [8bf3e4f](https://github.com/microsoft/vscode/commit/8bf3e4f34ea1fa82a3d4447c2bee6daa6a81923a); older process-title handling issue |
| [#136175](https://github.com/microsoft/vscode/issues/136175) | Remote renamed title lost on reload | Fixed via [#136176](https://github.com/microsoft/vscode/pull/136176); different trigger |
| [#341825](https://github.com/microsoft/vscode/issues/341825) | Remote restored editor bypasses revived-ID lookup | Open; strongest remote attachment lead, not proven duplicate of name loss |
| [#341692](https://github.com/microsoft/vscode/pull/341692) | Avoid attaching to another window's terminal after ID reuse | Merged 2026-10-15; local path only, explicitly excludes remote fix |
| [#190749](https://github.com/microsoft/vscode/issues/190749) | Editor-terminal working directory/profile restoration | Open in backlog; no linked verified fix |
| [#329750](https://github.com/microsoft/vscode/issues/329750) | API-provided editor-terminal icon restoration | Related metadata, not the custom-name issue |

Searches covered official terminal docs and GitHub issue searches for terminal name restart/lost, rename persist, title restore, terminal-editors rename, and terminal editor restore. No exact confirmed duplicate or verified fix for our current reproduction was identified. Historical closure is not evidence that our current failure is fixed.

## Limits and next steps

The GUI trials cover graceful close/reopen and reload, not crashes, server restarts, network outages, multiple client windows or arbitrary layouts. The focused unit regression will isolate one failure path; it will not establish the complete cause of every name-loss variant. Develop and validate a fix only after the regression is red for the expected title mismatch and its controls pass. Keep research updates here and product/test changes on their respective branches.

## Unit regression validation — 2026-11-07

The sibling branch `vibecoded/terminal-editor-custom-name/unit-test`, commit `631cfcb52d6`, adds three cases in `src/vs/workbench/contrib/terminal/test/browser/terminalInstance.test.ts`. It uses the real `TerminalInstance` and process manager with a mocked backend and child process. Attachment is attempted with the saved process ID and PID; the assertion also checks whether a replacement process was created. A process-title update then tests the visible title. The fixture supplies terminal-tab label settings needed by the label computer.

| Case | Result |
|---|---|
| API/custom title, attachment succeeds | Pass: `build-server` remains |
| API/custom title, attachment fails | Expected failure: actual `bash`, expected `build-server`; exactly one replacement process created |
| Process-derived title, attachment fails | Pass: saved `node` changes to `bash` |

Focused run: **2 passing, 1 failing**. Full test file: **114 passing, 2 pending, 1 failing**, with the same single expected regression failure. Targeted ESLint and `git diff --check` passed. No product fix is included. This confirms the metadata-loss fallback path on the current Insiders source; it does not prove why a particular remote process cannot be reattached or cover the serializer end to end.

Reproduction from the unit-test worktree, after installing the pinned dependencies and building the client:

```sh
pnpm run build-fast --client-only
xvfb-run -a scripts/test.sh --no-sandbox --disable-dev-shm-usage --run src/vs/workbench/contrib/terminal/test/browser/terminalInstance.test --grep 'restored terminal editor'
```

Remove `--grep` to run the whole file. Validation used Node 24.22.1, pnpm 12.16.0 and the repository's Electron 43.8.6 on Linux. The client build transpiles and is not a full TypeScript type check. In the test container, the default 64 MB shared-memory mount caused module-loading failures before assertions; `--disable-dev-shm-usage` allowed the runner to load. Container runtime packages were needed for Electron and native dependencies. Temporary runner diagnostics were removed; the committed runner is unchanged.
