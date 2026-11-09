# Remote terminal editor revival: exploration (2026-11-09)

Baseline: `f405fe233bbd3fd0647968e9356c2816362b2b3d` (Insiders). This branch records research only; it contains no production patch or test build.

## Reproduction and placement

The independent regression commit `d2a2b7881cad625b2291ff9437fbe447bf740f35` demonstrated that a restored remote editor with `findRevivedId` called `attachToProcess(21)` instead of `attachToRevivedProcess(21, 72265)`; a current remote ID remained a green control. The missing route and workspace argument predated the six-patch integration, so the correction belongs in an independent VS Code core patch (process manager, remote backend, and remote channel), rather than the tmux extension.

The [exact upstream issue #341825](https://github.com/microsoft/vscode/issues/341825) identifies the same two gaps: the remote process manager ignores `findRevivedId`, and `getRevivedPtyNewId` sends `[id]` although the pty service expects `(workspaceId, id)`. It also proposes forwarding the saved PID through the attach RPC. The issue is open and its Development section lists no linked branch or pull request as checked on 2026-11-09. [PR #341692](https://github.com/microsoft/vscode/pull/341692) is the merged local terminal PID safeguard and explicitly leaves the remote path unchanged. [Issue #190749](https://github.com/microsoft/vscode/issues/190749) initially reported a remote editor seemingly reverting to Bash, but the reporter later clarified a working-directory problem; it is related symptom evidence, not a fix for the demonstrated revival path. The older [PR #151852](https://github.com/microsoft/vscode/pull/151852) used a one-argument contract before the workspace-scoped pty service contract and supplies no direct patch here.

## Independent result and safeguards

The reviewed independent Insiders fix is `5bb9d7c4f5073fba30c5fa344e533ae986c62337`; Stable adaptation is `21a397729a4330df85bb1cec4faabe78a9480a02`. It routes `findRevivedId`, sends workspace ID with the old terminal ID, and tries the saved ID with its saved OS PID before a revival mapping. That current-ID-first check prevents a stale mapping from hijacking an already live process. A mismatched known PID without a mapping is rejected; unknown PID (`0`) retains ID-only fallback after lookup. Tests cover current ID, revived ID, PID mismatch, missing/rejected mapping, unknown PID, and wire arguments. Focused and broader test/build results are recorded in the workspace report `tmux-prototype-20261109/remote-editor-revival-fix-20261109.md`.

The separate panel-to-editor launch metadata continuity observation in `vscode-terminal-editor-restoration-issue/remote-revived-id-workspace-diagnosis-20260908.md` remains a watch item. Its behavior must be assessed by live process identity during repeated move and close/reopen stress, not inferred from the saved title.
