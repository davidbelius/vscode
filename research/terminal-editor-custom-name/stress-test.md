# Exploratory UI stress test — 2026-11-07

Tested commit 607663aa879, Code OSS development 1.146.0, on the experiment account's existing X display :2. No VNC automation and no Terminal Sessions extension. The deployed terminalInstance.js SHA-256 matches the local build (manifest.json). UI actions use Chromium keyboard/mouse input and command palette, with DOM observations and screenshots. No internal terminal service calls were used to change state.

## Confirmed relevant failure: second restoration loses editor custom name

1. Rename an editor terminal to `double-restore-0`.
2. Close the application window and reopen the same workspace.
3. Observe the custom name survives.
4. Run Developer: Reload Window without renaming again.
5. Observe the name becomes `bash`.

Repeated twice locally, using `double-restore-0` and `double-restore-1`. Also reproduced twice in the remote TestResolver window: `remote-reopen-0` and `remote-reopen-1` survive reopen, then become `bash` on reload. Evidence: double-0-reopen/reload and double-1-reopen/reload JSON and PNG files; actions in reopen-reload.log and actions.jsonl. An earlier occurrence changed `mixed-final-1` to `bash` in split-0-reload. Merely focusing a panel terminal before reload did not reproduce the loss in two trials. The patch is not sufficient for repeated restoration; unit tests need to cover saved/revived state across multiple restorations, not only a single instance lifecycle. Remote logs establish that `remote-reopen-0` was passed to failed attachment with titleSource 0 at reopen, then with titleSource 2 on the next reload. The visible custom label survives while its provenance changes. The exact event that changes provenance still needs a focused test. No production changes made during testing.

## Separate UI issue: empty rename dialog does not clear custom name

Set `clear-ui-check`, open Terminal: Rename, explicitly select all and Backspace, then Enter. Name remains `clear-ui-check` (empty-palette-result.json/png). Source corroborates that renameWithQuickPick invokes rename only for a truthy title. The unit-test API supports clearing, but this UI route does not. Record for separate consideration rather than assuming the unit-tested reset is reachable here.

## Other observation needing reproduction

The panel's `panel-split` disappeared after mixed-0 reload, while the editor terminal names remained. Two focused split/reload trials subsequently preserved two and then three panel panes. Treat the initial disappearance as an unresolved observation, not a diagnosed regression.

## Successful local exercises

Three rounds of rename twice, change cwd, emit shell title, move editor, reload, rename again, relaunch, rename, close/reopen preserved final custom names. The third launch resumed after the harness connection was interrupted. Two mixed editor/panel move cycles preserved renamed titles and three editor groups through reload and reopen. Closing and reopening the workspace preserved document ordering, editor groups and the three panel splits in that trial. Two inactive-editor reload trials preserved the name. Two isolated split/reload trials preserved panel split names and layout.

The early local-rounds `clear` steps were invalid reset attempts: inserting an empty string did not delete selected input. Later empty-palette-result explicitly used Backspace and confirmed the separate UI issue. Some command-label guesses failed before activation (Close Folder versus Workspaces: Close Workspace); these are harness corrections, not application failures.

## Remote coverage

Three remote rounds completed: rename twice, change cwd, move editor → panel → editor, arrange two rows, reload, rename again and relaunch. All preserved the expected custom name. Logs confirm failed process attachment with saved Api title in each reload; replacement shells started at the workspace directory. This establishes name fallback coverage, not shell reconnection success. Two remote close/reopen → reload trials reproduced the same custom-name loss. Remote workspace close/reopen preserved the two editor groups and document tab, with the already-lost terminal name remaining `bash`. The manually attached tmux session survived with the same pane PID (622213), but had no attached client at the end. Uses the built-in TestResolver and a separate development server on the same machine, exercising remote terminal code, but not the Remote SSH transport/extension. Do not generalize its results to SSH disconnects or network outages.

## Investigation lead, not a diagnosis

The revised constructor restores Api title before process creation. The process-ready handler can subsequently install the shell OSC-title listener when shellLaunchConfig.name is empty. A replayed/live shell title may therefore change titleSource while staticTitle still makes the displayed label look correct; a later restoration could expose that mismatch. This is a source-inspection hypothesis to test, not yet proven by internal-state capture.

## Completion

Recorded 58 DOM/screenshot checkpoints and 168 logged actions (including failed command searches). Production branch remains unchanged at 607663aa879. The final remote window is left on display :2 for inspection. This was exploratory testing, not exhaustive coverage or verification of Remote SSH network recovery.
