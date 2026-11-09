# Terminal layout writes during restoration

Insiders baseline: f405fe233bbd3fd0647968e9356c2816362b2b3d.
Red test: 818f9053876c965007f4d6b6a9cb37e3594eec3b, on the independent unit-test branch.

## Evidence and limits

During the SSH collision-only stress gate (9c19138), a graceful close/reopen lost two panel panes; document geometry survived. A later snapshot still showed one replacement pane. The server survived and its log recorded both original panel processes being revived. Those logs do not establish which layout publication/read caused the loss.

Source inspection found a separate deterministic startup defect: TerminalService registers restored terminal instance dimension listeners before panel reconnection finishes. A dimension event calls the debounced _saveState while the remote layout read is pending. The guard checks shutdown and persistence settings, but not Connecting, so it sends the currently incomplete/empty panel groups to the backend.

The test uses the real TerminalService construction and instance-created/dimensions events, a deferred remote layout read and fake timers. On the untouched baseline, it fails because the backend receives {tabs:[],background:[]} before reconnect completes. It also exercises ordinary saving after connection. This proves the early-write defect independently of the original SSH symptom; the causal link to that symptom remains an inference until traced reproduction confirms it.

A reduced diagnostic sequence passed ten comparisons. A later original-sequence diagnostic encountered transient blank panel titles that subsequently populated; that readiness interruption is distinct from the persistent pane loss. Evidence is retained in the project unified-loop-20261108 directory.

## Online research after the red test (2026-11-08)

Searches covered Microsoft VS Code issues/PRs for terminal layout persistence, startup overwrite, resize during reconnect and saved-layout races. No exact fix was found in the searches performed; this is not a claim that none exists.

- [Current terminalService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/terminalService.ts): the fetched source still has the shutdown/configuration guards without a Connecting check, and dimension changes can request saving.
- [Issue 135687](https://github.com/microsoft/vscode/issues/135687): general request to preserve terminal layout, names, icons and colors. It establishes related intended behavior, not this startup-race fix.
- [Issue 185256](https://github.com/microsoft/vscode/issues/185256) and [PR 185873](https://github.com/microsoft/vscode/pull/185873): delayed pty-host startup/IPC timeout. The merged change addresses a developer-delay channel problem, not early layout publication; do not transplant it.
- [Issue 341502](https://github.com/microsoft/vscode/issues/341502): restoration can attach to reused process IDs. This is the different identity problem already considered for the collision patch.

## Placement and reuse decision

Use a new independent patch, vibecoded/layout/startup-layout-overwrite/{exploration,unit-test,fix}, rooted at the recorded Insiders baseline. This is TerminalService startup ordering, not editor-name serialization, tab-list orientation, historical ID normalization or grid bounds. The baseline reproduces it without the other patches, so it is not a demonstrated patch interaction and does not require a super-patch.

Implement a small service-level correction from scratch; no matching upstream fix was found to reuse. Prevent incomplete layout writes while Connecting, preserve ordinary/intentional empty layout saves after connection, and ensure a correct post-connection save if needed. Retain shutdown protection. Review/test before deployment; do not claim the original SSH failure fixed merely because this regression passes.

Insiders is authoritative. Stable portability and independent/combined UI validation remain required. A new production patch invalidates affected combined gates; unrelated prior independent results remain evidence.


## Traced SSH reproduction (2026-11-09)

The independent collision build 9c19138 again lost the panel split on fresh-pinned-asymmetric close/reopen, after code/terminal/didGetPerformanceMarks had completed. A later snapshot still showed the loss. A traced repetition reproduced the same failure.

Safe trace metadata establishes the ordering: pre-close storage retained panel IDs 211 and 212 and their split proportions; server revival mapped 211→229, 212→230, 218→231 at host time 06:20:39.920; an ordinary layout write with empty tabs arrived at 39.921; the revived-layout publication was empty at 40.013; the following read returned empty tabs at 40.482. Thus an empty startup publication replaced the saved layout before restoration read it. Server filtering cannot explain this particular empty result because both preceding publications were already empty.

This supports applying the existing independent startup guard and baseline regression818f905 rather than duplicating the fix into the collision patch. The collision-only broad SSH gate remains a known failure without the separate startup fix; this is not evidence of a patch interaction requiring a super-patch. Local and persistent-direct-Remote startup and combined gates passed on both releases. SSH startup-only and combined close/reopen validation remain pending. No private traces, terminal buffers, credentials or environment data are included here. Raw evidence is retained privately under the project unified-loop-20261108 directory.
